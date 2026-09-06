# 70 — DISCOVERY, CONNECTIONS AND THE SOCIAL GRAPH (second campaign blueprint)

Authority: founder addition to the Community brief (in chat, 2026-09-06):
"make Volyume the easiest and most intelligent fitness platform for
discovering the right people, programmes and training communities, while
remaining genuinely useful when the network is tiny". Builds ON the landed
Community (blueprint `30`, decisions `40`); reuses every existing rail
(profiles, follows, activity, moderation, notifications, transport, link
pages). Rulings are SD-20..SD-32 in `40-DECISIONS.md`. Every Section 2
inviolable of CLAUDE.md binds. Agents build FROM this file; anything not
specified is resolved by STOPPING and reporting, not by interpreting.

Hard bounds: no new npm dependency; no storage bucket; no realtime
subscriptions (conversations poll on focus and on push tap); the engine
stays pure; nothing from nutrition, body metrics, Progress Scan, injuries
and limitations, coaching or check-ins is ever read by any file in this
campaign; British English, calm voice, no em dash in user-facing copy;
migration 161 is additive and WRITTEN, NOT APPLIED.

---

## 1. The relationship model (SD-20)

Three tiers, each with one sentence a person can read on the button:
- **Follow** (one-way). "See their training stories and programmes."
  Public profiles: instant. Followers-only profiles: a request they
  accept. Unchanged from `30`.
- **Connect** (mutual, accepted). "Become connected. They need to accept."
  A request carries optional context: up to two reasons from a fixed set
  (`same_gym` "Same gym", `same_programme` "Same programme",
  `train_like_me` "You train like me", `train_together` "Want to train
  together?") and an optional note (120 chars, keyword-filtered). The
  recipient sees "Jamie wants to connect" with the reasons and the note,
  and Accept / Decline (Block from the menu). Decline is silent to the
  requester, who keeps seeing "Requested"; a declined or withdrawn
  request cannot be re-sent to that person for 30 days. On accept both
  people follow each other (accepted state, even across followers-only
  profiles) and the tie becomes **Connected**.
- **Message** (connected only). "Available to people you are connected
  with."

Rules that keep it simple:
- Connected implies following both ways. Unfollowing a connection also
  removes the connection (the confirm says so). Removing a connection
  ends messaging (the conversation closes for both) and leaves the two
  follow edges in place.
- Who can send me connection requests: `connect_from` = `anyone` |
  `followers` (people who already follow me) | `nobody`. Default `anyone`
  for public profiles and `followers` for followers-only profiles;
  changeable in Community privacy.
- Minors: never send or receive connection requests or messages
  (server-enforced); follow requests only.
- Block: removes follows and the connection, closes the conversation,
  two-way invisibility as before. Mute: hides their stories and silences
  their message pushes; the conversation still works.
- No codes anywhere. The only way to a relationship is to find a person
  and press a button.

## 2. Messaging (SD-21)

One-to-one text conversations between connected people. No groups, no
media. Body 1 to 1,000 characters, keyword-filtered, rate 60 an hour (20
for accounts under seven days). A message may carry one context reference
(`ref_kind` `programme` | `post`, `ref_id`) rendered as the existing
ProgrammeTile or PostCard above the text; the composer opened from a
programme or story attaches that reference and shows a placeholder ("Ask
about this programme" / "Say something about this session"); nothing is
ever pre-written or sent on the person's behalf. Read state per
participant; unread count in `community_get_me`. A message can be deleted
by its sender (hard delete). Reporting: target kind `message`. Push:
category `COMMUNITY_MESSAGE`, body "New message from @handle" (never the
content), at most one push per conversation per 15 minutes while unread,
recipient toggle, the same fail-closed wellbeing check as every Community
push. Conversations close when a connection is removed or a block is
placed; messages are deleted by `community_leave` and `delete_user_data`.

## 3. The training profile: observed facts as coarse bands (SD-22)

Volyume has real training history. It stays on the device; what may
leave it is a set of coarse bands the person has looked at and chosen to
share. Derived on device by `src/lib/community/trainingProfile.js`
(pure derivation over the last 12 weeks of completed workouts, with an
I/O loader over `getCompletedWorkoutStartTimestamps` and
`getWorkoutSetsSince`; never any weight, body or food read):
- `tp_days`: weekdays carrying at least 25% of sessions (needs 6 or more
  sessions in the window, else null), e.g. `['mon','wed','fri']`.
- `tp_time_bands`: dominant start bands with at least 35% share, at most
  two: `morning` (05:00-09:00), `midday` (09:00-14:00), `afternoon`
  (14:00-17:00), `evening` (17:00-22:00), `late` (22:00-05:00).
- `tp_sessions_band`: average sessions a week: `1_2` | `3` | `4_5` |
  `6_plus`.
- `tp_staple_lifts`: up to five canonical exercise ids by session count
  (custom exercises never included).
- `tp_experience_band`: from the profile's experience: `new` |
  `intermediate` | `experienced`.
- `tp_programme_key`: the active plan's Community programme id when it
  came from Community (`source_programme_id` `community:<id>`) or the
  person's own published id for that plan, else `style:<key>`, else null.
- `tp_age_band`: server-derived from the person's own date of birth when
  they opt in: `18_24` | `25_34` | `35_44` | `45_54` | `55_plus`; never
  for minors.
Each band has its own toggle. Defaults: sessions, experience, programme
and staple lifts ON; days, time bands and age band OFF. The Join flow
gains a step that shows the derived bands with their toggles before
"Create profile" (an explicit act, so SD-04 holds); Edit profile links to
a "Training profile" screen with the same toggles and a preview line
("Usually trains Mon, Wed and Fri evenings · 4 to 5 sessions a week ·
Intermediate"). The client recomputes on hub open at most once a day and
sends ONLY the opted-in bands through `community_update_training_profile`;
the server nulls anything not sent. Copy never shows a time of day more
precise than a band, never a date, never "last trained".

## 4. Find people (SD-23)

A dedicated screen, `CommunityFindPeopleScreen`, reached from the hub
("Find people" card and header search), the profile's empty follower
states and the Today introduction card's second visit. Search bar at the
top (handle prefix, display name). Then rows with live counts:
- **At my gym** ("Trains at PureGym Leeds · 6 others") requires a gym
  label; without one the row says "Add your gym to see who trains there"
  and opens Edit profile.
- **Near me** ("Lifters in Leeds · 12") requires an area label; same
  pattern.
- **Train like me** ("Lifters like you") always available once a profile
  exists.
- **On my programme** ("On Minimal Push Pull Legs · 4") requires a shared
  programme key.
- **Open to training together** ("3 in your area") lists people with the
  partner flag, area or gym first.
- **People you might know** (mutual connections and follows, shared
  programme, gym, area).
Each row opens a scored list of ProfileCards with the reasons line and a
Follow button, a Connect button and, when connected, Message. Zero
states never pretend: "No one else lists PureGym Leeds yet. You are the
first here; anyone who adds it will see you." with "Share your profile
link". The hub's "People you may want to follow" strip becomes "Lifters
like you" (top five from `like_me`) with the reasons line.

## 5. Recommendation scoring and explanations (SD-24)

One RPC, `community_find_people(_mode, _cursor, _limit)`, modes
`like_me` | `gym` | `area` | `programme` | `partners` | `might_know`.
Candidates: public, active, non-minor, not blocked either way, not self,
not already connected (except `might_know`, which excludes connected
only); `gym`/`area`/`programme` restrict to the matching key first;
`partners` requires `open_to_partner` on both sides. Score (integers,
declared and shared bands only):
- same gym 3; same programme key 3; shared style 2; same area 2;
  mutual connections 2 each (cap 3); mutual follows 1 each (cap 3);
  same goal 1; time band overlap 2; day overlap of two or more days 1;
  same sessions band 1; same experience band 1; staple lifts in common
  1 each (cap 3); both open to training together 2.
Minimum score 1 (modes other than `like_me` return matching-key rows
even at score 0). Order: score desc, last active desc. Every row carries
`reasons` in this exact wording: "Trains at <gym>", "Lists <area>", "On
the same programme", "Also trains <style>", "Same goal", "Both usually
train <band>s" (evenings/mornings/...), "Both train <Mon, Wed and Fri>",
"Both train <4 to 5> times a week", "Similar experience", "<n> staple
lifts in common", "Both open to training together", "Connected to <n> of
your connections", "Followed by <n> you follow". No percentage anywhere:
a percentage claims precision the bands do not have; the reasons are the
explanation (SD-24).

## 6. Training partner (SD-25)

Opt-in flag `open_to_partner` with preferences `{ days: [...],
time_bands: [...], same_gym_only: boolean }` set on the Training profile
screen under "Open to training together". When on, the profile shows a
chip "Open to training together" and the person appears in the `partners`
mode; when off, nothing anywhere says they were ever looking. The
connection request sheet pre-selects "Want to train together?" when
opened from the partners list.

## 7. Programme as the bridge (SD-26)

The programme screen's "Used by N" becomes "People on this programme · N"
and opens `community_programme_people(_id, _cursor, _limit)`: public,
active, non-minor profiles who use or published it and have
`show_programmes = true` (default true; a toggle in Community privacy
"Show which programmes I use"). Each row: ProfileCard with Follow /
Connect. The hub's "On my programme" row uses the same list.

## 8. Gym as a first-class page (SD-27)

The gym dimension page gains a summary from `community_gym_summary
(_key)`: member count, "N you follow", counts by style, counts by shared
time band ("6 usually train evenings"), count open to training together;
sections People, Programmes published by members, Recent stories by
members (public only). Nothing live, nothing precise. Gym labels
de-duplicate at entry: `community_gym_suggest(_area_key, _prefix)` powers
a typeahead on the profile editor over labels already used in the same
area, so "PureGym Leeds" is chosen, not retyped. Area stays a town or
city label with no coordinates (SD-10 holds); distance bands would need a
geocoding source and are recorded as a later question, not built.

## 9. Density strategy (SD-28)

The Find people rows and the hub card show real counts and honest zero
states; nothing is hidden behind thresholds except the hub's "Around you"
strip (three or more, unchanged). The Volyume library, external sharing
and the profile link are the invite path at any size. As counts grow the
same RPCs simply return more, and the gym summary and programme people
lists fill without a redesign. Contacts import stays out (SD-12).

## 10. Screens and components

New: `CommunityFindPeopleScreen` (rows + search), `CommunityPeopleListScreen
{ mode, key?, label }` (the scored list), `CommunityTrainingProfileScreen`
(bands with toggles, preview line, partner section),
`CommunityConversationsScreen`, `CommunityConversationScreen { id?,
userId? , ref? }`, components `ConnectButton` (states Connect / Requested /
Connected / Respond), `ConnectSheet` (reasons + note), `ConnectRequestRow`
(activity), `MessageBubble`, `MessageComposer`, `GymSummary`,
`TrainingProfileLine`. Changed: `CommunityProfileScreen` (Follow +
Connect + Message row; "N connections"; training profile facts line when
shared; partner chip), `CommunityActivityScreen` ("Connection requests"
section above follow requests), `CommunityHubScreen` ("Find people"
card with counts; messages glyph in the header with unread dot; "Lifters
like you" strip), `CommunityProgrammeScreen` ("People on this
programme"), `CommunityDimensionScreen` (gym summary), `CommunityJoinScreen`
(training profile step), `CommunityEditProfileScreen` (gym typeahead;
link to Training profile), `CommunityPrivacyScreen` (`connect_from`,
"Show which programmes I use", Training profile link), `ProfileMenuSheet`
(Remove connection), `PostCard` and `CommunityPostScreen` ("Message
@handle" when connected). Deep link `m` (`volyume://m/?id=`) for the
conversation push tap; `community_message` routes there.

## 11. Cloud migration 161 and functions (rpc-only, additive)

`community_profiles` gains: `connect_from text NOT NULL DEFAULT 'anyone'
CHECK (connect_from IN ('anyone','followers','nobody'))`,
`open_to_partner boolean NOT NULL DEFAULT false`, `partner_prefs jsonb`,
`show_programmes boolean NOT NULL DEFAULT true`, `connection_count int NOT
NULL DEFAULT 0`, `tp_days text[]`, `tp_time_bands text[]`,
`tp_sessions_band text`, `tp_staple_lifts text[]`, `tp_experience_band
text`, `tp_programme_key text`, `tp_age_band text`, `tp_updated_at
timestamptz`.
New tables: `community_connections(user_a uuid, user_b uuid, requester_id
uuid, state text CHECK (state IN ('requested','connected','declined')),
reasons text[], note text, created_at, responded_at, PRIMARY KEY (user_a,
user_b), CHECK (user_a < user_b))`; `community_conversations(id uuid PK,
user_a, user_b, created_at, last_message_at, closed_at, a_last_read_at,
b_last_read_at, UNIQUE (user_a, user_b), CHECK (user_a < user_b))`;
`community_messages(id uuid PK, conversation_id FK ON DELETE CASCADE,
sender_id uuid, body text NOT NULL, ref_kind text NULL CHECK (ref_kind IN
('programme','post')), ref_id uuid NULL, created_at)` with index
(conversation_id, created_at desc, id desc). `community_activity.kind`
CHECK widened with `connect_request`, `connect_accepted`;
`community_reports.target_kind` with `message`.
RPCs (underscore-prefixed parameters, same error codes as `30`, plus
`not_connected`, `connect_not_allowed`, `minor_restricted`):
`community_connect(_target, _reasons, _note)`, `community_respond_connect
(_requester, _accept)`, `community_withdraw_connect(_target)`,
`community_remove_connection(_target)`, `community_list_connections(_uid,
_cursor, _limit)`, `community_update_training_profile(_p)` (keys tp_days,
tp_time_bands, tp_sessions_band, tp_staple_lifts, tp_experience_band,
tp_programme_key, share_age_band boolean; validates every value against
the closed sets; nulls anything absent), `community_set_partner(_open,
_prefs)`, `community_set_connect_from(_value)`, `community_set_show_programmes
(_value)`, `community_find_people(_mode, _cursor, _limit)`,
`community_programme_people(_id, _cursor, _limit)`, `community_gym_summary
(_key)`, `community_gym_suggest(_area_key, _prefix)`, `community_conversations
(_cursor, _limit)`, `community_messages(_conversation_id, _cursor, _limit)`,
`community_send_message(_target, _body, _ref_kind, _ref_id)` (creates the
conversation when absent; requires state connected; minors refused),
`community_mark_conversation_read(_conversation_id)`, `community_delete_message
(_id)`. `community_get_me` adds `pending_connect_requests`,
`unseen_messages`, `connect_from`, `open_to_partner`, `partner_prefs`,
`show_programmes`, the shared `tp_*` bands. `_community_profile_card`
adds `connection: 'none' | 'requested_by_me' | 'requested_by_them' |
'connected'`, `connection_count`, `open_to_partner`, and the shared
`tp_*` bands only when the viewer may view the profile. `community_block`,
`community_unfollow`, `community_leave` and `delete_user_data` cover the
three new tables (two-sided). `community-notify` gains kinds
`connect_request`, `connect_accepted`, `message` (with the 15-minute
per-conversation collapse read from `community_conversations.last_message_at`
and the recipient's read time). `community-public` unchanged (bands never
served to the anonymous web).

## 12. Tests and records

Unit: trainingProfile derivation (bands from fixtures; fewer than six
sessions gives null days; custom exercises excluded; nothing but
timestamps and exercise ids read), scoring reasons wording, connect state
machine, message composer limits. Guards: the privacy guard extends to the
new files; the rpc-only guard covers 161; the argument-name guard covers
the new RPCs; the notification guards cover `COMMUNITY_MESSAGE`. Screen
tests for Find people rows (missing gym, zero count, list), Connect sheet,
Conversation (send, ref tile, blocked), Training profile toggles (only
opted-in bands are sent). Safety records updated: the illegal-content risk
assessment gains messaging (harassment, grooming vectors, the minor
exclusion), the moderation runbook gains message reports, the rules gain
one line on messages.

## 13. Device checklist additions (founder, two accounts)

17. Join on account two: the training profile step shows bands derived
    from real sessions; switch days and time off; create. Expected: the
    profile shows sessions, experience and programme lines only.
18. Find people from account one: "At my gym" shows account two only after
    both list the same gym (typeahead offers the label once it exists).
19. Connect from account one with "Same gym" and a note. Expected: account
    two sees the request in Activity with the reason; Accept; both now
    follow each other and "Message" appears on both profiles.
20. Message from the programme screen. Expected: the programme tile sits
    above the message; account two gets one push "New message from
    @handle" and no content; a second message within 15 minutes sends no
    second push.
21. Remove the connection from account two. Expected: the conversation
    disappears for both, follows remain, "Connect" is offered again.
22. Set account two to "People who follow me" for connection requests;
    account one (not following) tries to connect. Expected: "Not
    available" with the reason; follow, then Connect works.
23. Block from a conversation. Expected: conversation gone both ways,
    profile invisible both ways.
24. Under-18 test account: no Connect or Message button anywhere, and no
    incoming requests.
