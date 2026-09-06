# 52 — REVIEW: Community security and privacy (hostile, read-only)

Reviewed 2026-09-06 against `30-BLUEPRINT.md` §2 (privacy model), §3 (schema +
RPC contracts), §4 (edge functions), §5.1 (transport gates); `40-DECISIONS.md`
SD-04, SD-05, SD-09, SD-11, SD-11a, SD-13, SD-14; CLAUDE.md §2.

Read in full: `supabase/migrate_160_community.sql` (3,837 lines, every helper
and every RPC body), `supabase/functions/community-notify/index.ts`,
`supabase/functions/community-public/index.ts`, `src/lib/community/**`,
`src/lib/observability/sentryScrub.js`, `public/u|p|s/index.html`, the
sign-out wipe path, and the Community screens that hold cache or handle errors.

The security model itself is sound in shape: RLS on with no policy, all table
grants revoked from `anon` and `authenticated`, `search_path` pinned on all 72
functions, `auth.uid()` (never an argument) as the identity on every write, no
dynamic SQL over user input, and a single client transport with the three gates.
The failures below are all *missed predicates inside* that model, not holes in it.

---

## Findings

| # | Sev | Site | Finding |
|---|-----|------|---------|
| 1 | **P0** | `migrate_160_community.sql:2749` | Comments on a followers-only post/programme readable by a non-follower |
| 2 | **P0** | `migrate_160_community.sql:2673` | Non-follower can COMMENT on a followers-only post/programme |
| 3 | **P0** | `migrate_160_community.sql:2621` | Non-follower can REACT to a followers-only post (`v_vis` read, never used) |
| 4 | **P1** | `migrate_160_community.sql:3137,3206` | Programme dimension returns any programme's title/description, ignoring visibility AND blocks |
| 5 | **P1** | `migrate_160_community.sql:995-996` | Followers-only and MINOR profile cards leak `area_label` + `gym_label` to strangers |
| 6 | **P1** | `NotificationSettingsScreen.js:788` + `community-notify` | "Pushes pause in quiet hours" is untrue: quiet hours never leave the device |
| 7 | **P1** | `community-notify/index.ts:170-180` | `follow_accepted` has no recency window: unlimited replay push at any follower |
| 8 | **P1** | `migrate_160_community.sql:2598` | `community_react` has no rate rail: react/unreact loop = unlimited push + activity spam |
| 9 | **P1** | `src/lib/community/activity.js:24`, `feed.js:83` | List RPCs return `{rows, cursor}`; client treats them as arrays. Activity inbox is always empty and the hub throws |
| 10 | P2 | `migrate_160_community.sql:890`, `validation.js:181` | Forbidden-key scan bypassed by whitespace/homoglyph keys; snapshots have no key allow-list |
| 11 | P2 | `migrate_160_community.sql:1600-1637` | `community_leave` does not NULL `reporter_id` on reports the leaver filed |
| 12 | P2 | `migrate_160_community.sql:1754,3252,1895` | Suspended profiles still render in follower lists, activity actor cards and relationships |
| 13 | P2 | `migrate_160_community.sql:745` | `_community_can_view` treats `restricted` as invisible, including to the account itself |
| 14 | P2 | `migrate_160_community.sql:2191` | `community_record_programme_use` needs no view right: bumps `use_count`, pushes to the owner |
| 15 | P2 | `migrate_160_community.sql:1372` | `community_is_moderator` trusts the JWT `email` claim, not a confirmed address |
| 16 | P2 | `migrate_160_community.sql:1346`, `community-public` | Unthrottled handle-existence oracle + unthrottled anonymous profile scrape |
| 17 | P2 | `migrate_160_community.sql:2166` | A `link` programme egresses even when the owner is suspended |
| 18 | P3 | `migrate_160_community.sql:1820,1864` | `community_block` / `community_mute` have no rate rail |
| 19 | P3 | `migrate_160_community.sql:2419` | `community_create_post` accepts any existing `programme_id`, including one the caller cannot view |
| 20 | P3 | `community-public/index.ts:56` | 404s carry `Cache-Control: public, max-age=300` |

---

### 1. P0 — followers-only comment threads readable by anyone holding the post id

`community_list_comments` resolves the target's OWNER and gates on
`_community_can_view(v_uid, v_owner)` (`:2749`). It never reads the post's or
programme's own `visibility` column. `_community_can_view` returns true for any
active **public-profile** owner, so a followers-only post by a public author is
open to every signed-in account.

**Exploit.** A publishes a post with `visibility = 'followers'`. B follows,
sees the post, keeps the id. A then removes B (`community_remove_follower`) or B
unfollows. B calls `community_list_comments('post', <id>)` and reads every
comment body — other users' free text — indefinitely. The same holds for a
`followers` or `link` programme.

**Expected** (blueprint §3): the `followers` case must require an accepted
follow, exactly as `community_get_post:2467-2473` already does.

**Fix.** In `community_list_comments`, select the target's `visibility` beside
its owner and add, for `_target_kind = 'post'` and for programmes:

```sql
IF v_vis = 'followers' AND v_owner <> v_uid
   AND NOT EXISTS (SELECT 1 FROM public.community_follows f
                   WHERE f.follower_id = v_uid AND f.followee_id = v_owner
                     AND f.state = 'accepted') THEN
  RAISE EXCEPTION USING message = 'not_allowed';
END IF;
```

### 2. P0 — non-follower can comment on followers-only content

`community_comment:2673` has the identical gap. A removed follower (or anyone
who ever held the id) can post a comment body onto A's followers-only post; that
comment is then shown to A's real followers and raises an activity row and a push
at A. This is a cross-user WRITE into content the writer has no right to read.
Same fix, same three lines, applied before `_community_rate_check`.

### 3. P0 — non-follower can react to followers-only posts

`community_react:2621` gates only on `_community_can_view`. The intent to check
the post's own visibility is still visible in the code: `v_vis` is declared at
`:2607`, assigned at `:2615` and **never read**. The reaction increments
`reaction_count` shown to genuine followers and fires `_community_add_activity`
plus a push. Fix: use `v_vis` in the same shape as finding 1.

### 4. P1 — programme dimension leaks any programme, past visibility and blocks

`community_dimension(_kind => 'programme', _key => <uuid>)`:
- `:3137` reads `title` into `v_label` filtering only on `status = 'visible'`;
- `:3206` returns `_community_programme_tile` for `WHERE id = _key::uuid` with
  **no** visibility, owner-status, minor or block predicate at all.

**Exploit.** Any signed-in user with a programme uuid — including a user the
owner has BLOCKED, and including a `followers`-only or `link` programme — gets
`title`, `description`, `style_key`, `days_per_week`, `exercise_count`,
`use_count`, `updated_at`. Title and description are user-authored free text.
The block bypass is a direct SD-11 breach ("two-way invisibility").

**Fix.** Apply the `community_get_programme:2160-2175` gate before returning the
tile, and filter `v_label`'s lookup the same way.

### 5. P1 — followers-only and minor cards carry town and gym

`_community_profile_card:995-996` always emits `area_label` and `gym_label`,
whatever the viewer's relationship. Blueprint §2 defines the followers-only card
as "handle, display name, avatar, bio and counts" — area and gym are not in it.

Because every minor is forced to `visibility = 'followers'` (`:1547`), this means
**a minor's town and gym name are returned to any signed-in stranger** who calls
`community_get_profile(<handle>)`. Handles are enumerable: `community_check_handle`
(`:1346`) is an unrate-limited existence oracle, and dictionary handles are cheap.
That is precise-location-adjacent data about a child, against the UK OSA
children's access posture SD-11 records.

**Fix.** In `_community_profile_card`, emit `area_label`/`gym_label`/`goal`/
`setting`/`styles` only when `_viewer = _uid` OR the profile is `public` OR an
accepted follow exists; otherwise NULL them.

### 6. P1 — the quiet-hours promise is not enforceable

`NotificationSettingsScreen.js:788` tells the user, under the new Community
toggles: *"Pushes pause in quiet hours and never arrive while a wellbeing check
is open."* The second clause is true (`community-notify:262-274` fails closed on
the ED flag, and is in fact stricter than `partner-cheer:154-167`, which does not
check `flagErr` at all). The first clause is false.

Quiet hours live only in AsyncStorage (`quietHours.js:18`, `QUIET_HOURS_KEY`) and
are consulted only by the local scheduler. There is no `quiet_hours` column in
any migration, `send-push` has no quiet-hours branch, and `community-notify`
never asks. A stranger's reaction at 03:00 arrives at 03:00.

**Fix (one of, founder's call — the lighter one is not recommended):** sync the
quiet-hours window to `notification_preferences` and have `community-notify`
hold to in-app inside it; or, if that is deferred, the settings line must not
claim it. Note the push budget (`budget.js`) is likewise client-side and so does
not apply to any server-originated Community push.

### 7. P1 — `follow_accepted` push can be replayed forever

`community-notify:170-180` verifies `follow_accepted` by finding
`follower_id = target, followee_id = actor, state = 'accepted'` with **no
`gte('created_at', sinceIso)`** — every other branch has one (`:166`, `:187`,
`:198`, `:219`). The edge exists for as long as the follow does.

**Exploit.** A, with 500 accepted followers, loops `POST /community-notify`
`{kind:'follow_accepted', target_user_id:<each follower>, ref_id:<any uuid>}`.
Each call pushes "@A accepted your follow" at that person. Repeatable without
limit, at any hour (see finding 6), from a plain signed-in JWT. There is no rate
limit anywhere in this function.

**Fix.** Add `.gte('created_at', sinceIso)` to the `follow_accepted` branch, and
add a per-actor rate rail (a `_community_rate_check`-equivalent row, or a
`community_rate_events` insert via the service role) before the `send-push` call.

### 8. P1 — `community_react` bypasses the rate rail entirely

`community_react:2598` performs no `_community_rate_check`. Unreact then react
deletes and re-inserts the row, giving a fresh `created_at`, a fresh
`_community_add_activity` row and a fresh 10-minute window for
`community-notify`'s `reaction` branch. A loop is unlimited push and unlimited
activity-inbox spam at one target. This is the "bypass the rail by calling a
different RPC" case from the brief: the rail exists for profile upsert, follow,
publish, post, comment and report, and is absent here.

**Fix.** `PERFORM public._community_rate_check(v_uid, 'react', 60, 200);` before
the insert branch (limit is a product call; anything bounded closes the loop).

### 9. P1 — the activity inbox never renders, so the ED downgrade path has no record

Every list RPC returns a wrapper object: `community_activity` returns
`{activity, cursor}` (`:3266`), `community_feed` returns `{posts, cursor}`
(`:2537`), and so on for comments, follows, search and dimensions.

- `activity.js:24` does `Array.isArray(rows) ? rows : []` on that object, so
  `loadActivity` **always returns `[]`**.
- `feed.js:83` assigns the wrapper object to `payload.posts`, and
  `CommunityHubScreen.js:154` calls `(hub?.posts ?? []).map(...)` on it —
  `.map` is not a function on an object.
- `feed.js:100 nextCursor` and `CommunityActivityScreen.js:64` build the next
  cursor from `created_at` alone, but `_community_cursor_parts:907` requires
  `ts|uuid` and raises `invalid_input` on anything else.

This is filed here rather than as a plain defect because `community-notify`'s
own comment (`:19-22`, `:25-27`) rests on it: when a push is withheld for an
open ED flag, "the recipient still sees it in-app next time they open
Community." With the inbox permanently empty, the safety downgrade silently
drops the notification altogether.

**Fix.** Unwrap in the client (`data?.activity ?? []`, `data?.posts ?? []`, …)
and carry the server's `cursor` field rather than re-deriving one.

### 10. P2 — forbidden-key scan bypass, and snapshots have no key allow-list

`_community_forbidden_keys:890` matches `t.k = v_key OR lower(t.k) = lower(v_key)`.
Case is handled; whitespace and unicode are not. `"bodyWeight "` (trailing
space), `"body_weight​"` or a Cyrillic `е` all pass. The client mirror
(`validation.js:181`, `SENSITIVE_KEY_SET.has(key)`) is exact-match only, so it
does not catch them either.

Post payloads are saved by the per-kind top-level allow-list
(`community_create_post:2394-2398`), but that list is TOP-LEVEL only: nested
objects (`topSet`, `stats`, `lifts`, `exercises`) are unconstrained, and
`_community_validate_snapshot:1930` checks size, day count, exercise count and
forbidden keys but never restricts which keys an exercise or day may carry. A
tampered client can therefore store body data inside a snapshot, and
`community-public:139` serves that snapshot verbatim to the anonymous web.

Self-disclosure by a tampered client, hence P2 — but SD-04 states the server
"rejects any payload whose recursive key set intersects" the list, and it does
not.

**Fix.** Compare on `btrim(lower(normalize(v_key, NFKC)))`, and add an explicit
key allow-list for snapshot day and exercise objects (the §5.2 shape).

### 11. P2 — leaving Community keeps the leaver named on reports they filed

Blueprint §2: "Reports they filed keep their reporter as NULL." `community_leave`
(`:1600-1637`) writes the withdrawal row, deletes activity and the profile, and
never touches `community_reports`. `delete_user_data` does it correctly
(`:3782`), so only the leave path is wrong.

**Fix.** `UPDATE public.community_reports SET reporter_id = NULL WHERE reporter_id = v_uid;`
before the profile delete. Note this also releases the three-distinct-reporter
count in `_community_auto_hide:1088`, which is the correct behaviour for a
withdrawn member.

### 12. P2 — suspension is not invisible everywhere

SD-11a added the suspended-author exclusion to the Following feed (`:2506`) and
the comment list (`:2757`). Three egresses were missed, all via
`_community_profile_card`, which has no status predicate:

- `community_list_follows:1804` — a suspended account still appears in follower
  and following lists;
- `community_activity:3252` — a suspended actor's card still renders in the
  inbox;
- `community_relationships:1908` — blocked/muted lists (defensible, since these
  are the viewer's own records).

**Fix.** Filter `p.status <> 'suspended'` in the follows page and the activity
page, or return NULL from `_community_profile_card` for a suspended target when
`_viewer <> _uid`.

### 13. P2 — `restricted` behaves as `suspended` for visibility

`_community_can_view:745` requires `p.status = 'active'` **before** the
`_viewer = _owner` branch, so a restricted account cannot view its own posts,
programmes, follower list or comment threads, and its existing content vanishes
from its followers. `_community_require_profile:1035-1053` shows the intent:
restricted means "can read, cannot write". Moderation therefore has no
proportionate middle step. **Fix:** hoist `_viewer = _owner` above the status
test, and use `p.status <> 'suspended'`.

### 14. P2 — programme use recorded without a view right

`community_record_programme_use:2191` checks `status = 'visible'` and the block
list, but never `_community_can_view` or the programme's own visibility. Any
signed-in user with a uuid can bump a private programme's `use_count` and drive
a "@x is using your programme" push at its owner. **Fix:** reuse the
`community_get_programme:2160-2175` gate.

### 15. P2 — moderator identity comes from the JWT email claim

`community_is_moderator:1372` reads `auth.jwt() ->> 'email'`. The claim is
signed, but it reflects the auth record rather than a *confirmed* address; if
email confirmation is ever relaxed, or an unconfirmed change lands in a token,
registering the seeded address grants `community_moderation_queue` — which
exposes reported profiles' handles and bios and full comment bodies. This mirrors
`marketing_admins` (migrate_121) so it is house style, not a regression.

**Fix.** `EXISTS (SELECT 1 FROM auth.users u JOIN public.community_moderators m
ON lower(m.email) = lower(u.email) WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL)`.

### 16. P2 — enumeration surfaces

`community_check_handle:1346` is an unlimited existence oracle for every handle
(no rate rail), and `community-public?kind=profile&h=` is anonymous and
unthrottled, returning handle, display name, bio, area, gym, follower count, up
to 20 programme tiles and 10 full post payloads. Together they permit a complete
scrape of the public directory, and they are what makes finding 5 reachable.
**Fix:** rate-rail `community_check_handle` (e.g. 60/day), and add a per-IP
throttle to `community-public`.

### 17. P2 — `link` programmes outlive suspension

`community_get_programme:2166` skips `_community_can_view` entirely for
`visibility = 'link'`, and `_community_can_view` is the only place the owner's
`status` is checked on that path. A suspended owner's link programme is still
served in-app. (`community-public:132-134` gets this right.)
**Fix:** check the owner's `status = 'active'` before the `link` branch.

### 18-20. P3

- `community_block:1820` / `community_mute:1864` have no rate rail; a script can
  insert unbounded rows into two tables that every read path joins against.
- `community_create_post:2419` validates only that `_programme_id` EXISTS, not
  that the caller may see it. No leak today (every render re-fetches through
  `community_get_programme`), but it lets a user staple a stranger's private
  programme id onto a public post.
- `community-public/index.ts:56` sets `Cache-Control: public, max-age=300` on
  the 404 response too, so a profile that has just been made public stays
  invisible at shared caches for five minutes.

---

## Checklist

| # | Area | Result |
|---|------|--------|
| 1 | Cross-user reads via feed / dimension / search / get_post / comments / suggestions / my_programmes / mod queue | **FAIL** — findings 1, 4 |
| 2 | Blocks, both directions, including stale activity and existing edges | **FAIL** — finding 4 (block bypass). Otherwise strong: `community_block:1836-1846` deletes both edges and both activity directions; every list carries `_community_is_blocked` |
| 3 | Minors excluded from every list | **FAIL** — finding 5. Lists themselves are correct: `is_minor = false` on search `:2857`, suggestions `:2857`, dimensions `:3045`, discover posts `:2570`, programmes `:2299`, community-public `:83` |
| 4 | Suspended / restricted egress and writes | **FAIL** — findings 12, 13, 17 |
| 5 | Input validation, injection, escaping | **FAIL** — finding 10. Web pages PASS: every user string on `/u`, `/p`, `/s` goes through `textContent`; `innerHTML` is only ever `''`; cursor parse is fail-closed (`:907`); `_limit` clamped 1..50 (`:926`); LIKE wildcards cannot survive `_community_fold` |
| 6 | Rate limits and side-effect ordering | **FAIL** — findings 7, 8, 18. Where the rail exists it is correct: DB clock only, checked after validation so a refusal costs nothing |
| 7 | SECURITY DEFINER hygiene, anon reach, spoofing | **PASS with P2** — `search_path` pinned on all 72 functions; helpers revoked from `authenticated`; RPCs revoked from `anon`; no dynamic SQL over user input; no RPC writes on a passed id. Findings 15, 16 |
| 8 | Deletion and erasure | **PASS with P2** — `delete_user_data` covers all 14 tables two-sidedly (`:3760-3800`) and `delete-account` calls it. Finding 11 |
| 9 | Client isolation | **PASS** — `deviceWipe.js` clears AsyncStorage with an empty survivor list and verifies; both caches are uid-keyed and both read/write guard on `!uid`, so the `_unknown` key is unreachable; `getSupabaseClient` appears only in `transport.js:29,151`; gates fail closed on unresolved consent; `notify.js:35` swallows by design |
| 10 | Observability | **PASS** — no handle, bio, caption or comment body in any context object; scrub carries `^handle`, `^display_name`, `^bio$`, `^caption`, `^comment`, `^body$` and the value substring `community_`, which redacts any PostgREST string naming a community table |
| 11 | ED-safety | **FAIL** — findings 6, 9. Code itself is clean: `community-notify` fails closed on `flagErr` (stricter than `partner-cheer`), no Community module reads `ed_pattern_flags`/`scoff`, `CommunityAdaptScreen.js:52` says only "Clashes with a limitation" |
| 12 | Data residency | **PASS** — the only hosts reached are the EU project's `*.supabase.co` functions origin and store links; no third-party host in client or functions |

---

## Verdict

**NOT SHIPPABLE as it stands.** Three P0 access-control gaps (1-3) all share one
root cause: `_community_can_view` answers "may I see this PERSON?", and four call
sites use it to answer "may I see this POST?" without the second predicate that
`community_get_post` and `community_get_profile` already carry. Fixing that one
pattern in `community_react`, `community_comment`, `community_list_comments` and
the `community_dimension` programme branch closes findings 1-4. Findings 5-9 are
each a single-site fix. Nothing here requires re-architecting the model.
