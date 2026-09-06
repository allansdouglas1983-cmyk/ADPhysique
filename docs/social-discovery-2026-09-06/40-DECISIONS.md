# 40 — Decisions register: Social / Community / Discovery (SD-nn)

Authority: founder brief 2026-09-06; lead rulings under D33 (delegated
product-fork decisions, ruled on "the absolute best solution for the app and
end users"). Every Section 2 inviolable stays binding. Evidence files are
cited by number (01-05 recon, 10-13 research, 20 synthesis).

## SD-01 — The product is "Community", one coherent destination
Volyume's social layer is one destination named **Community** with two
halves: **Following** (a feed of human-authored training stories from
people you follow) and **Discover** (programmes, people, and the dimensions
that connect them: training style, programme, gym, area). Search sits over
both. Rationale: research (10, 11) shows the follow-feed / discover split is
the one model every strong product converges on, and each half can stand
alone at small scale. "Community" beats "Social" (internal-sounding) and
"Discover" (only half the idea).

## SD-02 — Not a bottom tab; a first-class destination off Today
Community is a stack destination in the Today (Home) stack, reached from a
persistent header action on the Today root (with an unseen-activity dot),
from a row on the Coach tab (where the Partners row sat), from a
"Programmes from the community" row on Train, and from every share surface
(workout summary, share card, plan detail, block complete). Rationale: the
five-tab bar is training-first and full; a sixth tab cramps labels on a
360 dp device; a user who wants no social layer never meets it; the Today
header action is one tap from the default landing screen. Recorded
alternative: a sixth tab. Rejected on the brief's own rule that Social
must never make Volyume feel like social media first.

## SD-03 — Partners is retired, relationships preserved
Partners (1:1 invite-code pairing with derived weekly ticks, cheers, aims,
shared block names, win cards) is retired: its screens, hook, service
module, sync handler and tests are removed; its cloud tables, RPCs,
triggers and the `partner-cheer` function stay untouched (additive rule);
its six local tables stay in the schema and the wipe lists. When a user
creates a Community profile, the server converts each ACTIVE partnership
whose other member already has a profile into an accepted mutual follow
(and does the same when that member later joins). `/partner/:code` links
keep resolving (AASA and intent filters unchanged) and land on Community
with a plain explanation; the public invite web page says the same.
Migration 155 is no longer blocked by a client fallback (the fallback is
deleted with Partners) but is NOT applied here. Rationale: the pairing
model assumed you already had one person; everything it offered
(accountability, a private audience, sending a win) is covered by
followers-only profiles, mutual follows, training stories and reactions,
without the automated adherence broadcast (see SD-12).

## SD-04 — Nothing is visible until the user creates a profile, and body data never is
No user is in Community until they choose a handle and accept the
Community rules on a dedicated screen that records a `community_visibility`
row on the consent_log rail (separate from Article 9 consent, GDPR
Art. 6). Reading public content does not require a profile. The following
never enter Community in any form: bodyweight, body composition, Progress
Scan, nutrition, injuries and limitations, coaching output, check-ins,
progress photos, first name (the profile uses a chosen display name).
Weights on a PR post are training performance, shared only when the user
posts them. Programme snapshots never carry any load.

## SD-05 — Profile facts are chosen, not inferred
The profile carries: handle, display name, avatar (Volyume preset or
initials), bio, up to three training styles from the app's style list,
one goal, one training setting (commercial gym / home gym / minimal kit),
an optional area label (town or city, free text, normalised) and an
optional gym label. Every field is typed by the user for the profile;
nothing is read from onboarding or the engine. Visibility is `public` or
`followers` (follow requests). Under-18 profiles (server-derived from the
user's own date of birth, stored only as a boolean) are forced to
followers-only and never appear in search, suggestions or dimension lists.

## SD-06 — The feed is human-authored only
A post is a training story generated from real logged data (kinds: PR,
session, completed block, consistency milestone, programme share) with an
optional caption. No session is ever auto-posted. Following and Discover
are chronological; there is no engagement ranking anywhere. Rationale:
Strava's top complaint is the uncurated auto-feed (11); ED-safety guidance
bans engagement-ranked body-adjacent content (13).

## SD-07 — Programmes are the primary shared object; structure travels, loads never
A shared programme is a versioned structural snapshot (days, exercises,
sets, rep ranges, rest, notes, circuit groups with rounds and round rest,
style tag, split, difficulty). `starting_weight`, `selection_reason` and
every personal column are stripped on export and rejected on the server.
A recipient can **Use as-is** (the existing library-copy path with the
load nulled) or **Adapt for me** (SD-08). External link pages show the
structure to non-users.

## SD-08 — Adaptation is deterministic, explained, and never touches style or structure
"Adapt for me" composes existing pure functions only:
`substituteCandidateFilter({styleKey, equipment})`, `blockingConflicts`,
`bestEligibleSubstitute`, `equipmentReachable`, `isEligibleExercise`. For
each exercise: keep it if reachable and eligible; otherwise substitute
the best same-muscle alternative inside the creator's style pool and the
recipient's kit; if none exists, keep it and say so. Circuit groups,
rounds, round rest, day order and day count are never changed (day-count
re-mapping does not exist in the engine and would rewrite creator intent;
a mismatch is disclosed, not fixed). Reps and rest for a substituted
exercise are re-derived by the same function every swap uses. The change
list is shown before anything is saved; the original stays untouched.

## SD-09 — Discovery is relevance-first; suggestions never use popularity
Suggested people are scored on chosen facts only: same programme in use,
shared style, same gym, same area, same goal, mutual follows. Score ties
break on recent activity. Every suggestion shows its reasons. Search is
handle-prefix and display-name match over public profiles, and title /
tag match over public programmes. Blocked users are invisible both ways.

## SD-10 — Dimensions, not rooms
There are no community rooms with their own feeds or admins. A dimension
(style, programme, gym, area) is a page listing the people who chose it
and the programmes published in it. A dimension page exists whenever at
least one other person shares it and is never labelled a community. The
Discover hub surfaces a dimension only at three or more other members
(`COMMUNITY_DIMENSION_MIN_FOR_HUB = 3`, an internal choice with no
external evidence, per 13). Gyms are honest labels ("Trains at"); there is
no verification, leaderboard, event or admin. Area is a town or city label;
there is no map, no radius, no live location, no "at the gym now".

## SD-11 — Moderation ships first
Report (fixed reasons including "Harmful body or eating content"), block
(two-way invisibility, follows removed), mute (silent), auto-hide at three
distinct open reports, a moderator queue in the app with an audit log,
account restriction and suspension, rate limits (tighter for accounts
under seven days old), handle policy (reserved words, ASCII lowercase),
a shared keyword filter on every free-text field, and a Community rules
screen carrying the published contact. Records kept internally: illegal
content risk assessment and children's access assessment (UK Online
Safety Act), DSA size self-assessment.

## SD-12 — Deliberately not built (v1)
Direct messages; challenges and leaderboards; live "training now"
presence; free image upload (posts and photo avatars); community rooms;
gym verification, leaderboards, events; automated adherence broadcast
(the Partners weekly tick); any person-to-person comparison or ranking;
contacts import. Reasons in `20-SYNTHESIS.md` §3. Image upload is a
founder question (new processor dependency and data category), recorded
in the final report rather than decided here.

## SD-13 — Online-first with a small cache; no new local tables
Community reads and writes go through one client module
(`src/lib/community/transport.js`) that calls SECURITY DEFINER RPCs and
edge functions under the same three gates as sync (sign-out wiping,
Article 9 consent, live session). The last hub payload and the user's own
profile are cached per user in AsyncStorage for an offline "last seen"
state. No SQLite table is added, so no wipe-list change is needed and no
foreign rows can survive an account switch.

## SD-14 — Read and write paths are RPC-only
Every `community_*` table has RLS enabled with no policy for
`authenticated`; SECURITY DEFINER RPCs are the only ingress and egress,
and each applies visibility, block, status and rate rules in one place.
Public web reads go through the `community-public` edge function with an
explicit field allow-list. The security matrix records the disposition
`rpc_only` for every community table.

## SD-15 — Notifications: two budgeted categories, in-app first
`COMMUNITY_FOLLOW` (new follower, follow request, request accepted) and
`COMMUNITY_ACTIVITY` (reaction, comment, reply, programme used). Both sit
at the bottom of the event-push priority list, both have a settings
toggle, both obey quiet hours, and the server downgrades to in-app only
under an open ED flag (fail closed), exactly as partner-cheer did. The
Activity screen inside Community is the inbox.

## SD-16 — External links are static pages over an allow-listed function
`https://volyume.app/p/?id=` (programme), `/s/?id=` (story) and
`/u/?h=` (profile) are static pages in `public/` that fetch
`community-public`. Programme pages are indexable; profile and story
pages are `noindex`. The query form is chosen because the site is static
GitHub Pages with no path rewriting (the partner page already uses it as
its fallback form).
