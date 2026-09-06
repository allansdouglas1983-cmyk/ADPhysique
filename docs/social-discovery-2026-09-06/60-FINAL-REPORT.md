# 60 — Final report: Volyume Community (Social / Community / Discovery)

Founder brief 2026-09-06, delivered on branch
`claude/volyume-social-discovery-h7dknu` and merged to main (see the
verification section for the exact tree and tails). Evidence files `01`..`13`,
synthesis `20`, blueprint `30`, decisions `40`, reviews `51`/`52`,
verification `50`.

## Competitive research
- Hevy, JEFIT and Strong define table stakes (one-way follow, a follow feed,
  reactions and comments, a curated library) and one real differentiator
  each: Hevy strips weights from routine links and gives non-users a web
  preview; JEFIT has per-data-type privacy; Strong proves a whole segment
  wants no feed at all.
- Strava and Garmin teach the privacy lessons: presence must be opt-in
  (Flyby), per-field visibility beats one toggle, under-18 defaults from day
  one, verified clubs earned by activity, cooperative challenges beat
  leaderboards at small scale, and auto-posted or platform-generated
  engagement is the top complaint.
- Boostcamp is fork-then-edit; Juggernaut AI is the only product that
  substitutes equipment; Fitbod has no shareable object; Fitocracy shows
  gamification collapsing when density thins; no product verifies gyms.
- Policy: Apple 1.2 and Play UGC need working report, block, filter and a
  published contact; UK Online Safety Act duties are already live; social
  visibility needs its own consent; body metrics default private; no
  published density thresholds exist.

## Product decision
Volyume Community: one destination with **Following** (human-authored
training stories from people you follow) and **Discover** (programmes,
people, and the dimensions that connect them: style, programme, gym, area),
with search over both. Programmes are the primary shared object and the
recipient can use one as-is or have Volyume adapt it to their kit,
exclusions and limitations with every change explained.

## Partners
Retired. Screens, hook, service module, sync handler, beats and guards are
removed; the six local tables stay for wipe completeness; every cloud
migration and the `partner-cheer` function stay untouched. Active
partnerships become accepted mutual follows when both members create a
profile (server-side, in the profile RPC). Old invite links keep resolving
and land on Community with a plain card. Migration 155 is unblocked once a
build without Partners is in users' hands; it is not applied.

## Information architecture
Not a tab. Community sits in the Today stack, reached from a persistent
header action on Today (with an unseen-activity dot), the Coach Support
row, a "Programmes from the community" row on Train, the Settings row, and
every share surface (plan detail, workout summary, share card, block
complete). A user who never taps any of these never meets it.

## People discovery
Search by handle prefix or display name over public profiles; suggested
people scored on chosen facts only (same programme 3, same gym 3, shared
style 2, same area 2, mutual follows 2, same goal 1) with the reasons shown;
people through programmes (creator card on every programme), through
dimensions (style, programme, gym, area pages), through comments and
reactions.

## Discovery graph
Story -> person -> profile -> follow -> programme -> use or adapt ->
programme dimension -> people on it -> their programmes. Dimensions are
pages, not rooms: they exist whenever one other person shares the fact and
surface on the hub at three or more (an internal choice, labelled as such).

## Cold start
Useful at one user: publish a programme or story and the link page shows
it to anyone; Volyume's own library plans sit in Discover labelled as
Volyume's. At ten: search and follow. At twenty-five: dimensions appear,
suggestions carry reasons. Nothing is ever fabricated: no seeded users, no
automated posts, no platform reactions, no empty "communities".

## Scaling
The same RPCs page on server cursors; discovery is chronological and
relevance-scored, never popularity-ranked; rate limits and the moderator
queue are in place from day one. The honest scaling risk is moderation
load on the founder, recorded in the runbook.

## Sharing
Posts (PR, session, completed block, milestone, programme) generated from
real logged data with a caption; programmes as versioned structural
snapshots; external pages for programmes, stories and profiles.

## Programme adaptation
Structure only ever travels; every starting weight is written as null on
import. Adapt composes the existing substitution chain (creator's style,
recipient's kit, exclusions, limitations); circuit groups, rounds, round
rest, day order and day count are never changed; every change carries a
reason; the original is untouched; when the limitation state cannot be
read nothing is changed and the screen says so.

## Communities, gyms, local
No rooms. Gyms are honest "Trains at" labels typed by the user, normalised
within an area; no verification, leaderboards or events. Area is a town or
city label; no map, radius, live location or "at the gym now".

## Privacy
Nothing is visible until the user creates a profile and accepts the rules
(its own consent row). Never in Community: bodyweight, body composition,
Progress Scan, nutrition, injuries and limitations, coaching, check-ins,
progress photos, first name, date of birth. Followers-only profiles show
only handle, name, avatar, bio and counts to non-followers. Minors are
forced followers-only and excluded from every discovery surface and the
public web. Blocks are two-way invisibility; mutes are silent.

## Moderation
Report with fixed reasons (including harmful body or eating content, which
is prioritised), block, mute, auto-hide at three distinct reports, an
in-app moderator queue with an audit log, restriction and suspension, rate
limits tighter for new accounts, handle policy, a shared blocked-terms
list, and a rules screen with the published contact. Records on file:
illegal content risk assessment, children's access assessment, DSA size
self-assessment, moderation runbook.

## Growth
Programme and story link pages give a non-user the real content plus
"Open in Volyume" and the store links; no invite mechanics, no urgency.

## Implementation
Cloud: `supabase/migrate_160_community.sql` (fourteen rpc-only tables,
forty-one SECURITY DEFINER RPCs, triggers, consent widening, deletion
re-issued) WRITTEN, NOT APPLIED; `community-notify` and `community-public`
functions. Client: `src/lib/community/` (transport with the three gates,
snapshot, import, adapt, posts, validation, keyword filter, limits, links,
profile, feed, activity, moderation, notify), fifteen screens, twelve
components, two notification categories with settings toggles, deep links
`community`, `u`, `p`, `s`, the legacy partner rewrite, three static link
pages, AASA and intent filters.

## Migration
No cloud data moved. Partnerships are read by the profile RPC to create
mutual follows; nothing is deleted.

## Verification
See `50-VERIFICATION.md` for the settled-tree lint and test tails, the
journeys walked in code by the two adversarial reviews and the fixes each
produced, and the founder device checklist (blueprint §12).

## Deliberate non-changes
Direct messages; challenges and leaderboards; live presence; free image
upload and photo avatars; community rooms; gym verification; automated
adherence broadcast; person-to-person comparison; contacts import.

## Genuine remaining work (not a roadmap)
1. Apply migration 160 (and deploy the two functions) on the founder's
   exact phrase, after a device walk of the checklist on a build.
2. Server-side quiet hours for server-sent pushes (SD-15a).
3. Image upload for posts and avatars: a founder decision (new processor
   dependency, EU residency check, DPA) before any build.
4. App Store id on the three link pages once the iOS app is on the store.
5. A full children's risk assessment follows the access assessment's
   conclusion (recorded in `docs/community-safety/`).
