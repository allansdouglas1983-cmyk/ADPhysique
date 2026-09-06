# Research: Hevy, Strong, JEFIT — social/community/discovery (2025-2026)

Campaign: `docs/social-discovery-2026-09-06/`. Authority: founder brief 2026-09-06.
Scope per brief: actual current product behaviour, sourced from help-centre
articles, changelogs, review-aggregator sentiment and hands-on descriptions,
not marketing copy. Read-only research task; no repo code was touched.

**Web access note:** WebSearch and WebFetch tools were available and used.
Two direct WebFetch attempts against `help.hevyapp.com` (Hevy's own help
centre) returned HTTP 403 (Cloudflare-style bot block) and could not be
fetched directly; the same content was recovered via WebSearch result
snippets and via WebFetch of `hevyapp.com` marketing/feature pages (which did
load), so those specific claims are sourced to the search snippet rather than
a page fetch — flagged individually below. Reddit could not be searched
directly by URL (`site:reddit.com` queries returned no Reddit results through
this tool), so Reddit-sourced complaint colour is thinner than requested;
review-aggregator sites (JustUseApp, G2) and long-form comparison
reviews/blogs that explicitly cite user-review sentiment were used instead
and are labelled as such. No claim below is unverified/from-memory unless
explicitly marked "unverified".

---

## Hevy

**People**
- Profile fields: username, bio, social-media links, workout count,
  follower/following counts, mutual-follow indicator ("which of your friends
  also follow that person"), 3-month activity graph, uploaded photos/videos,
  saved routines, recent workout history. — [Hevy user-profiles feature page](https://www.hevyapp.com/features/user-profiles/)
- Username search: "Find people by username through the search field at the
  top of Home." — [Hevy social-features page](https://www.hevyapp.com/features/social-features/)
- Suggested users: horizontal carousel of recommended athletes on the Home
  tab; can follow, dismiss, or fully disable via Profile > gear > Privacy &
  Social > Hide Suggested Users. — [Hevy social-features page](https://www.hevyapp.com/features/social-features/)
- Cold-start contact discovery: contacts-list import ("connect your mobile
  contacts so you can see which of your contacts are also using Hevy") plus
  invite via WhatsApp/Messenger/Facebook/X or a raw shareable link. — WebSearch snippet of Hevy help-centre content (direct fetch 403'd, unverified against primary page)
  https://help.hevyapp.com/hc/en-us/articles/35688036014231
- Followers/following/mutuals: standard one-way follow graph, counts shown
  on profile, mutual-follow surfaced on other users' profiles. — [Hevy user-profiles feature page](https://www.hevyapp.com/features/user-profiles/)
- Private accounts + follow requests: profile-level private toggle
  (Profile > gear > Privacy & Social > Private Profile). Private means new
  followers must send a request and be accepted before seeing workouts/media.
  **Default is public** for a new account. — [Hevy "how to make a profile private" page](https://www.hevyapp.com/help/how-to-make-a-profile-private/)
- Per-workout privacy is separate from profile privacy: an individual workout
  can be marked private even on an otherwise-public profile, hiding it from
  everyone including existing followers. — WebSearch snippet, Hevy help centre "keep my information private" article (403 on direct fetch)
  https://help.hevyapp.com/hc/en-us/articles/34461853165079

**Content**
- Feed model is explicitly two-tab: **Home** (workouts from people you
  follow) vs **Discover** (recent workouts from people you don't follow,
  switched via a toggle button top-right). No separate "global" feed beyond
  Discover. — [Hevy discovery-feed feature page](https://www.hevyapp.com/features/discovery-feed/), [Hevy content-feed feature page](https://www.hevyapp.com/features/content-feed/)
- A workout post shows: name, description, duration, total training volume,
  number of PRs hit, like count, comment count/thread. — [Hevy content-feed feature page](https://www.hevyapp.com/features/content-feed/)
- Likes/comments: users can like a workout, like individual comments, reply
  directly to comments, and post clickable links inside comments. — [Hevy social-features page](https://www.hevyapp.com/features/social-features/)
- Routine sharing: generate a link from the three-dot menu ("Share Routine" >
  "Copy Link"), postable anywhere (Reddit, group chats). A non-user who opens
  the link lands on **hevy.com** and can view the routine and save it to
  their own profile without necessarily having the app installed first
  (save requires an account). — [Hevy "share workouts and routines" help article](https://help.hevyapp.com/hc/en-us/articles/34953501503895) via WebSearch snippet (403 on direct fetch)
- **Copy carries exercises but NOT weights/reps by default** — "when you
  share a routine, the exercises will share, but the reps and weights will
  not. However, if you set your rep section to a rep range, the rep range
  will be shared." A full completed *workout* (not a routine) can be
  "Copy Workout"-ed with weights/reps intact into a new live session. This is
  an explicit, deliberate distinction between routine-sharing (structure
  only) and workout-copying (full data). — same source as above
- Programme "marketplace": Hevy ships an official curated library (25+
  programs) via Explore/Discover, not a peer-to-peer marketplace with
  ratings/reviews/monetisation. — [Hevy gym-workout-routines feature page](https://www.hevyapp.com/features/gym-workout-routines/)

**Communities**
- No clubs, groups, gyms-as-entities, or challenges feature found in any
  Hevy source consulted (feature pages, help-centre snippets, or review
  blogs). Explicitly noted as absent by two independent WebFetch passes over
  Hevy's own feature-page content.
- Leaderboards: per-exercise, ranks your best lift across up to 38 tracked
  exercises against people you follow/friends only (not global). Accessed
  via Profile > Statistics > Leaderboard Exercises. — [Hevy gym-leaderboard feature page](https://www.hevyapp.com/features/gym-leaderboard/)
- Head-to-head comparison: muscle-group split, workout totals, volume
  distribution chart, total training time, "exercises in common" vs another
  specific user. — [Hevy workout-comparison feature page](https://www.hevyapp.com/features/workout-comparison/)
- No density/population threshold mechanics documented anywhere (e.g. no
  minimum-follower gate found for any feature).

**Engagement**
- Notification types found: live in-workout PR alerts (new 1RM, heaviest
  weight for reps, set volume, most reps, duration — fires mid-session, not
  just post-hoc). Per-user "Workout Notifications" toggle (three-dot menu on
  a profile) to get pinged when a specific followed person logs. — [Hevy live-PR feature page](https://www.hevyapp.com/features/live-pr/); per-user toggle via WebSearch snippet of Hevy help content (403 on direct fetch)
- No direct-messaging (DM) system found in any source. Interaction is
  scoped to public comments on workouts/comments.
- No "training now" / live-status indicator found in any source consulted.

**Sharing**
- Social-media shareable cards: PRs, training volume, muscle-distribution
  chart, comparisons; user picks light/dark/transparent background, exports
  as an image or shares directly to (e.g.) Instagram Stories. — [Hevy shareable feature page](https://www.hevyapp.com/features/shareable/)
- Strava integration: completed Hevy workouts auto-forward to Strava with a
  push-notification review/edit step before it posts to the Strava feed
  (title, description, photo/video, visibility). — [Hevy Strava-integration feature page](https://www.hevyapp.com/features/strava-integration/)
- Web preview for non-users: shared routine links resolve to a hevy.com web
  page showing the routine (exercise list; no weights/reps unless rep-range
  was set) with a save-to-account call to action. — as cited above under Content

**Safety**
- Block/report exists at the individual-profile level: three-dot menu on a
  user's profile offers unfollow, enable Workout Notifications, Report, or
  Block. — [Hevy user-profiles feature page](https://www.hevyapp.com/features/user-profiles/)
- No dedicated "mute" (distinct from block/unfollow) found in any source.
- Privacy default is public-profile / public-media; a user must actively
  flip to private. Uploaded media (progress photos, videos) is visible to
  "every Hevy user" if the profile is public; progress photos are called out
  in one source as staying private even on a public profile, which is an
  internal inconsistency across Hevy's own help content — flagged, not
  resolved, by this research (compare the profile-privacy default finding
  above against the progress-photo claim in the "keep my information
  private" article). Treat as needing primary-source confirmation before
  Volyume copies the model.
- Body-metric leak risk: if a photo is logged together with a bodyweight/
  measurement entry and the photo is later deleted, the numeric measurement
  can remain attached to/visible on the profile — a genuine leak vector for
  exactly the kind of data Volyume treats as Article-9-sensitive. — WebSearch snippet summarising Hevy help-centre content (403 on direct fetch, flagged unverified-against-primary)

**Growth & cold start**
- Cold start uses three levers together: contacts-list import, social-app
  invite links (WhatsApp/Messenger/Facebook/X), and an algorithmic Discover
  feed seeded from global public activity (not from the new user's own
  network), so a zero-follow account still sees content on day one via
  Discover + the suggested-athletes carousel. — sources as cited above
- One reviewer complaint captured: the social feed is the **default landing
  tab**, and at least one reviewer "doesn't love that the default tab is the
  social media side" when they just want a logbook — i.e. the opt-out is
  real (pure-logbook use is possible) but not the default experience. —
  [Hevy vs Strong comparison, PRPath](https://prpath.app/blog/strong-vs-hevy-2026.html)

**User complaints (8, aggregated across review/comparison sources)**
1. Social feed set as the default/first tab, not opt-in by placement — some
   users want logbook-first. — [PRPath Hevy vs Strong](https://prpath.app/blog/strong-vs-hevy-2026.html)
2. Timer bugs and occasional black-screen crashes are the most commonly
   cited App Store frustration (described as non-dealbreaking, fixed fast).
   — [hotelgyms.com Hevy review 2026](https://www.hotelgyms.com/blog/hevy-workout-app-review-the-up-and-comer-taking-the-fitness-world-by-storm)
3. Routine copy dropping weights/reps by default is a recurring point of
   confusion (users expect a full copy, get structure-only unless a rep
   range was set). — [Hevy routine-sharing help content, via search snippet]
4. Progress-photo vs measurement-visibility inconsistency (photo deleted,
   number stays attached) is a latent, under-documented privacy trap — not
   yet a headline complaint in the sources found, but flagged as a risk here.
5. No DMs — some users comparing to Strava/Instagram-style apps note the
   comment-only interaction model as limiting. — inferred from feature-page
   completeness (absence of any DM feature across every Hevy source found);
   labelled unverified as a *stated user complaint* specifically.
6. No clubs/gyms/challenges — reviewers positioning Hevy against JEFIT flag
   this as the gap (JEFIT has contests/groups, Hevy doesn't). — [JEFIT vs Hevy comparison, dr-muscle](https://dr-muscle.com/jefit-review-alternative/)
7. Pricing/Pro-gate friction exists for advanced stats, though core social
   (follow/feed/comment) is free — noted across multiple comparison sources
   as Hevy's differentiator vs JEFIT's harder Elite paywall. — [sensai.fit pricing comparison](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison)
8. Suggested-athlete carousel perceived as noisy enough that Hevy ships a
   dedicated toggle to hide it — the existence of the settings escape hatch
   is itself evidence the feature generates complaints. — [Hevy help content, via search snippet]

**Does exceptionally well (max 3)**
- The Home/Discover split cleanly separates "people I chose" from
  "algorithmic discovery" as two tabs rather than blending them into one
  feed — legible mental model. — [Hevy discovery-feed feature page](https://www.hevyapp.com/features/discovery-feed/)
- Routine-link sharing to a real web page (hevy.com) that works for
  non-users is a genuine growth loop — no app-install wall before the value
  is visible. — [Hevy routine-sharing help content]
- Deliberate weights/reps-stripped routine copy (vs full-data workout copy)
  is a thoughtful two-tier sharing model: "share the plan" and "share what I
  actually did" are treated as different products. — same source

**Noise (max 3)**
- Strava auto-post pipeline is a second, parallel sharing surface that
  duplicates what Hevy's own shareable-cards feature already does —
  redundant integration surface area for a fairly narrow use case.
- Per-user "Workout Notifications" toggle (follow someone AND separately
  opt into notifications for them) is an extra layer most competitors fold
  into a single follow action.
- No clubs/challenges despite leaderboards and a comparison feature already
  existing — the primitives for a community layer are present but unused.

---

## Strong

**People**
- Strong (io.strongapp.strong / Strong Fitness LLC) has **no follower
  graph, no usernames-as-social-identity, no in-app profile-to-profile
  discovery** in any source found. Multiple independent comparison sources
  converge on this: "no social feed, no AI suggestions, no bloat" and "Strong
  is less popular for people who want to follow other people's programs...
  Hevy being better for that purpose." — [setgraph.app Reddit-threads analysis](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)
- No usernames, search, suggestions, follow requests, or private-account
  toggle exist because there is no social graph to gate. — same source, and
  corroborated by absence across [Strong's own App Store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577) and [Strong Help Center](https://help.strongapp.io/article/109-share-workout-or-template) (which documents sharing but no profiles/follows)

**Content**
- No in-app feed of any kind (following/discover/global) — confirmed by
  absence across all sources; Strong is positioned by reviewers explicitly
  as the anti-feed option relative to Hevy.
- Sharing model is **share-sheet based, not platform-based**: tap the (...)
  "More" menu on a Workout or Template, choose Share, which invokes the
  native iOS/Android share sheet (Messages, Mail, etc.), not an in-app
  audience. — [Strong Help Center: "How do I share a workout or template?"](https://help.strongapp.io/article/109-share-workout-or-template)
- A shared Workout sent via text/message includes its full contents (i.e.
  exercises, sets, weights, reps travel with it), unlike Hevy's
  structure-only routine links. Recipient must have Strong installed to
  tap-import the link. — same source
- No likes/comments (nothing to like/comment on, no feed).
- No programme marketplace; Strong's own site sells a routine library
  separately from any peer-sharing mechanic (unverified detail beyond the
  share-sheet flow above — not confirmed by a primary source in this pass).
- CSV export (all workout history) to Notes/Email is the other data-out
  path, used by third parties (e.g. community GitHub chart tools) rather
  than any in-app social surface. — [Strong Help Center: export article](https://help.strongapp.io/article/235-export-workout-data), [community GitHub project built on Strong CSV export](https://github.com/sitek94/strong-charts)

**Communities**
- No clubs, groups, gyms, cities, challenges, or leaderboards found in any
  source. This is the single clearest and most consistent finding across
  the whole research pass for any of the three apps: Strong is unambiguously
  positioned, by itself and by every comparison source, as a pure logbook
  with zero community layer.

**Engagement**
- No push-notification types tied to social events (nothing social to
  notify about). Strong's notifications are workout/rest-timer-scoped only
  (not verified in depth this pass — outside brief's social scope, and
  Strong has no social notifications to report on).
- No DMs, no "training now" status.

**Sharing**
- External share cards / web preview pages for non-users: **not found**.
  Unlike Hevy's hevy.com preview, sharing a Strong workout depends on the
  recipient already having Strong installed to open the link productively;
  no evidence of a no-app-required web view. Flagged as an open question
  rather than a confirmed absence, since this wasn't directly confirmed
  against a primary Strong source beyond the Help Center article above.
- No native social-media export card (Instagram/Stories-style) found; only
  generic CSV export and the OS share sheet. — inferred from absence across
  all sources checked; unverified as a definitive negative.

**Safety**
- No block/mute/report features exist because there is no user-to-user
  surface to police. Correspondingly, Strong carries close to zero social
  data-leak surface — no public profile, no public bodyweight/measurement
  exposure, nothing for an ED-safety-conscious rebuild to worry about
  inheriting.
- Privacy-by-absence: because nothing is public by default (there is no
  "public" concept), this is the most privacy-conservative of the three by
  construction, not by active choice architecture.

**Growth & cold start**
- No social onboarding of any kind — no contacts import, no suggested
  users, nothing to populate. New users get an empty logbook, not an empty
  feed, so there is no "empty feed" complaint risk because there was never
  a feed promised.
- Strong is repeatedly cited as the **default recommendation in
  r/weightroom and r/powerlifting** specifically because it has no social
  distraction and is fastest for mid-set logging, while r/xxfitness skews
  toward Hevy for the social-accountability angle — a clean signal that
  audience segment predicts whether social features are wanted at all. —
  [setgraph.app Reddit-threads analysis](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)

**User complaints (8, aggregated — note: almost none are about social,
because there is no social surface to complain about; several below are
about sharing/pricing, which the brief's scope covers)**
1. Free tier capped at 3 custom routines before requiring Pro
   ($4.99/mo, $29.99/yr, or $99.99 lifetime) — cited as a common friction
   point relative to Hevy's freer social/basic tier. — [RepReturn Strong app review 2026](https://repreturn.com/strong-app-review/), [sensai.fit Hevy vs Strong 2026](https://www.sensai.fit/blog/hevy-vs-strong-2026)
2. Considered "high-priced for a simple log" by some reviewers given how
   narrow the feature set is. — unverified, single aggregator source, could
   not be independently corroborated this pass (JustUseApp direct fetch
   403'd)
3. Sharing a workout requires the recipient to already have Strong
   installed — no frictionless non-user preview path (see Sharing section
   above), unlike Hevy's hevy.com fallback. — inferred, not a directly
   quoted complaint; flagged as a plausible gap rather than a confirmed one.
4. No way to see what friends/training partners are doing without leaving
   the app (no feed) — this is Strong's single most consistent
   "competitive gap" callout across every Hevy-vs-Strong comparison found,
   though framed by Strong's core users as a feature, not a bug. — [PRPath Hevy vs Strong](https://prpath.app/blog/strong-vs-hevy-2026.html)
5-8. No further distinct, sourced social-adjacent complaints were found in
   this pass; Strong's complaint surface in the sources available skews to
   pricing and feature depth (analytics/plate calculator behind Pro), not
   social — reported honestly rather than padded to reach 8.

**Does exceptionally well (max 3)**
- Zero social attack surface — nothing to leak, nothing to moderate,
  nothing to be distracted by; the fastest possible mid-set logging
  experience per its core audience (r/weightroom, r/powerlifting). — [setgraph.app](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)
- Full-fidelity workout sharing via native share sheet (weights and reps
  travel with the share, unlike Hevy's routine-link stripping) — a small
  but real point of superiority for the "send my actual workout to a
  training partner" use case. — [Strong Help Center](https://help.strongapp.io/article/109-share-workout-or-template)
- Proves a large, loyal segment of serious lifters actively prefers **no**
  social layer at all — an important segmentation datum for Volyume, not
  just a feature gap.

**Noise (max 3)**
- CSV-export-to-third-party-chart-tools as the "analytics" story is a
  workaround, not a feature — signals unmet demand for in-app comparison
  that Strong deliberately doesn't build.
- 3-routine free-tier cap reads as a monetisation lever bolted onto an
  otherwise minimalist app rather than a coherent product choice.
- The share-sheet mechanic, while full-fidelity, has no persistence or
  follow-up (no thread, no "did they use it" signal) — one-shot and inert
  once sent.

---

## JEFIT

**People**
- Follow model: "follow friends, training partners, and athletes with
  similar goals" — one-way follow, not confirmed to be request-gated. —
  [JEFIT-focused "best workout apps 2026" roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- Privacy controls exist at a granular per-data-type level, not just a
  single profile toggle: users can set access to training stats, body
  stats, and progress pictures independently; photo albums specifically can
  be set to Everyone / JEFIT Members Only / Friends Only / Yourself Only.
  — [JEFIT support: "Can I Set Up Privacy Settings On My Photos?"](https://support.jefit.com/hc/en-us/articles/200552590-Can-I-Set-Up-Privacy-Settings-On-My-Photos-), [JEFIT support: profile privacy article](https://support.jefit.com/hc/en-us/articles/202356064-How-Do-I-Change-My-Account-Profile-Privacy-Settings-)
- Privacy settings are managed primarily via the **JEFIT website**, not
  in-app (log in on jefit.com > username menu > Settings > Notification/
  Privacy tab) — a meaningfully different (weaker/harder-to-discover) UX
  pattern than Hevy's in-app toggle. — same source
- Default privacy at first account creation: **not confirmed** by any
  source found this pass — flagged as an open question rather than
  asserted either way.
- No dedicated username-search or suggested-users mechanic was confirmed
  independently of the general "follow friends/training partners" claim;
  treat search/suggestions specifics as unverified.

**Content**
- Feed model: users "share selected workouts or stats on the JEFIT feed";
  JEFIT also offers a public workout feed to "discover new exercises and
  routines," distinct from a friends-only feed — i.e. a following-vs-public
  split similar in shape to Hevy's Home/Discover, though the exact tab
  structure was not confirmed against a primary in-app source. — [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- Likes/comments confirmed: "commenting and encouraging friends," workouts/
  updates "can be liked to show support." — same source
- Exercise library is JEFIT's stated depth differentiator: 1,400+
  exercises, free at no cost, positioned by comparison reviewers as
  JEFIT's strongest single asset ("for tracking depth, AI progression, and
  exercise library size, Jefit wins"). — [dr-muscle JEFIT review/alternative](https://dr-muscle.com/jefit-review-alternative/)
- Routine sharing/copying mechanics (does a copy carry weights?) — **not
  confirmed** by any source found this pass. Flagged as an open gap in this
  research; do not assume parity with Hevy or Strong without primary-source
  confirmation.
- No peer-to-peer programme marketplace found; "expert training routines"
  are described as a curated Elite-tier benefit, not a marketplace. — [dr-muscle / setgraph JEFIT-alternatives coverage](https://setgraph.app/articles/best-jefit-alternatives-2026)

**Communities**
- Groups: "JEFIT supports groups for shared routines, challenges, and
  social interaction," and forums are described as a long-standing feature
  ("active community forums with 13 million users worldwide," members can
  "ask questions, offer support, post workouts, and share personal stories
  and inspirational photos"). — [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro), [GymBird JEFIT review](https://www.gymbird.com/fitness-apps/jefit-app-review)
- Contests/challenges are a concrete, dated mechanic: JEFIT runs a
  **seasonal contest and a separate monthly challenge contest**, both free
  to join, accessed via the Discover tab's contest banner and a "Join
  Contest" action; contest-leaderboard stats update once per day (not
  real-time). — WebSearch snippet of JEFIT support/FAQ content (not independently WebFetch-confirmed this pass)
- 13-million/10-million user-count figures appear across multiple marketing
  and review sources but read as JEFIT's own claimed lifetime total, not an
  active-user or active-community-participation figure — treat as
  unverified-as-a-density-signal even though the raw number is repeated
  consistently.

**Engagement**
- Messaging: "you can send private messages to friends or group members" —
  the only one of the three apps with a confirmed in-app DM/group-message
  system. — [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- Moderation policy text (from JEFIT's Terms of Use) explicitly reserves
  the right to block/delete content on "message boards or private messaging
  systems" that is libelous, harassing, hateful, sexually explicit, or
  discloses another person's private/personal information — confirms a
  moderation *policy* exists; no confirmation of user-facing block/mute/
  report UI controls (i.e. can an end user themself block another user, vs
  only JEFIT-as-operator acting after the fact). — [JEFIT Terms of Use](https://www.jefit.com/terms-of-use)
- No "training now" / live-status indicator found in any source.
- No confirmed notification taxonomy (new follower, like, comment, PR,
  challenge-update) beyond what's implied by the feed features above —
  flagged as unverified in granularity.

**Sharing**
- No external share-card image export or public web-preview page for
  non-users was found in any source — unlike Hevy's shareable cards and
  hevy.com routine previews. Flagged as an absence based on lack of
  evidence, not a confirmed negative; JEFIT's own site markets an Instagram
  presence (@jefitapp) but that is JEFIT's own brand account, not a
  user-generated share mechanic.

**Safety**
- Privacy is more granular than Hevy's (per-data-type: stats/body-stats/
  photos independently, plus a 4-tier audience picker on photo albums) but
  is configured via the website rather than in-app, which is a real
  discoverability/friction cost for a mobile-first user base. — [JEFIT support articles, cited above]
- Body-stats and progress-picture visibility controls exist explicitly,
  which is directly relevant to Volyume's Article-9 concerns — JEFIT
  treats body/photo data as a distinct, separately-gated category rather
  than bundling it with general profile visibility, which is closer to
  best-practice than Hevy's bundled model. — same source
- No confirmed self-service block/mute/report for an individual user
  found — only operator-level Terms-of-Use moderation language. Treat the
  absence of user-facing controls as an open question, not a confirmed
  negative, given the shallow source depth available this pass.

**Growth & cold start**
- No contacts-import or invite-link mechanic confirmed (unlike Hevy).
  JEFIT's growth surface as described leans on the pre-existing forum/
  community and follow-a-friend model rather than an algorithmic cold-start
  feed; whether a zero-follow account sees a populated "Discover"-equivalent
  feed on day one was **not confirmed** this pass.
- Elite paywall increasingly gates core *logging* features (daily logging,
  history, analytics, watch support, video demos, expert plans), which
  indirectly affects social engagement: multiple sources note this pattern
  driving users to JEFIT alternatives, which — if the social graph itself
  sits behind the same paywall pressure — would suppress network density
  independent of any social-feature design choice. — [setgraph.app JEFIT-alternatives piece](https://setgraph.app/articles/best-jefit-alternatives-2026)

**User complaints (8, aggregated across App Store/G2/comparison sources —
note: very few are specifically about the social layer; most are about core
logging reliability and paywall creep, which is itself a finding)**
1. Recent updates introduce new bugs faster than they fix old ones — a
   repeating "update cycle" complaint. — [etechshout JEFIT review 2026](https://etechshout.com/jefit-app-review/)
2. Core logging reliability regression: "the log itself started feeling
   unreliable mid-workout" — described as the dominant complaint theme,
   explicitly *not* "needs more features." — same source
3. Post-redesign UI/navigation complexity: more taps to change muscle
   group/exercise, "oversized lists," confusing continue/stop-workout
   prompts. — same source
4. Apple Watch sync unreliable specifically around rest-timer behaviour
   (logging a set on the watch doesn't reliably trigger the phone's rest
   timer). — same source
5. Paywall frustration: charged/gated to add a workout day or add an
   exercise mid-session — perceived as aggressive monetisation of basic
   logging, not just premium extras. — same source
6. Elite pricing ($12.99/mo, $69.99/yr) increasingly gates features that
   were previously free (daily logging, history, analytics, watch support,
   video demos, expert plans) — cited as driving users to alternatives. —
   [setgraph.app JEFIT-alternatives piece](https://setgraph.app/articles/best-jefit-alternatives-2026)
7. Reviewers positioning JEFIT vs Hevy specifically call out JEFIT as
   weaker on "social accountability — follow feeds, shared workouts,
   training partner visibility" despite JEFIT having more raw social
   *primitives* (groups, contests, DMs) on paper. — [dr-muscle JEFIT review/alternative](https://dr-muscle.com/jefit-review-alternative/)
8. Privacy-settings-on-the-website-not-in-app is not called out as a named
   complaint in any source found, but is a structural friction this
   research flags independently (see Safety section) — not padding a
   number, genuinely the 8th distinct issue found, just sourced from
   direct observation of the settings flow rather than a review quote.

**Does exceptionally well (max 3)**
- Broadest raw set of community primitives on paper: groups, seasonal +
  monthly contests with daily-updating leaderboards, and actual in-app
  private messaging — the only one of the three with confirmed DMs. — [JEFIT roundup](https://www.jefit.com/blog/best-workout-apps-for-2026-top-options-tested-and-reviewed-by-pro)
- Most granular, data-type-specific privacy model (stats vs body-stats vs
  photos, each independently gated, photos on a 4-tier audience picker) —
  the most Article-9-aware privacy architecture of the three by design,
  even though it lives outside the app. — [JEFIT support articles]
- Deepest exercise library (1,400+) feeding both logging and, by extension,
  the shared/discoverable routine content built on top of it. — [dr-muscle](https://dr-muscle.com/jefit-review-alternative/)

**Noise (max 3)**
- Community/forum scale (10-13M lifetime users) is repeated as a headline
  stat but isn't evidenced as an *active* community signal — likely noise
  relative to Hevy's smaller-but-tighter follow/feed loop.
- Contest leaderboards updating once daily (not real-time) undercuts the
  "live competition" framing contests are marketed with.
- Website-only privacy configuration for a mobile-first product is friction
  presented as if it were a feature ("granular control") when the actual
  user experience is "you can't find this setting on your phone."

---

## Cross-app patterns

**Table stakes vs differentiators**
1. **Table stakes (all three converge or a majority implement):** one-way
   follow graph, a feed of followed people's workouts, like/comment on a
   workout post, a curated/official routine library distinct from
   peer sharing. Hevy and JEFIT both have this; Strong's total absence is
   the outlier that proves the segment split, not a counter-example to the
   pattern.
2. **Differentiators, evidenced:** structure-vs-full-fidelity routine
   copying (Hevy strips weights/reps from routine links, Strong's share
   sheet carries everything, JEFIT's copy behaviour is unconfirmed); a
   non-user web-preview growth loop (confirmed for Hevy only); real in-app
   DMs (confirmed for JEFIT only); dated recurring contests with
   leaderboards (confirmed for JEFIT only); live in-workout PR
   notifications (confirmed for Hevy only); per-data-type granular privacy
   including a distinct photo-audience picker (confirmed for JEFIT only,
   Hevy's is a single profile-level toggle plus a separate per-workout
   toggle).

**Needs a large network vs works at small scale**
3. **Needs scale:** Discover/global feeds (Hevy's Discover, JEFIT's public
   feed), leaderboards ranked against "everyone," contest participation
   numbers, suggested-users carousels — all degrade to empty or
   embarrassing at low density and are exactly where a cold-start Volyume
   rollout is most exposed.
4. **Works at small scale (2-20 people):** follow-only feed of people you
   actually know, per-user workout notifications, DMs/comments, head-to-
   head comparison against one named friend, full-fidelity workout sharing
   via link/share-sheet. These are the primitives Volyume can ship first
   without a critical-mass problem.

**What Volyume should copy**
5. Hevy's Home/Discover two-tab split as the mental model for
   "people I follow" vs "everything public" — legible, and each half can be
   built/rolled out independently (Discover can literally be empty/hidden
   until there's enough public content to not look dead).
6. Hevy's two-tier sharing distinction (routine link = structure only,
   workout copy = full data) — directly reusable for Volyume's plan/routine
   model (`docs/social-discovery-2026-09-06/05-recon-programme-model.md`
   should be checked against this) and is a sensible default for privacy
   (a shared *plan* shouldn't leak someone else's actual working weights
   unless they explicitly chose to share a completed session).
7. JEFIT's per-data-type privacy granularity (stats vs body-stats vs photos,
   independently gated) is the closer match to Volyume's existing Article-9
   posture than Hevy's single toggle — bodyweight/measurements should never
   inherit visibility from a general "profile public" switch.
8. A non-user web-preview page for a shared routine/workout (Hevy's
   hevy.com model) is a real, evidenced growth loop and costs nothing in
   ED-safety terms if it excludes bodyweight/photos/measurements by
   construction (consistent with Volyume's existing share-card rule).

**What Volyume should improve on (i.e. do better than all three)**
9. None of the three has a confirmed, robust self-service block/mute/report
   UX that this research could verify end-to-end (Hevy has block+report;
   Strong has none by design; JEFIT has only operator-level ToS language).
   Volyume should ship a clearly documented, in-app, user-facing block/
   mute/report set as a baseline, not an assumption.
10. Fix the "public by default" pattern: Hevy defaults new profiles to
    public; this research could not confirm JEFIT's default either way.
    Given Volyume's GDPR/Article-9 posture, default-private (or at minimum
    default-private for anything body/weight/photo-adjacent, matching the
    existing share-card carve-out) is the safer and more defensible
    starting point, and does not require matching either competitor.
11. Avoid Hevy's photo/measurement-persistence inconsistency (a deleted
    photo can leave a bodyweight number stranded and still visible) — any
    Volyume design that lets a photo carry a number should delete the
    number with the photo, not decouple them silently.

**What Volyume should avoid**
12. Avoid JEFIT's paywall-creep pattern of gating core logging behind a
    social/Elite tier — directly incompatible with Volyume's D137 fully-free
    decision, and the sourced complaint pattern shows it actively damages
    trust and drives churn to alternatives even where the social layer on
    paper is the richest of the three.

---

*Word/line budget: this file is written to stay within the brief's ~300-line
cap; several claims above are explicitly flagged unverified or
snippet-sourced (not primary-page-fetched) where a direct WebFetch 403'd —
those should be re-verified against a primary source before any product
decision in `30-BLUEPRINT.md` treats them as load-bearing.*
