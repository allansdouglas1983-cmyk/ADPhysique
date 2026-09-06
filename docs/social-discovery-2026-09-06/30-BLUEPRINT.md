# 30 — BLUEPRINT: Volyume Community (the build spec and the edit-gate spec)

Authority: founder brief 2026-09-06 (Social / Community / Discovery);
rulings SD-01..SD-16 in `40-DECISIONS.md`; evidence `01`..`05`, `10`..`13`,
synthesis `20`. Every Section 2 inviolable of CLAUDE.md binds this spec.
Agents build FROM this file; anything not specified here is resolved by
STOPPING and reporting, not by interpreting.

Hard bounds for every lane:
- The coaching engine stays pure and untouched. Adaptation composes
  existing exported functions; it adds no engine code and no randomness.
- No ED-safety module is edited. The ED-flag check in the new edge
  function copies the `partner-cheer` shape (fail closed to in-app).
- No new npm dependency. No storage bucket. No realtime.
- British English everywhere; no em dash in user-facing copy; calm voice,
  no clipped commands, no shame.
- All colours, spacing, radii and type from `src/styles/theme.js` tokens.
- Migrations are additive and idempotent with the mandatory header; the
  cloud migration is WRITTEN, NOT APPLIED (founder gate).
- Agents never commit, push, stash or touch main.

---

## 1. Naming, information architecture, navigation

- The destination is **Community**. Screen title "Community". Internal
  route names use the `Community` prefix. Domain folder
  `src/lib/community/`, components `src/components/community/`, screens
  `src/screens/Community*Screen.js`.
- All Community screens are registered in `HomeStack` (RootNavigator),
  pushed (slide), `headerShown: false`, each rendering `BackHeader`.
- Entry points:
  1. Today root: `ScreenHeader` `right` node = a 34 dp round pressable with
     the `people-outline` glyph (amber) on `surface2` with a hairline
     border, matching the brand-mark box it replaces on that screen; an
     amber dot (6 dp) at its top-right when `unseenActivity > 0` or
     `pendingFollowRequests > 0` (from the cached `me` payload).
     Accessibility label "Community". Navigates to `Community`.
  2. Coach (YouScreen) Support section: the row that was "Partners"
     becomes "Community" with `people-outline`, sub "Programmes, training
     stories and people". `navigateCrossTab(navigation, 'HomeTab',
     'Community')`.
  3. Train (PlansScreen): a `NavRow`-style card "Programmes from the
     community" with sub "Use or adapt what other lifters have built",
     placed under the user's plans list. Navigates to `Community` with
     `{ segment: 'discover', focus: 'programmes' }`.
  4. Progress: the "Partners" tile is removed (no replacement; Community is
     not a stat).
  5. PlanDetail: action "Share programme" (secondary Button, `share-social-
     outline`) -> `CommunityPublishProgramme { planId }`.
  6. WorkoutSummary: where the Partners "share with your partner" beat was,
     a secondary Button "Post to Community" -> `CommunityCompose { kind:
     'session', workoutId }`. Hidden when the user has no Community
     profile? NO: always shown; the compose screen routes to Join first.
  7. ShareCardScreen: for `pr`, `milestone`, `session` a secondary Button
     "Post to Community" beside "Share image" -> `CommunityCompose` with
     the same params the card was built from. Not shown for `weekly` or
     `beforeAfter` (weekly carries progress content; before/after is
     photo content, SD-04).
  8. Today block-complete state: a tertiary link "Share this block" ->
     `CommunityCompose { kind: 'block', mesocycleId }`.
- Routes and params:
  `Community { segment?: 'following'|'discover', focus?: 'programmes'|'people' }`,
  `CommunitySearch { q?, tab?: 'people'|'programmes' }`,
  `CommunityProfile { handle?, userId? }`,
  `CommunityJoin { next?: {screen, params} }`,
  `CommunityEditProfile`,
  `CommunityProgramme { id }`, `CommunityAdapt { id }`,
  `CommunityPublishProgramme { planId }`,
  `CommunityPost { id }`, `CommunityCompose { kind, workoutId?, mesocycleId?, pr?, milestone? }`,
  `CommunityActivity`, `CommunityDimension { kind: 'style'|'programme'|'gym'|'area', key, label }`,
  `CommunityRules`, `CommunityPrivacy`, `CommunityModeration`.
- Deep links (linking config): `community` -> Community;
  `u` with query `h` -> CommunityProfile `{handle}` ; `p` with query `id`
  -> CommunityProgramme `{id}`; `s` with query `id` -> CommunityPost
  `{id}`; the existing `partner/:code?` path now maps to `Community` with
  `{ legacyPartnerCode: code }`. Prefixes unchanged.

## 2. Privacy model

- Never enters Community: bodyweight, body composition, Progress Scan,
  nutrition, injuries and limitations (capability rules), coaching output,
  check-ins, progress photos, first name, date of birth, email, height,
  age. `SENSITIVE_COMMUNITY_KEYS` in `src/lib/community/validation.js`
  lists the forbidden payload keys; the server rejects any payload whose
  recursive key set intersects it. Sentry scrub patterns gain
  `^handle`, `^display_name`, `^bio`, `^caption`, `^comment`, `^body$`
  and the value substring `community_`.
- Visibility: profile `public` (anyone signed in can view and follow
  instantly; appears in search, suggestions, dimensions, Discover) or
  `followers` (card shows handle, display name, avatar, bio and counts;
  posts and programmes only to accepted followers; follow creates a
  request). Programmes: `public`, `followers`, `link` (anyone signed in
  who has the id; not listed). Posts: `public` or `followers`.
- Minors: `is_minor` computed server-side from the caller's own
  `user_body_profile.date_of_birth` at every profile upsert (null DOB =
  not minor, as the app already requires age at onboarding). Minors are
  forced to `followers` visibility and excluded from search, suggestions,
  dimension lists, Discover and the public web function. They can still
  share their profile link directly.
- Blocks: two-way invisibility. A blocked user cannot see the blocker's
  profile, posts, programmes or comments, cannot follow, react or
  comment; both follow edges are deleted on block. Search and suggestions
  exclude both directions.
- Mutes: the muter stops seeing the muted user's posts in Following and
  Discover; nothing else changes; the muted user is not told.
- Consent: `community_visibility` on the consent_log rail (CHECK widened;
  `notice_version` = `COMMUNITY_RULES_VERSION` = 1). Leaving Community
  appends a `granted=false` row and deletes every Community row the user
  authored (profile, posts, comments, reactions, follows both ways,
  programmes, activity). Reports they filed keep their reporter as NULL.
- Erasure cascade: `delete_user_data()` re-issued with every
  `community_*` table (two-sided deletes for follows, blocks, mutes,
  activity; `community_moderation_log.moderator_id` set null).

## 3. Cloud migration `supabase/migrate_160_community.sql` (WRITTEN, NOT APPLIED)

Header per the house template (Purpose / Push / Pull / Applied locally: N/A,
no local table / Applied remotely: NO, awaiting the founder's exact phrase /
Safe to re-run: YES / Rollback / GDPR note: new user-generated content
category, consent `community_visibility`, EU-Dublin only).

Tables (all `public`, `RLS ENABLE`, NO policies for `authenticated`;
`REVOKE ALL ... FROM anon, authenticated` then grant nothing; RPCs are
SECURITY DEFINER with `SET search_path = public, pg_temp`, `EXECUTE`
revoked from PUBLIC and granted to `authenticated` only):

```
community_profiles(
  user_id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,            -- lowercase ^[a-z0-9_]{3,20}$, no leading/trailing _
  display_name text NOT NULL,             -- 1..40 trimmed
  avatar_preset text,                     -- one of the app preset keys or NULL (initials)
  bio text,                               -- <=160
  styles text[] NOT NULL DEFAULT '{}',    -- <=3 of the allowed style keys
  goal text,                              -- 'build_muscle'|'get_stronger'|'general_fitness'|'returning'
  setting text,                           -- 'commercial_gym'|'home_gym'|'minimal_kit'
  area_label text, area_key text,         -- <=40; key = lower, unaccent-free ascii fold, collapse spaces
  gym_label text, gym_key text,           -- <=60; key = area_key || ':' || folded gym label
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers')),
  is_minor boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','suspended')),
  rules_version int NOT NULL,
  follower_count int NOT NULL DEFAULT 0, following_count int NOT NULL DEFAULT 0,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())
community_follows(follower_id uuid, followee_id uuid, state text CHECK (state IN ('requested','accepted')),
  created_at, PRIMARY KEY (follower_id, followee_id), both FK -> community_profiles ON DELETE CASCADE)
community_blocks(blocker_id, blocked_id, created_at, PK both)      -- FK -> auth.users ON DELETE CASCADE
community_mutes(muter_id, muted_id, created_at, PK both)
community_programmes(id uuid PK DEFAULT gen_random_uuid(), owner_id uuid FK -> community_profiles ON DELETE CASCADE,
  source_plan_id text NOT NULL, title text NOT NULL, description text, style_key text,
  split_type text, difficulty text, days_per_week int NOT NULL, exercise_count int NOT NULL,
  has_circuits boolean NOT NULL DEFAULT false, snapshot jsonb NOT NULL, version int NOT NULL DEFAULT 1,
  visibility text NOT NULL CHECK (visibility IN ('public','followers','link')),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  use_count int NOT NULL DEFAULT 0, created_at, updated_at, UNIQUE (owner_id, source_plan_id))
community_programme_uses(programme_id uuid FK ON DELETE CASCADE, user_id uuid, mode text CHECK (mode IN ('use','adapt')),
  created_at, PK (programme_id, user_id))
community_posts(id uuid PK, author_id uuid FK -> community_profiles ON DELETE CASCADE,
  kind text CHECK (kind IN ('pr','session','block','milestone','programme')),
  payload jsonb NOT NULL, caption text, programme_id uuid NULL FK -> community_programmes ON DELETE SET NULL,
  visibility text CHECK (visibility IN ('public','followers')),
  status text DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  reaction_count int DEFAULT 0, comment_count int DEFAULT 0, created_at, updated_at)
community_reactions(post_id uuid FK ON DELETE CASCADE, user_id uuid, created_at, PK (post_id, user_id))
community_comments(id uuid PK, target_kind text CHECK (target_kind IN ('post','programme')), target_id uuid NOT NULL,
  author_id uuid FK -> community_profiles ON DELETE CASCADE, body text NOT NULL,
  status text DEFAULT 'visible' CHECK (status IN ('visible','hidden')), created_at, updated_at)
community_reports(id uuid PK, reporter_id uuid NULL FK -> auth.users ON DELETE SET NULL,
  target_kind text CHECK (target_kind IN ('profile','post','comment','programme')), target_id uuid NOT NULL,
  target_owner_id uuid NULL, reason text CHECK (reason IN ('spam','harassment','impersonation',
  'harmful_body_or_eating_content','inappropriate','other')), detail text,
  status text DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  priority boolean DEFAULT false, created_at, resolved_at, resolved_by uuid NULL, resolution text)
community_moderators(email text PK)     -- seeded like marketing_admins (migrate_121) with the same email, ON CONFLICT DO NOTHING
community_moderation_log(id uuid PK, moderator_id uuid NULL, action text, target_kind text, target_id uuid,
  report_id uuid NULL, note text, created_at)
community_activity(id uuid PK, user_id uuid FK -> community_profiles ON DELETE CASCADE, actor_id uuid NULL,
  kind text CHECK (kind IN ('follow','follow_request','follow_accepted','reaction','comment','programme_used')),
  target_kind text NULL, target_id uuid NULL, seen_at timestamptz NULL, created_at)
community_rate_events(user_id uuid, action text, created_at)  -- index (user_id, action, created_at); rows older than 7 days are deleted opportunistically inside the rate check
```

Helper functions (internal, EXECUTE revoked from authenticated):
`_community_fold(text)` (lowercase, strip accents via translate of the
common Latin set, collapse whitespace, trim), `_community_is_blocked(a,b)`
(either direction), `_community_can_view(viewer, owner)` (owner active,
not blocked, and public or self or accepted follow),
`_community_minor(uid)`, `_community_rate_check(uid, action, limit_new,
limit_established)` (raises `rate_limited` when the 24 h count reaches
the limit; "new" = profile created < 7 days ago), `_community_clean_text
(text)` (raises `content_not_allowed` if it matches the shared blocked
word list `_community_blocked_terms()`; the list is the same array as
`BLOCKED_TERMS` in `src/lib/community/keywordFilter.js`),
`_community_forbidden_keys(jsonb)` (raises `forbidden_field` when any
key, at any depth, is in the forbidden list mirrored from
`SENSITIVE_COMMUNITY_KEYS`), `_community_profile_card(uid, viewer)`
(jsonb card: user_id, handle, display_name, avatar_preset, bio, styles,
goal, setting, area_label, gym_label, visibility, follower_count,
following_count, relationship {following: 'none'|'requested'|'accepted',
followed_by: bool, muted: bool, blocked: bool}).

RPCs (all return jsonb unless stated; errors raise with these exact
messages: `not_signed_in`, `no_profile`, `profile_restricted`,
`profile_suspended`, `handle_taken`, `handle_invalid`, `invalid_input`,
`content_not_allowed`, `forbidden_field`, `rate_limited`, `blocked`,
`not_found`, `not_allowed`, `already_reported`, `not_moderator`):

- `community_check_handle(h text) -> boolean`
- `community_get_me()` -> `{ profile: card|null, pending_requests: int,
  unseen_activity: int, is_moderator: bool, is_minor: bool,
  rules_version: int }`
- `community_upsert_profile(p jsonb)` -> card. Keys: handle, display_name,
  avatar_preset, bio, styles, goal, setting, area_label, gym_label,
  visibility, accept_rules_version. On create: requires
  accept_rules_version = current; inserts consent_log
  (`community_visibility`, granted=true, notice_version); converts active
  partnerships to accepted mutual follows both ways (both members must
  have profiles); rate 5/day. Handle changes allowed 1/30 days (store
  `handle_changed_at`). Minor rule applied every call.
- `community_leave()` -> `{ok}`; consent withdrawal row; cascade delete.
- `community_follow(target uuid)` -> `{state}`; `community_unfollow(target)`;
  `community_respond_follow(requester uuid, accept boolean)`;
  `community_remove_follower(follower uuid)`;
  `community_list_follows(uid uuid, kind 'followers'|'following', cursor, limit)`
  (only when `_community_can_view`; requests visible to owner only).
  Follow limits: 30/day new, 100/day established; 2,000 following cap.
- `community_block(target)`, `community_unblock(target)`, `community_mute(target)`,
  `community_unmute(target)`, `community_relationships()` -> `{blocked: [cards], muted: [cards]}`.
- `community_publish_programme(p jsonb)` -> `{id, version}`; keys:
  source_plan_id, title, description, style_key, split_type, difficulty,
  days_per_week, snapshot, visibility. Validates snapshot per §5.2 (size
  <= 64 KB, <= 8 days, <= 20 exercises per day, forbidden keys), cleans
  title/description/notes; upsert on (owner, source_plan_id) bumping
  version. Rate 10/day.
- `community_unpublish_programme(id)`; `community_get_programme(id)` ->
  `{programme, creator: card, my_use: mode|null, comments_count}` where
  programme excludes nothing from the snapshot (it is structure only);
  `community_record_programme_use(id, mode)` (increments use_count once
  per user; writes activity `programme_used` for the owner);
  `community_my_programmes()`; `community_search_programmes(q, style, cursor, limit)`
  (public + visible + owner public + not blocked + owner not minor;
  order: title prefix match first, then updated_at desc);
  `community_discover_programmes(style, cursor, limit)`.
- `community_create_post(kind, payload jsonb, caption, programme_id, visibility)`
  -> `{id}`; payload allow-list per kind (§5.4); caption <= 280; rate
  3/day new, 10/day established; `community_delete_post(id)`;
  `community_get_post(id)` -> `{post, author: card, my_reaction: bool}`;
  `community_feed(cursor, limit)` (own + accepted follows, minus muted,
  visible, newest first, cursor = created_at|id);
  `community_discover_posts(cursor, limit)` (public posts by public
  active non-minor authors, minus blocked/muted; chronological);
  `community_react(post_id, on boolean)`; `community_comment(target_kind,
  target_id, body)` (body <= 500; rate 10/hour new, 30/hour established;
  target must be viewable; writes activity `comment` to the target
  owner unless self); `community_delete_comment(id)` (author or target
  owner); `community_list_comments(target_kind, target_id, cursor, limit)`
  (excludes blocked authors both ways, hidden rows).
- `community_search_people(q, limit)` -> cards; `q` folded; handle prefix
  OR display_name prefix-of-word; public, active, non-minor, not blocked.
- `community_suggested_people(limit)` -> `[{card, reasons: text[]}]`;
  scoring per SD-09 with these reason strings: "Uses a programme you use",
  "Also trains <style label>", "Trains at <gym label>", "Lists <area
  label>", "Same goal", "Followed by <n> you follow". Minimum score 1.
- `community_get_profile(handle text, uid uuid)` -> `{card, viewable,
  posts: [...] (when viewable; latest 20), programmes: [...] (viewable)}`.
- `community_dimensions_me()` -> `{ dimensions: [{kind, key, label, count}] }`
  counting OTHER public active non-minor profiles per style / gym_key /
  area_key / programme (programmes I published or use); every dimension
  with count >= 1 is returned; the client decides hub surfacing at >= 3.
- `community_dimension(kind, key, cursor, limit)` -> `{label, count,
  people: [cards], programmes: [...]}`.
- `community_activity(cursor, limit)` -> `[{id, kind, actor: card,
  target_kind, target_id, preview, created_at, seen}]`;
  `community_mark_activity_seen()`.
- `community_report(target_kind, target_id, reason, detail)` -> `{id}`;
  one open report per (reporter, target); rate 20/day; sets
  `priority = (reason = 'harmful_body_or_eating_content')`; when a post,
  comment or programme reaches 3 distinct open reports its status flips
  to `hidden` (auto first line).
- `community_is_moderator() -> boolean` (email in community_moderators);
  `community_moderation_queue(status, cursor, limit)`;
  `community_moderate(report_id, action, note)` with actions `dismiss`,
  `hide_content`, `unhide_content`, `delete_content`, `restrict_account`,
  `unrestrict_account`, `suspend_account`, `unsuspend_account`; every
  call writes `community_moderation_log` and closes the report
  (`actioned`/`dismissed`).
- Counters maintained by triggers: follower/following counts on accepted
  follows; reaction_count; comment_count; `updated_at` touch triggers.
- `delete_user_data()` re-issued in full (copy migrate_154's body, append
  the community deletes before the users_profile delete).
- consent_log CHECK widened to add `community_visibility` (do $$ block,
  same shape as migrate_102).
- Acceptance check at the end over `information_schema.tables` for all
  community tables.

`scripts/security/supabase-matrix.targets.json`: every community table
gets disposition `rpc_only`; every RPC name above is appended to
`clientRpcNames`. `supabase/README.md` status block: "160 WRITTEN, NOT
APPLIED (Community; founder gate)" plus a ledger row.

## 4. Edge functions

`supabase/functions/community-notify/index.ts` (client-invoked, JWT
verified). Body `{ kind: 'follow'|'follow_request'|'follow_accepted'|
'reaction'|'comment'|'programme_used', target_user_id, ref_id }`. Steps:
verify the caller is the actor of a matching row written in the last 10
minutes (follow edge / reaction / comment / programme use); recipient
must not block the actor; read `notification_preferences` for the
recipient's category (`community_follow` for the three follow kinds,
`community_activity` for the rest) and stop if disabled; check the
recipient's open ED flag exactly as `partner-cheer` does (fail closed:
any read error = in-app only); otherwise POST `send-push` with
`{ user_id, title, body, data: { type: 'community_follow'|
'community_activity', ref_id, actor_handle } }`. Copy: "@handle followed
you" / "@handle asked to follow you" / "@handle accepted your follow" /
"@handle reacted to your post" / "@handle commented on your post" /
"@handle is using your programme". Response `{ok, delivered}`. Bounded
JSON via `_shared/boundedJson.ts`.

`supabase/functions/community-public/index.ts` (anon GET, no JWT).
Query `kind=programme&id=` | `kind=post&id=` | `kind=profile&h=`. Uses the
service role but returns ONLY the allow-listed fields: programme
{title, description, style_key, days_per_week, exercise_count,
has_circuits, snapshot, creator: {handle, display_name, avatar_preset},
use_count, updated_at} when visibility in ('public','link'), status
visible, creator public + active + not minor; post {kind, payload,
caption, created_at, author card} when public and author public; profile
{handle, display_name, avatar_preset, bio, styles, goal, setting,
area_label, gym_label, follower_count, programmes: [id,title,...] (public
only), posts: latest 10 public} when public. 404 otherwise. Headers:
`Cache-Control: public, max-age=300`, CORS `*` for GET.

## 5. Client library `src/lib/community/`

### 5.1 `transport.js`
`callCommunity(name, params)` -> data. Gates in order: `isSignOutWiping()`
-> throw `sign_out_wiping`; store `healthConsent !== true` -> throw
`health_consent_unresolved`; `hasLiveSession() === false` -> throw
`not_signed_in`. Then `getSupabaseClient().rpc(name, params)`; a
PostgREST error whose message is one of the known codes is rethrown as
`CommunityError(code)`; network errors as `CommunityError('offline')`.
`invokeCommunityFunction(name, body)` for edge functions, same gates.
`logError('Community.<name>', e, { name })` on unexpected errors only.
This module is the ONLY file in `src/` outside the sync layer that may
import `getSupabaseClient` for Community.

### 5.2 `snapshot.js` (PURE)
`buildProgrammeSnapshot({ programme, routines, exercisesByRoutine })` ->
```
{ v: 1, title, description, style_key, split_type, difficulty, days_per_week,
  days: [{ name, position, exercises: [{ exercise_id, exercise_name, order,
    sets, reps_min, reps_max, rest_seconds, notes, superset_group_id,
    group_kind, round_rest_seconds }] }] }
```
`style_key = styleKeyFromTags(programme.tags)`. Exercise `notes` capped at
200 chars. Personal columns never read. `validateSnapshot(s)` -> `{ok,
errors[]}` (shape, caps, forbidden keys). `snapshotStats(s)` ->
`{days, exercises, hasCircuits, circuitGroups}`. `snapshotTags(s)` ->
the tags string to write on import: `style:<key>` when present plus
`community` (so the style lock and swap pools work).

### 5.3 `importProgramme.js`
`importSnapshotAsPlan(userId, snapshot, { communityId, mode })` -> `{plan,
unresolved: [names]}`. Writes with `createProgramme(userId, title,
description, 0, snapshotTags(s), split_type, difficulty)`, then
`createRoutine` per day in order, `UPDATE routines SET programme_id,
position`, then `addExerciseToRoutine(routineId, exerciseId, order,
reps_min, reps_max, notes, sets, null /*startingWeight*/, rest_seconds,
superset_group_id, true, null, group_kind, round_rest_seconds)`.
Exercise resolution: `getAllExercises()` map by id; if `exercise_id` is
present locally use it; else `canonicalExerciseId(exercise_name)` if
present locally; else write the row with the snapshot id and
`exercise_name` (the display fallback) and report it in `unresolved`.
`source_programme_id` set to `community:<communityId>`.

### 5.4 `adapt.js`
`planAdaptation(snapshot, ctx)` PURE where `ctx = { library, byId,
isEligibleRow, isCandidate, blockingConflictsFor, equipment }`:
for each exercise in each day, `exercise = byId.get(id) ?? byId.get(
canonicalExerciseId(name))`; if missing -> keep, change `{reason:
'unknown_exercise'}`; conflicts = `blockingConflictsFor(exercise).filter(
c => !c.unknown)`; reachable = `equipmentReachable(exercise, equipment)`;
eligible = `isEligibleRow(exercise)`; if conflicts.length || !reachable
|| !eligible -> `sub = bestEligibleSubstitute(exercise, library,
isEligibleRow, taken, isCandidate)`; push change `{day, order, from:
exercise, to: sub|null, reason: 'limitation'|'equipment'|'excluded',
kept: !sub}`; taken tracks ids per day. Group fields untouched. Returns
`{changes, substitutions, kept, daysMismatch: snapshot.days_per_week vs
ctx.daysPerWeek}`.
`loadAdaptationContext(userId, snapshot)` (I/O) builds ctx from
`loadCapabilityResolveState`, `loadScopedIntentState`,
`substituteSeniorQuestion` (export it from sessionEffective.js if not
exported; if it is not exportable without touching engine logic, STOP
and report), `loadSubstituteScope(userId, { planTags: snapshotTags(s),
equipment })`, `getAllExercises()`, `blockingConflicts`, the store's
`userProfile.equipment` and `daysPerWeek`.
`applyAdaptation(userId, snapshot, changes, { communityId })` -> imports
as-is (5.3) then for each change with `to`, calls
`updateRoutineExerciseExercise(rowId, to.id)` on the matching row (by
day position + order) so reps/rest are re-derived and the swap is
recorded exactly as every swap is. Returns `{plan, applied, kept,
unresolved}`.

### 5.5 `posts.js`
Payload builders (I/O over local reads, PURE shaping):
`buildPrPayload({exerciseName, weight, reps, units, previousBest, date})`,
`buildSessionPayload(workoutId)` (from `sessionShareData` helpers:
sessionName, workingSets, duration, tonnage, exerciseCount, exercises
(names only, <= 8), prCount, topSet, intensityTier, units, planName, date),
`buildBlockPayload(mesocycleId)` (planName, weeks, sessions, sessionsPerWeek,
completedAt, lifts: up to 3 `{exerciseName, deltaKg, units}` from the
block ledger / best lifts when available, else []),
`buildMilestonePayload(recap)` (eyebrow, title, heroValue, heroUnit, caption,
stats <= 3), `buildProgrammePayload(programmeRow)` (id, title, style_key,
days_per_week, exercise_count). `POST_PAYLOAD_KEYS[kind]` is the exact
allow-list, mirrored in SQL. Nothing else is ever in a payload.

### 5.6 `validation.js`, `keywordFilter.js`, `limits.js`, `links.js`
PURE. Handle regex, `RESERVED_HANDLES` (volyume, admin, support, help,
moderator, official, staff, team, community, coach, beat, nhs, plus the
app's route words), display-name and bio caps, `SENSITIVE_COMMUNITY_KEYS`,
`BLOCKED_TERMS`, `COMMUNITY_RULES_VERSION = 1`,
`COMMUNITY_DIMENSION_MIN_FOR_HUB = 3`, all rate limits as named constants,
`profileUrl(handle)`, `programmeUrl(id)`, `storyUrl(id)`,
`parseCommunityLink(url)`.

### 5.7 `profile.js`, `feed.js`, `activity.js`, `moderation.js`, `notify.js`
`profile.js`: `loadMe({force})` (RPC then cache `@volyume_community_me_
<uid>`), `readCachedMe(uid)`, `hasProfile(me)`. `feed.js`: `loadHub(segment)`
with cache `@volyume_community_hub_<uid>`, cursors. `notify.js`:
`notifyCommunityEvent(kind, targetUserId, refId)` best-effort,
`.catch(() => {})` with a comment. `moderation.js`: queue and actions.
`hooks`: `src/hooks/useCommunityMe.js` exposing `{me, loading, refresh}`.

## 6. Screens and components (house style)

Design rules: black background, `Card` surfaces, hairlines, `SectionLabel`
eyebrows, `Chip`s for facts, one `emphatic` button per screen at most,
amber only for the accent glyph, selection state and the unseen dot.
Avatars: `ProfileAvatarMark` with preset or initials (size 40 in lists,
64 on profile hero). Handles render as `@handle` in `textSecondary`.
Every list is a `FlatList` with `keyExtractor`, `onEndReached` paging and
pull-to-refresh. Every empty state uses `EmptyState` and answers "what
can I do now" with an action.

Components (`src/components/community/`): `ProfileCard` (avatar, display
name, @handle, fact chips, optional reasons line, follow button),
`FollowButton` (states: Follow / Requested / Following / Follow back;
`primary` variant, `secondary` when following), `PostCard` (author row,
kind-specific body, caption, reaction + comment row; body renderers per
kind: PR = exercise + "<weight> <units> x <reps>" + "Previous best"; session
= name + three stats; block = plan name + weeks + sessions + up to three
lift deltas; milestone = hero value + caption; programme = programme
tile), `ProgrammeTile` (title, creator @handle, style chip, "N days",
"N exercises", "Circuits" chip when true, use_count line "Used by N"),
`ProgrammeStructure` (day sections; circuit groups rendered as one
bordered block "Circuit · 3 rounds · 90 s between rounds" with stations
listed; straight sets "3 x 8-12 · 120 s"), `DimensionRow`, `ActivityRow`,
`CommentRow`, `ReportSheet` (BottomSheet with the six reasons as radio
Chips and a detail field), `ProfileMenuSheet` (Share link, Mute/Unmute,
Block/Unblock, Report), `PrivacyReceipt` (two columns "Others can see" /
"Never shared", reusing the PartnerPrivacyReceipt layout with new copy).

Screens (states in order):
- **CommunityHubScreen.** BackHeader "Community", right: search glyph +
  activity glyph (with dot). No profile: hero `Card` "Programmes, training
  stories and people" + one line "Follow lifters you rate, share what you
  build, and use or adapt other people's programmes. Nothing about your
  body, food or coaching is ever shared." + `PrivacyReceipt` + emphatic
  "Create my profile" + secondary "Browse first". Below, Discover renders
  read-only. With profile: `SegmentedControl` Following | Discover.
  Following: feed; empty -> `EmptyState` "Nothing here yet" / "Follow a
  few people and their training stories will appear here." action "Find
  people" + a "People you may want to follow" strip (up to 5 with reasons)
  when any exist. Offline: cached feed with a quiet line "Showing what you
  last saw. You are offline." Discover sections: "Programmes" (community
  tiles, then "By Volyume" tiles from `LIBRARY_PLANS` marked with a small
  "Volyume" chip, each routing to the existing library detail), "People
  you may want to follow", "Around you" (dimensions with count >= 3; row
  label e.g. "Kettlebell lifters · 6", "Trains at PureGym Leeds · 4",
  "Lifters in Leeds · 8", "On Minimal Push Pull Legs · 3"), "Recent
  training stories". Empty Discover (no public content at all): "You are
  early" / "Be the first to publish a programme or post a training story.
  Volyume's own programmes are below." + Volyume tiles.
- **CommunityJoinScreen.** "Join Community" ; rules summary (four lines:
  training talk only; be decent; no body-shaming, no diet or calorie
  talk; report what breaks this) + `PrivacyReceipt` + handle field (live
  availability "Available" / "Taken" / "Use 3 to 20 letters, numbers or
  underscores"), display name, avatar preset grid, visibility choice
  ("Anyone can follow me" / "I approve followers"), under-18 note when
  `is_minor` ("Under 18: your profile is followers-only and does not
  appear in search"), emphatic "Create profile" (records consent). Link
  "Community rules and contact".
- **CommunityEditProfileScreen.** Same fields plus bio, styles (<=3
  chips from the style list: Bodybuilding, Strength, Kettlebell, Circuits,
  Bands, Bodyweight, Minimal kit, Home gym), goal, setting, area, gym
  (with "Trains at" wording and a note "Only the name you type. Never your
  location."), visibility; "Leave Community" (destructive, AppAlert).
- **CommunityProfileScreen.** Hero: avatar 64, display name (h2),
  @handle, bio, chips (styles, goal, setting), line "Trains at <gym> ·
  <area>" when set, counts "N followers · N following" (pressable when
  viewable), FollowButton, `...` menu. Segments Posts | Programmes.
  Followers-only and not following: "This profile is private" / "Follow
  to see their training stories and programmes." Blocked (by me): "You
  have blocked this person" + Unblock. Own profile: "Edit profile",
  "Share link".
- **CommunityProgrammeScreen.** Title (h1), creator `ProfileCard` (compact),
  chips (style, days, exercises, circuits), description, "Used by N",
  `ProgrammeStructure`, sticky action row: primary "Use as-is", secondary
  "Adapt for me", tertiary "Share link"; comments section; `...` Report.
  "Use as-is" -> AppAlert "Copy this programme?" / "It goes to your plans
  as a new programme. Nothing is activated and your current plan is
  untouched." -> import -> toast "Added to your plans" and navigate to
  PlanDetail.
- **CommunityAdaptScreen.** "Adapt for me"; loading; result: summary
  line "N exercises kept, N swapped, N kept with a note"; days mismatch
  notice when present ("This programme is 4 days a week. Your setup says
  3. Volyume keeps the creator's structure; you can drop a day in the plan
  editor."); a list of changes (from -> to with reason: "Not in your
  equipment", "Excluded by you", "Clashes with a limitation", "No
  alternative in this style, kept"); primary "Save to my plans"; the
  original programme is never changed.
- **CommunityPublishProgrammeScreen.** Preview of the snapshot; title
  (prefilled), description, visibility (Public / Followers / Link only);
  disclosure "Structure only: days, exercises, sets, reps, rest and your
  exercise notes. Never your weights."; emphatic "Publish" / "Update";
  when published: "Unpublish", "Share link".
- **CommunityComposeScreen.** Preview `PostCard`, caption (280), visibility,
  emphatic "Post". Routes to Join first when no profile (with `next`).
- **CommunityPostScreen.** PostCard + comments + composer.
- **CommunitySearchScreen.** SearchBar (autofocus), Segmented People |
  Programmes, results; empty query: "Search by @handle or name"; no
  results: "No one by that name yet" / "Nothing with that title yet".
- **CommunityActivityScreen.** "Follow requests" section (Accept / Decline)
  then the list; empty: "Quiet for now" / "Follows, reactions and comments
  on your posts appear here."
- **CommunityDimensionScreen.** Title = label, sub "N lifters"; People
  then Programmes.
- **CommunityRulesScreen.** Rules, what stays private, reporting,
  contact (the published support address from the existing support
  page), rules version.
- **CommunityPrivacyScreen** (also reachable from Settings): visibility,
  Blocked, Muted, "Leave Community".
- **CommunityModerationScreen** (only when `is_moderator`): queue tabs
  Open | Actioned; each report shows target preview, reason, reporter
  count; actions sheet; audit log link.

Legacy partner link landing (Community with `legacyPartnerCode`): a
dismissible `Card` "Partner invites have moved" / "Training partners are
now part of Community. Search for the person who sent this and follow
each other." action "Find people".

## 7. Notifications

`categories.js`: `CATEGORY.COMMUNITY_FOLLOW = 'community_follow'`,
`CATEGORY.COMMUNITY_ACTIVITY = 'community_activity'`, channels PUSH +
IN_APP, `data.type` mapping both names; `budget.js` `EVENT_PRIORITY`
appends both after `PARTNER_CHEER`; `notificationRoute.js` routes both to
`{ tab: 'HomeTab', screen: 'CommunityActivity' }`; `channels.js` Android
channel description gains "Community follows and activity";
`categoryPrefs.js` blob fields `communityFollowEnabled`,
`communityActivityEnabled` (default true). NotificationSettingsScreen:
new section "Community" with two toggles and the line "These arrive when
something happens, and never while a wellbeing check is open." (SD-15a:
server-sent pushes cannot see device quiet hours today) Guards
`campaign14.categoryOwnership` and `campaign14.routingTruth` extended.

## 8. Deep links and web

`app.json`: intent filters add `pathPrefix` `/u`, `/p`, `/s`. AASA paths add
`/u/*`, `/p/*`, `/s/*`. `public/u/index.html`, `public/p/index.html`,
`public/s/index.html`: dark house style copied from `public/partner/
index.html`, fetch `community-public`, render (programme: title, creator,
chips, day-by-day structure with circuits; story: the card; profile: card
+ programmes + stories), "Open in Volyume" (`volyume://...`) and "Get
Volyume" (store links from the partner page), profile and story pages
`noindex`. `public/partner/index.html` copy: "Partner invites have moved
into Community" with the same store links.

## 9. Partners retirement (separate lane, after Community lands)

Remove: `src/screens/PartnerScreen.js`, `src/components/PartnerPrivacyReceipt.js`
(after `PrivacyReceipt` exists), `src/hooks/usePartners.js`,
`src/lib/partners/*` and their tests, `src/lib/sync/tables/partners.js`,
the `partner_signals` registry entry and transport wiring,
`src/lib/notifications/partnerBeats.js` and `schedulePartnerBeats`, the
PARTNER_CHEER settings section in CoachingRemindersScreen, the Progress
tile, the WorkoutSummary / ProgressPhotos / BeforeAfterShareSheet partner
hand-offs, `ProGate.js` partner copy, `coachReport.js` partner line,
`streak.js` / `streakState.js` partner-only exports (only if unused
elsewhere), telemetry client wrappers (the server allow-list stays).
Keep: every migration, the `partner-cheer` and `delete-account` edge
functions, the six local tables and their entries in
`PARTNER_LOCAL_WIPE_TABLES` / wipe lists (write a comment: "retained for
wipe completeness; feature retired 2026-09-06"), `CATEGORY.PARTNER_CHEER`
(routed to Community; kept so old scheduled notifications resolve).
Update every guard listed in `01-recon-partners.md` §9: delete
Partners-specific suites; edit shared guards to drop PartnerScreen from
their file lists; `linkingConfig.test.js` pins `partner/:code?` ->
Community; `proScreenGating.guard` drops the Partner row; `screen-mount`
mounts the Community screens instead. `supabase/README.md` 155 note:
"client fallback removed with Partners 2026-09-06; no longer blocked;
still not applied".

## 10. Tests

- `src/lib/community/__tests__/`: validation (handles, reserved, caps,
  forbidden keys), keywordFilter, snapshot (personal columns never
  present; circuit fields preserved; caps), importProgramme (real
  database module on in-memory SQLite: structure and tags reach the
  plan, `starting_weight` NULL on every row, unresolved names reported),
  adapt (a kettlebell snapshot with a barbell-only recipient; an
  excluded exercise; a limitation conflict; a circuit group survives
  with rounds and round rest; days mismatch reported; no change without
  a reason), posts (payload keys exactly the allow-list; forbidden keys
  rejected), links (build/parse round trip), transport gates
  (fail closed on consent unresolved).
- Source-level guards: `community.privacy.guard.test.js` (no file under
  `src/lib/community` or `src/screens/Community*` or `src/components/
  community` reads bodyweight, kcal, scan, capability, ed_pattern,
  first_name, dateOfBirth; the SQL forbidden list equals
  `SENSITIVE_COMMUNITY_KEYS`; the SQL blocked-terms array equals
  `BLOCKED_TERMS`; the SQL payload allow-lists equal `POST_PAYLOAD_KEYS`),
  `community.rpcOnly.guard.test.js` (migration 160 creates no policy
  granting `authenticated` on any `community_` table; every RPC is
  SECURITY DEFINER with a pinned search_path), `community.transport.guard`
  (only `transport.js` imports getSupabaseClient under community).
- Registry/notification/linking suites extended; `screen-mount` covers
  every new screen; `Button.hierarchy.guard` and `themeTokens.guard`
  include the new files.
- Sync regression matrix untouched (no new synced table).

## 11. Documents

`docs/community-safety/ILLEGAL-CONTENT-RISK-ASSESSMENT.md`,
`docs/community-safety/CHILDRENS-ACCESS-ASSESSMENT.md`,
`docs/community-safety/DSA-SIZE-SELF-ASSESSMENT.md`,
`docs/community-safety/COMMUNITY-RULES.md` (the in-app text, versioned),
`docs/community-safety/MODERATION-RUNBOOK.md` (24 h target, actions,
audit). `supabase/README.md` status block and ledger. Sentry scrub
additions. TASKBOARD, handover, decisions, verification, final report.

## 12. Device checklist (Android, EAS build; written for the founder)

1. Today: a people icon sits top-right of the header. Tap -> Community
   opens with "Create my profile" and Discover below it. Expected: no
   profile exists yet; Volyume programmes are listed under "By Volyume".
2. Create profile: pick a handle already used by another test account.
   Expected: "Taken". Pick a free one, create. Expected: the rules and
   privacy receipt were shown; profile hero appears; Coach tab's Support
   row reads "Community".
3. Search the second account's handle, open, Follow. Expected on account
   two: activity "followed you", push arrives (or in-app only if a
   wellbeing check is open).
4. Account two sets "I approve followers"; account one follows. Expected:
   "Requested"; account two sees the request; accept -> "Following".
5. Train -> a plan -> "Share programme" -> Publish (public). Expected:
   Discover on account two shows the tile; open -> structure lists days,
   circuit groups show rounds and round rest; no weights anywhere.
6. "Use as-is" on account two. Expected: a new plan in Train, not active,
   every exercise with an empty starting weight.
7. Account two excludes one exercise from that programme and sets minimal
   kit; "Adapt for me". Expected: a change list with reasons; save; the
   plan has the substitutes; the original programme on account one is
   unchanged.
8. Share link from the programme; open it in a browser signed out.
   Expected: the programme page renders the structure; "Open in Volyume"
   opens the app to the programme.
9. Finish a session -> "Post to Community" -> post. Expected: the story
   appears in account two's Following; reaction and comment work; the
   post never shows bodyweight or food.
10. Block account one from account two. Expected: account one cannot
    open account two's profile, both follows are gone, search shows
    nothing either way. Unblock restores search only.
11. Report a post three times from three accounts. Expected: it hides;
    the moderator account sees it in the queue and can dismiss (unhide)
    or delete.
12. Open a wellbeing check (test flag) on account two; account one
    reacts. Expected: no push; the activity is in-app.
13. Settings -> Notifications -> Community toggles off; react again.
    Expected: no push.
14. Settings -> Community privacy -> Leave. Expected: profile, posts and
    programme disappear for account one; account two's follow edge is
    gone; rejoining requires a fresh handle acceptance.
15. Old partner link `https://volyume.app/partner/ABCDEF1234` tapped.
    Expected: Community opens with the "Partner invites have moved" card.
16. Airplane mode: open Community. Expected: last seen content with the
    offline line; core training unaffected.

## 13. Lead visual review rulings (2026-09-06, render `render-community-screens.html`, artifact https://claude.ai/code/artifact/1f910a8b-4ade-41ee-82bf-879cbba6de86)

Eight states were rendered at 390 x 844 in the dark tokens and reviewed
against the brief's visual questions (does it feel like Volyume, is the
hierarchy clear, is there too much orange, are empty states elegant).
Verdict: it reads as the same product; the hierarchy is clear; the empty
states answer "what now". Three corrections bind the screens lane:
1. Amber is never body text. Suggestion reasons render in `textPrimary`
   at `captionStrong`; the circuit group label renders in `textPrimary`
   with a small amber `repeat-outline` glyph; the only amber on any
   Community screen is glyphs on primary buttons, the selected segment,
   the emphatic button fill, the Volyume chip on library tiles, and the
   unseen dot.
2. On the programme screen the action row leads with "Adapt for me"
   (`primary`, `options-outline` glyph) and "Use as-is" is `secondary`.
   Neither is emphatic; the emphatic fill belongs to "Save to my plans"
   on the adapt screen and to "Create profile" on Join.
3. Reaction is a single "Respect" tap (Ionicons `thumbs-up-outline`,
   filled `thumbs-up` when on) with a count; comments use
   `chatbubble-outline`. No hearts.
The Today root header keeps only the Community action in its `right`
slot (the brand mark is not shown beside it).

## 14. Final product pass: discoverability and differentiation (lead, 2026-09-06)

Ruling on IA: Community stays off the tab bar (SD-02 holds). Two weaknesses
found on the evidence: a new user has no labelled path to Community on
Today before their first workout summary, and the programme screen never
says what Adapt for me does at the moment of choice. Four changes, nothing
else:
1. **Today introduction card** (`src/components/HomeCommunityIntroCard.js`,
   rendered by HomeScreen after the last-session card, same gating shape as
   the Injuries & limitations offer): shown once a person has completed at
   least one session, has no Community profile in the cache, has not
   dismissed it, and no ranked banner holds the slot. Copy: title "Other
   lifters, their programmes, your stories"; body "Use a programme another
   lifter built, as-is or refitted to your kit, and share the training you
   actually did. Nothing about your body, food or coaching is ever
   shared."; actions "Have a look" (primary, opens Community) and "Not
   now" (secondary). Either action dismisses it for good
   (`@volyume_community_intro_<uid>`).
2. **Plan library row**: under the search and collection chips, one
   pressable row "Programmes from other lifters" with the sub "Use as-is or
   refit them to your kit" opening Community Discover focused on
   programmes. The library is where people choose programmes; community
   programmes belong beside Volyume's.
3. **Programme screen**: one caption under the action row, "Adapt keeps
   the creator's structure and swaps only what your kit, exclusions or
   limitations rule out. Every change is shown before anything is saved."
4. **Hub hero copy** leads with the differentiator: title "Programmes you
   can make your own"; body "Use another lifter's programme as they built
   it, or let Volyume refit it to your kit and limits and show you every
   change. Share the training you actually did. Nothing about your body,
   food or coaching is ever shared."
