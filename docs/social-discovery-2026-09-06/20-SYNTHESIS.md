# 20 — Lead synthesis: research + recon -> the product Volyume should build

Authority: founder brief 2026-09-06 (Social / Community / Discovery). Evidence:
`01`..`05` (repo recon) and `10`..`13` (research) in this folder. This file is
the lead's synthesis; the rulings it produces are recorded as SD-nn in
`40-DECISIONS.md` and the build spec is `30-BLUEPRINT.md`.

## 1. What the evidence actually says

**Competitors (10, 11, 12).**
- Table stakes: one-way follow, a feed of followed people, reactions and
  comments, a curated official programme library distinct from peer sharing.
- The only confirmed differentiators anywhere: structure-vs-full-fidelity
  routine copying (Hevy strips weights from routine links), a non-user web
  preview (Hevy), per-data-type privacy (JEFIT, Garmin), an earned verified
  badge for clubs (Strava), consistency-based local recognition (Strava
  Local Legend), object-linked coaching conversation (Caliber).
- Nobody adapts a shared programme to the recipient. Boostcamp is fork-then-
  edit; Juggernaut AI substitutes equipment only; Fitbod has no shareable
  object at all. This is open ground and it is exactly where Volyume's
  structured model gives it an edge.
- What needs scale to not look dead: global Discover feeds, everyone-
  leaderboards, contest participant counts, suggested-user carousels.
- What works at 2-20 people: a follow-only feed of people you know, full-
  fidelity sharing, comments, 1:1 comparison against a named person.
- Top complaints: uncurated auto-posted feeds (Strava), platform-generated
  fake engagement (Strava), paywall creep on social (JEFIT), public-by-
  default (Hevy), dead clubs and challenge galleries that read as adverts.
- Gyms: no researched product verifies gym membership; Hevy's "gym
  leaderboard" is a friends list with a gym label. Fitocracy is the
  cautionary tale: gamification collapsed when density thinned.

**Policy and safety (13).**
- Apple 1.2 and Play UGC: working report, block, content filtering and a
  published contact at review time; no lighter rule for a free app.
- UK Online Safety Act duties are already live: an illegal-content risk
  assessment and a children's access assessment must exist on file.
- GDPR: social visibility needs its own consent, distinct from Article 9;
  bodyweight and health metrics default private in any social surface;
  location off by default; erasure must cascade through caches.
- ED-safety: no calorie or restriction content as a post type; no
  engagement-ranked body content; a dedicated "harmful body or eating
  content" report reason.
- No published density thresholds exist for progressive local surfacing;
  any number is an internal choice and must be labelled as one.

**The tree (01-05).**
- Partners is a well-guarded 1:1 pairing with a derived weekly tick, one
  daily cheer, an aim, a shared block name and approved win cards. It has
  six local tables, six cloud tables, a direct-Supabase service module,
  live invite links in the wild, and roughly twenty source-level guards.
- There is no username, no bio, no public profile, no avatar sync, no
  storage bucket, no realtime, no moderation surface, no rate limiter and
  no cross-user read anywhere except the partner pair predicate.
- The reusable rails are real: the Skia share-card renderer and its
  privacy carve-outs, the consent_log rail, the send-push pipeline and
  device tokens, the notification category / budget / quiet-hours
  framework, the linking config and AASA, the SECURITY DEFINER RPC
  pattern with write-path lockdown, and the deletion pipeline.
- The tab bar is Today / Train / Nutrition / Progress / Coach, five tabs,
  all screens self-render their header, and the Today root header has a
  `right` slot.

## 2. The 25-user answer

If there were 25 active users tomorrow, Community is worth opening because:
1. **Programmes travel.** A shared programme is a structural snapshot that
   another lifter can use as-is or have Volyume re-fit to their equipment,
   exclusions and limitations, with every change explained. Even five
   good programmes from five people is a better library than most apps'
   marketplaces, and Volyume's own library plans sit beside them,
   labelled as Volyume's.
2. **Training stories are real.** A post is generated from logged training
   (a PR, a completed block, a session, a milestone) and carries a caption.
   The feed is only human-authored moments, never every session, so 25
   people produce a feed that is all signal.
3. **Relevance beats count.** With 25 people, "trains kettlebell, runs the
   same programme, lists the same town" is a real reason to follow someone.
   Suggestions are built from chosen profile facts, never popularity.
4. **It is useful at one.** Sharing a programme or a story outside Volyume
   produces a web page a non-user can actually read. That is the growth
   loop and it needs no network at all.

## 3. What Volyume should NOT build now (and why)

- **Direct messages.** Object-linked comments on posts and programmes are
  where training conversation has value (Caliber, r/Fitness evidence). DMs
  add a harassment surface, a moderation queue and a notification stream
  with no small-network value. Not built.
- **Challenges and leaderboards.** Pointless with few participants (Garmin,
  Strava evidence); cooperative challenges need groups that do not exist
  yet. Not built; revisit only when dimensions show real density.
- **Live "training now" presence.** Needs realtime, active-workout sync and
  a new location-adjacent privacy surface for a signal that is empty at
  small scale. Not built.
- **Free image upload (posts, avatars).** Needs a storage bucket, an image-
  moderation processor with an EU residency check and a DPA, and it is the
  single largest moderation burden. Posts are card-based from real data;
  avatars are presets or initials. Founder question, recorded.
- **Permanent community rooms with their own feeds and admins.** Empty rooms
  are the failure every source names. Dimensions (style, programme, gym,
  area) surface people and programmes only once at least three people
  share them, and they have no separate posting surface.
- **Gym verification, gym leaderboards, gym events.** Honest label instead:
  "Trains at". A gym page is the people who chose that label.
- **Automated adherence broadcast** (the Partners weekly tick). Everything
  shared in Community is a human act. Consistency milestones become posts
  when the user chooses.
- **Any comparison or ranking between people.** Not built.

## 4. What Partners becomes

Retired. Its accountability value is covered by followers-only profiles,
mutual follows and training stories; its data footprint is preserved
untouched in the cloud; active partnerships become accepted mutual follows
when both members create Community profiles; invite links keep resolving
and land on Community with a plain explanation. Full ruling: SD-03.
