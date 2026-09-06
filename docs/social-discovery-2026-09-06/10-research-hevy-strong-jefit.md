# Research: Hevy, Strong, JEFIT — social/community/discovery (2025-2026)

Campaign: `docs/social-discovery-2026-09-06/`. Authority: founder brief
2026-09-06. Read-only research; no repo code touched.

**Web access note:** WebSearch and WebFetch were available and used. Two
direct WebFetch calls to `help.hevyapp.com` returned HTTP 403 (bot-blocked);
that content was recovered via WebSearch snippets instead and is marked
"(snippet, 403 on direct fetch)" below — treat those as slightly less firm
than a page fetch. `site:reddit.com` queries returned no actual Reddit
results through this tool, so Reddit colour is thinner than requested;
review-aggregator/comparison-blog sources that explicitly cite review
sentiment were used instead. Nothing below is from memory unless marked
"unverified".

---

## Hevy

**People**
- Profile shows: username, bio, social links, workout count, follower/
  following counts, mutual-follow indicator, 3-month activity graph, media,
  saved routines, recent workouts. Username search on Home. [user-profiles](https://www.hevyapp.com/features/user-profiles/), [social-features](https://www.hevyapp.com/features/social-features/)
- Suggested-athletes carousel on Home; can hide entirely (Profile>gear>
  Privacy & Social>Hide Suggested Users). [social-features](https://www.hevyapp.com/features/social-features/)
- Cold-start: contacts-list import + invite via WhatsApp/Messenger/
  Facebook/X or a link. (snippet, 403 on direct fetch)
- Private-profile toggle gates new followers behind a request/accept flow;
  **default is public** for a new account. [make-a-profile-private](https://www.hevyapp.com/help/how-to-make-a-profile-private/)
- Per-workout privacy is separate from profile privacy — a single workout
  can be hidden even on a public profile. (snippet, 403 on direct fetch)

**Content**
- Feed is two tabs: **Home** (followed people) vs **Discover** (everyone
  else), toggled top-right. No third "global" feed. [discovery-feed](https://www.hevyapp.com/features/discovery-feed/), [content-feed](https://www.hevyapp.com/features/content-feed/)
- A post shows: name, description, duration, volume, PR count, likes,
  comments (with reply and clickable links in comments). [content-feed](https://www.hevyapp.com/features/content-feed/), [social-features](https://www.hevyapp.com/features/social-features/)
- Routine sharing = link via three-dot menu > Share Routine > Copy Link;
  opens on **hevy.com** for non-users, who can view and save without the
  app. **Copy carries exercises but strips weights/reps** unless a rep
  range was set (rep range does carry). A completed *workout* can instead
  be "Copy Workout"-ed with full weights/reps into a new live session — a
  deliberate plan-vs-log distinction. (snippet, 403 on direct fetch, help article 34953501503895)
- No peer marketplace; Explore/Discover surfaces an official curated
  25+ program library. [gym-workout-routines](https://www.hevyapp.com/features/gym-workout-routines/)

**Communities**
- No clubs/groups/gyms/challenges found anywhere in Hevy's own feature
  pages or reviews.
- Leaderboards rank best lift across up to 38 exercises against people you
  follow (not global); accessed Profile>Statistics>Leaderboard Exercises.
  [gym-leaderboard](https://www.hevyapp.com/features/gym-leaderboard/)
- 1:1 comparison vs a named user: muscle split, totals, volume chart, time,
  exercises in common. [workout-comparison](https://www.hevyapp.com/features/workout-comparison/)
- No density/threshold mechanics documented anywhere.

**Engagement**
- Live in-workout PR notification (new 1RM/heaviest-for-reps/volume/reps/
  duration), fires mid-session. [live-pr](https://www.hevyapp.com/features/live-pr/)
- Per-followed-user "Workout Notifications" toggle (opt-in beyond follow).
  (snippet, 403 on direct fetch)
- No DMs found anywhere. No "training now" live-status indicator found.

**Sharing**
- Shareable image cards (PRs, volume, muscle-distribution, comparisons;
  light/dark/transparent bg) exportable to Instagram Stories etc.
  [shareable](https://www.hevyapp.com/features/shareable/)
- Strava auto-forward on save, with a review/edit push notification before
  it posts (title, description, media, visibility). [strava-integration](https://www.hevyapp.com/features/strava-integration/)
- hevy.com is the non-user web preview for shared routines (see Content).

**Safety**
- Block/Report exist per-profile (three-dot menu: unfollow, Workout
  Notifications, Report, Block). No separate "mute" found. [user-profiles](https://www.hevyapp.com/features/user-profiles/)
- Default-public profile/media is the main risk: "every Hevy user" can see
  uploaded media on a public profile. One source claims progress photos
  stay private even on a public profile — this conflicts with the
  default-public finding above and was not resolved; flag for primary-
  source re-check before Volyume treats either claim as fact.
- Leak vector: if a bodyweight/measurement entry is logged with a photo and
  the photo is later deleted, the number can remain visible — directly
  relevant to Volyume's Article-9 posture. (snippet, 403 on direct fetch)

**Growth & cold start**
- Contacts import + invite links + an algorithmically-seeded Discover feed
  mean a zero-follow account still sees content day one (not an empty feed).
- One reviewer complaint: social is the **default landing tab**, which some
  logbook-only users dislike even though full opt-out (private profile,
  ignore Discover) is possible. [PRPath Hevy vs Strong](https://prpath.app/blog/strong-vs-hevy-2026.html)

**Top complaints:** (1) social feed as default tab annoys logbook-first
users [PRPath](https://prpath.app/blog/strong-vs-hevy-2026.html); (2) timer bugs/occasional crashes, non-dealbreaking, fixed
fast [hotelgyms.com](https://www.hotelgyms.com/blog/hevy-workout-app-review-the-up-and-comer-taking-the-fitness-world-by-storm); (3) routine-copy-drops-weights confusion; (4) photo/
measurement-persistence inconsistency (flagged above, latent risk); (5) no
DMs limits interaction to comments (inferred, not a named complaint);
(6) no clubs/challenges unlike JEFIT [dr-muscle](https://dr-muscle.com/jefit-review-alternative/); (7) advanced-stats Pro-gate
friction though core social stays free [sensai.fit](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison); (8) suggested-athletes
carousel noisy enough that Hevy ships a dedicated hide-toggle.

**Does exceptionally well:** Home/Discover as a clean, separately-rollable
mental model; hevy.com no-install routine preview as a real growth loop;
deliberate two-tier sharing (plan-only vs full-log) treats "share the plan"
and "share what I did" as different products.

**Noise:** Strava auto-post duplicates the in-app shareable-cards feature;
per-user notification toggle is an extra step most competitors fold into
follow; leaderboards/comparison exist but clubs/challenges never got built.

---

## Strong

**People**
- **No follower graph, no usernames-as-identity, no in-app discovery** —
  confirmed convergently: "no social feed, no AI suggestions, no bloat," and
  Strong is "less popular for people who want to follow other people's
  programs... Hevy being better for that purpose." [setgraph.app](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)
- No search/suggestions/follow-requests/private-toggle exist because there
  is no graph to gate — absence corroborated across [App Store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577) and [Strong Help Center](https://help.strongapp.io/article/109-share-workout-or-template).

**Content**
- No feed of any kind. Strong is positioned by reviewers as the explicit
  anti-feed option vs Hevy.
- Sharing is **share-sheet based, not platform-based**: (...) menu on a
  Workout/Template > Share invokes the native OS share sheet. A shared
  Workout carries its **full contents** (exercises, sets, weights, reps) —
  richer-fidelity than Hevy's routine links — but the recipient needs Strong
  installed to import via the link. [Strong Help Center](https://help.strongapp.io/article/109-share-workout-or-template)
- No likes/comments (nothing to react to). No confirmed peer marketplace.
- CSV export of full history to Notes/Email feeds third-party tools (e.g.
  community chart projects) rather than any in-app social surface. [export article](https://help.strongapp.io/article/235-export-workout-data), [example](https://github.com/sitek94/strong-charts)

**Communities**
- No clubs/groups/gyms/cities/challenges/leaderboards anywhere — the
  single clearest, most consistent finding of this whole research pass.

**Engagement / Sharing / Safety**
- No DMs, no live status, no social notifications (nothing social to
  notify about).
- No external web-preview page for non-users was found — a shared link
  depends on the recipient already having Strong installed (unlike Hevy's
  hevy.com fallback); flagged as absence-of-evidence, not a confirmed
  negative for this specific point.
- No block/mute/report because there is no user-to-user surface to police.
  Correspondingly, Strong carries almost zero social data-leak surface —
  no public profile, no public bodyweight exposure. Privacy-by-absence, not
  by active design.

**Growth & cold start**
- No social onboarding at all (no contacts import, no suggestions) — a new
  user gets an empty logbook, not an empty feed, so there's no "empty feed"
  complaint risk since none was promised.
- Cited repeatedly as the **default recommendation in r/weightroom and
  r/powerlifting** for having no social distraction and fastest mid-set
  logging, while r/xxfitness skews to Hevy for social accountability — a
  clean segment-predicts-preference signal. [setgraph.app](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)

**Top complaints:** (1) free tier capped at 3 custom routines before Pro
($4.99/mo, $29.99/yr, $99.99 lifetime) [RepReturn](https://repreturn.com/strong-app-review/), [sensai.fit](https://www.sensai.fit/blog/hevy-vs-strong-2026); (2) "high-priced for a
simple log" per one aggregator (unverified, single source); (3) sharing
requires recipient to already have Strong installed — no non-user preview
path (inferred); (4) no way to see training partners' activity without
leaving the app — Strong's single most consistent "gap" callout across
every Hevy-vs-Strong comparison found, though its own core users frame this
as a feature [PRPath](https://prpath.app/blog/strong-vs-hevy-2026.html). No further distinct sourced complaints found — reported
honestly at 4, not padded to 8; Strong's complaint surface skews to
pricing/feature-depth, not social.

**Does exceptionally well:** zero social attack surface (nothing to leak,
moderate, or be distracted by) while being the fastest mid-set logger for
its core audience; full-fidelity share-sheet sharing (weights/reps travel,
unlike Hevy's stripped routine links); proves a large loyal segment
actively prefers **no** social layer — an important segmentation datum.

**Noise:** CSV-to-third-party-charts as the "analytics" story is a
workaround for unmet in-app demand; 3-routine free cap reads as a bolted-on
monetisation lever; the share-sheet mechanic is one-shot with no thread or
follow-up signal.

---

## JEFIT

**People**
- Follow model: "follow friends, training partners, and athletes with
  similar goals" (one-way; request-gating not confirmed). [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- Privacy is granular and per-data-type — training stats, body stats, and
  progress pictures gated **independently**; photo albums get a 4-tier
  audience picker (Everyone / JEFIT Members Only / Friends Only / Yourself
  Only). [photos privacy](https://support.jefit.com/hc/en-us/articles/200552590-Can-I-Set-Up-Privacy-Settings-On-My-Photos-), [profile privacy](https://support.jefit.com/hc/en-us/articles/202356064-How-Do-I-Change-My-Account-Profile-Privacy-Settings-)
- Settings are managed on the **website**, not in-app — weaker mobile
  discoverability than Hevy's in-app toggle.
- Default privacy at account creation: **not confirmed** by any source
  found — open question, not asserted either way.
- Username search / suggested-users specifics: unverified beyond the
  general follow claim above.

**Content**
- Feed: users "share selected workouts or stats on the JEFIT feed" plus a
  separate public workout feed to "discover new exercises and routines" —
  a following-vs-public split similar in shape to Hevy's, exact tab
  structure not confirmed against a primary in-app source. [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- Likes/comments confirmed ("commenting and encouraging friends," likes
  shown on workouts/updates). Same source.
- Exercise library (1,400+) is JEFIT's stated depth differentiator: "for
  tracking depth, AI progression, and exercise library size, Jefit wins."
  [dr-muscle](https://dr-muscle.com/jefit-review-alternative/)
- Routine copy-carries-weights: **not confirmed** by any source this pass —
  a real gap, do not assume parity with Hevy or Strong without primary
  confirmation.
- No peer marketplace; "expert training routines" are a curated Elite
  benefit. [setgraph.app JEFIT-alternatives](https://setgraph.app/articles/best-jefit-alternatives-2026)

**Communities**
- Groups exist "for shared routines, challenges, and social interaction";
  long-running forums claimed at "13 million users worldwide" (lifetime
  total, not evidenced as active-participation — treat the number as
  unverified-as-a-density-signal). [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro), [GymBird](https://www.gymbird.com/fitness-apps/jefit-app-review)
- Concrete, dated mechanic: a **seasonal contest** and a separate **monthly
  challenge contest**, free to join via a Discover-tab banner; leaderboard
  stats update once **daily**, not real-time. (snippet, not independently
  WebFetch-confirmed)

**Engagement**
- Only one of the three with confirmed **in-app private messaging** to
  friends or group members. [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- JEFIT's Terms of Use reserve the right to block/delete libelous,
  harassing, hateful, sexually-explicit content or content disclosing
  someone else's private data on message boards/DMs — confirms an operator-
  level moderation *policy*; no confirmation of user-facing block/mute/
  report controls. [Terms of Use](https://www.jefit.com/terms-of-use)
- No "training now" indicator; no confirmed granular notification taxonomy
  beyond what the feed/contest features above imply.

**Sharing / Safety**
- No external share-card image export or non-user web-preview page found
  anywhere (JEFIT's own @jefitapp Instagram is a brand account, not a
  user-sharing mechanic) — absence of evidence, not a confirmed negative.
- Privacy is the most Article-9-aware of the three on paper (body-stats and
  photos gated separately from general profile visibility) but the
  website-only configuration is a real friction cost this research flags
  independently (not sourced to a review quote).
- No confirmed self-service block/mute/report for an individual user —
  open question given shallow source depth this pass.

**Growth & cold start**
- No contacts-import/invite-link mechanic confirmed. Growth leans on the
  pre-existing forum/follow model rather than an algorithmic cold-start
  feed; whether a zero-follow account sees a populated feed day one is
  **not confirmed**.
- Elite paywall increasingly gates core *logging* (daily logging, history,
  analytics, watch support, video demos, expert plans) — multiple sources
  note this drives users to alternatives, which would suppress network
  density independent of social-feature design. [setgraph.app](https://setgraph.app/articles/best-jefit-alternatives-2026)

**Top complaints:** (1) update cycles introduce new bugs faster than old
ones are fixed [etechshout](https://etechshout.com/jefit-app-review/); (2) core logging reliability regression — "the log
itself started feeling unreliable mid-workout," explicitly *not* a "needs
more features" complaint (same source); (3) post-redesign UI/nav
complexity, more taps, confusing continue/stop prompts (same); (4) Apple
Watch rest-timer sync unreliable (same); (5) paywall friction even for
adding a workout day/exercise mid-session (same); (6) Elite pricing
($12.99/mo, $69.99/yr) increasingly gates previously-free logging features,
cited as driving churn to alternatives [setgraph.app](https://setgraph.app/articles/best-jefit-alternatives-2026); (7) reviewers rank JEFIT
weaker than Hevy on "social accountability" despite more raw primitives on
paper [dr-muscle](https://dr-muscle.com/jefit-review-alternative/); (8) website-only privacy settings — not a named review
complaint but a structural friction flagged directly from observing the
settings flow.

**Does exceptionally well:** broadest community primitives on paper
(groups, dated contests with leaderboards, confirmed DMs); most granular
per-data-type privacy model (stats/body-stats/photos independently gated,
photos on a 4-tier picker); deepest exercise library (1,400+) underpinning
shareable/discoverable content.

**Noise:** community-scale figures (10-13M) read as a lifetime-user stat,
not an active-community signal; contest leaderboards update only daily,
undercutting the "live competition" framing; website-only privacy config
is friction dressed up as granular control.

---

## Cross-app patterns

**Table stakes:** one-way follow graph, a feed of followed people's
workouts, like/comment on a post, a curated official routine library
distinct from peer sharing — Hevy and JEFIT both have this; Strong's total
absence is the outlier that proves the segment split rather than a
counter-example.

**Confirmed differentiators:** structure-vs-full-fidelity routine copying
(Hevy strips weights/reps, Strong's share-sheet carries everything, JEFIT
unconfirmed); non-user web-preview growth loop (Hevy only); real in-app DMs
(JEFIT only); dated recurring contests with leaderboards (JEFIT only); live
in-workout PR notifications (Hevy only); per-data-type granular privacy
incl. a distinct photo-audience picker (JEFIT only; Hevy has one profile
toggle plus a separate per-workout toggle).

**Needs scale to not look dead:** Discover/global feeds, leaderboards
ranked against "everyone," contest participation counts, suggested-users
carousels — exactly where a cold-start Volyume rollout is most exposed.

**Works at small scale (2-20 people):** follow-only feed of people you
actually know, per-user notifications, comments/DMs, 1:1 comparison against
a named friend, full-fidelity link/share-sheet sharing. Ship these first.

**Copy:**
1. Hevy's Home/Discover two-tab split as the "people I follow" vs
   "everything public" mental model — each half is independently rollable
   (Discover can stay hidden until there's enough public content).
2. Hevy's plan-vs-log sharing distinction (routine link = structure only,
   workout copy = full data) — check against `05-recon-programme-model.md`;
   a shared plan shouldn't leak someone else's actual working weights
   unless they explicitly shared a completed session.
3. JEFIT's per-data-type privacy granularity (stats/body-stats/photos
   independently gated) is closer to Volyume's existing Article-9 posture
   than Hevy's single toggle — bodyweight/measurements should never inherit
   visibility from a general "profile public" switch.
4. A non-user web-preview page for a shared routine/workout (hevy.com
   model) is an evidenced growth loop and costs nothing in ED-safety terms
   if it excludes bodyweight/photos/measurements by construction — matches
   Volyume's existing share-card carve-out.

**Improve on all three:**
5. None of the three has a confirmed, robust self-service block/mute/report
   flow (Hevy: block+report, no mute; Strong: none by design; JEFIT: only
   operator-level ToS language). Ship a clearly documented in-app block/
   mute/report set as a baseline assumption, not an afterthought.
6. Fix "public by default": Hevy defaults new profiles to public; JEFIT's
   default is unconfirmed either way. Given Volyume's GDPR/Article-9
   posture, default-private (at minimum for anything body/weight/photo-
   adjacent, matching the existing share-card rule) is the safer,
   independently-justified starting point.
7. Avoid Hevy's photo/measurement-persistence inconsistency (a deleted
   photo can leave a bodyweight number stranded and visible) — any design
   letting a photo carry a number should delete the number with the photo.

**Avoid:**
8. JEFIT's paywall-creep pattern of gating core logging behind a social/
   Elite tier — directly incompatible with Volyume's D137 fully-free
   decision; the sourced complaint pattern shows it damages trust and
   drives churn even where the social layer is the richest on paper.
9. Hevy's per-user "Workout Notifications" as a second opt-in beyond
   follow — most competitors fold this into a single follow action.
10. JEFIT's website-only privacy configuration for a mobile-first app —
    keep all privacy controls in-app.
11. Strava-style duplicate export pipelines that re-solve a problem the
    app's own share-card feature already solves.
12. JEFIT's "live competition" framing on leaderboards that only update
    daily — if Volyume ships leaderboards, update cadence should match the
    claim made about them.

---

*Several claims above are explicitly flagged unverified or snippet-sourced
(not primary-page-fetched) where a direct WebFetch 403'd — re-verify against
a primary source before `30-BLUEPRINT.md` treats them as load-bearing.*
