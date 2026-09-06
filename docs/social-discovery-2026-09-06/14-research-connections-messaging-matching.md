# 14 — Research: Connections, Messaging & Training-Partner Matching (2025-2026)

Scope: new ground only — does not repeat docs 10-13 (Hevy/Strong/JEFIT;
Strava/Garmin; Boostcamp/Fitbod/Caliber/communities; policy/safety/cold-start).
Failed fetches / unconfirmed claims are marked **unverified**.

---

## 1. Relationship models: follow vs connect vs message

- **Strava**: messaging is a layer on top of follow, not a separate
  connection object. Three-value setting for "who can message me first":
  **Following** (anyone I follow) / **Mutuals** (both sides follow) /
  **No one** (I can still start chats). Per-message **Flag** → Trust &
  Safety; **Block** deletes the whole thread and revokes return access.
  Messaging is hard-gated 18+ (DOB required) and this default is
  non-overridable for a confirmed minor. Group chats exist; exact
  participant cap **unverified**.
  https://support.strava.com/hc/en-us/articles/19255163090573-Messaging-on-Strava
  https://support.strava.com/hc/en-us/articles/4412328250893-Your-Privacy-Control-Defaults-When-You-re-Under-18-on-Strava
- **Garmin Connect (2026 rebuild)**: dropped mutual-request "Connections"
  for Instagram-style one-way Follow; mutual-follow is now a passive
  derived label "Friends" with no confirmed unlock of its own. New
  **Authorized Viewer** role (e.g. a coach) grants full read access
  without any follow relationship — a third, separate grant type.
  Visibility: Only Me / My Followers / Everyone. Source is a dated
  (30 Apr 2026) trade write-up, not Garmin's own press release —
  **flagged as reported, not primary-sourced**.
  https://www.garminnews.com/garmin-connect-update-replacing-connections-with-followers-and-adding-advanced-training-and-privacy-logic/
- **Hevy**: still no DM/chat layer found anywhere in its own feature docs
  as of this pass — follow + public comment + follow-scoped leaderboard
  only. No mutual/"friend" concept found.
  https://www.hevyapp.com/features/social-features/
- **JEFIT**: classic mutual add-friend flow gates private messaging
  (Profile → Friends/Messages/Groups), plus group chats scoped to a
  contest or a gym — closer to the LinkedIn pattern than any other app
  surveyed. https://support.jefit.com/hc/en-us/articles/201502310-How-Do-I-Add-Friends-
  https://www.jefit.com/wp/product-tips-faq/group-chats-are-the-best-tool-for-learning-something-new/
  (blog, not cross-verified against a second source)
- **Peloton**: follow-only; "Invite Friends" to a live class requires
  follow, but no separate mutual-approval "friend" state was found beyond
  the feature's name — **partially unverified**.
  https://support.onepeloton.com/s/article/Peloton-Member-Profiles-How-To-Find-And-Add-Friends
- **LinkedIn pattern** (not re-researched, used as friction ceiling):
  mandatory mutual-accept-before-interact. 2025-2026 trend among the apps
  above runs the other way — asymmetric follow + a narrower gate specific
  to messaging (Strava), or dropping mutual-accept outright (Garmin).
- **What mutuality unlocks, net**: Strava layers a messaging permission on
  the follow graph (no separate connection object); Garmin's "Friends" is
  a label with **no confirmed unlock**; JEFIT gates messaging itself on
  mutual add; Peloton and Hevy show no evidence of a distinct mutual tier.

---

## 2. Training-partner matching products

Not found this pass: **Gymder** — unverified, no results. **"Ladder"**
partner-matching feature — unverified, not found (unrelated companies).

- **GymBuddy** (`com.gymbuddy2026.app`): home gym + browse members
  "looking for a training partner"; profiles carry **training style,
  goals, and schedule**; swipe-to-match. The one app confirmed to name
  *schedule* as a matched attribute. Evidence is store-listing metadata
  via search only (direct WebFetch returned empty) — moderately reliable,
  not independently verified. https://play.google.com/store/apps/details?id=com.gymbuddy2026.app
- **Spotter, GymBudd, WeightBuddy**: tagline-only evidence ("connect with
  like-minded fitness enthusiasts / gym-goers"); fetches failed/empty; no
  matching-mechanism or safety detail confirmed — **unverified**.
- **SweatPals**: swipe-based partner/event discovery for in-person
  meetups; no verification, pre-meeting chat, or scoring detail confirmed
  — **unverified beyond general description**. https://sweatpals.com/
- **Sweatty** (adjacent, not strength-specific): strongest safety stack
  found — **government-ID verification with manual trust-team review**
  of photos/bios, **mutual post-session ratings**, **one-tap reporting**
  with an "instant" response, **optional location sharing during the
  session** (not before), names/contact hidden until shared. Search
  synthesis, not a direct fetch — moderately reliable, not primary-verified.
- **RacketPal**: "AI-powered skill-level matching based on match results"
  — outcome-based, not just self-reported, skill matching exists in this
  category. Aggregated via https://brocnbells.com/blog/ultimate-guide-to-fitness-dating-apps/
- **Fitafy/Datefit/Fitness Singles** (fitness-dating, complaint patterns):
  fake/bot profiles despite stated verification, matches "hundreds of
  miles away," persistent post-unsubscribe spam; Fitness Singles 1.2/5
  Trustpilot, "most profiles fake or abandoned." Same aggregator —
  ratings reported, not re-verified.
- **FitFriends**: dominant complaint "nobody from your own gym is on it"
  — density/cold-start failure, corroborating doc 13. **Original UC Davis
  GymBuddy** (2023, campus-only): reportedly 1,000+ pairings while
  campus-scoped, reported gone from the App Store by mid-2026 — dense
  niche worked, the app didn't survive. Unverified, same aggregator.
- **Match percentage vs reasons — direct finding**: none of the apps
  surfaced with detail show a numeric match percentage; all use
  qualitative reasons ("goals and schedule," "skill-level match,"
  "discreet mutual-interest confirmation" — the last from "Leg Day," per
  the aggregator, explicitly avoiding any score). Reinforced independently
  by Hinge (below): the category has converged on reasons over percentages.

---

## 3. Schedule/time-based matching and safety without precision

- **Hinge "Most Compatible"**: deliberately shows **no percentage**;
  Hinge doesn't publish the underlying score, and press/Hinge framing
  explicitly caveats it as "not a guarantee, not a ranking, not proof of a
  perfect match" — one recommendation/day from profile answers, likes/
  passes, and who liked you. "Gale-Shapley" attribution is press reporting,
  not a confirmed Hinge disclosure. https://www.vidaselect.com/hinge-most-compatible
  (secondary; no primary Hinge source found)
- **Bumble BFF**: no safety-feature documentation surfaced this pass —
  **unverified, no specific mechanic sourced**.
- **Strava Flyby**: switched from opt-out to **opt-in-by-default for
  everyone**, Oct 2020, explicitly because flybys let people "figure out
  [an athlete's] routine, and see... secluded areas of their route."
  Strava: "Flyby sharing will be default off unless athletes choose to
  change it." Criticised for making the change silently — a process
  lesson (change routine-exposing defaults, but announce it). Flyby also
  requires the underlying activity to be set "Everyone" — a double gate.
  https://www.dcrainmaker.com/2020/10/strava-flyby-feature.html
  https://support.strava.com/hc/en-us/articles/360015478252-Flyby-Privacy-Controls
- **ICO Children's Code, Standard 10 (Geolocation)**: "the more precise
  the location displayed, the higher the potential risks"; geolocation
  display defaults OFF unless compelling reason otherwise; the ICO's
  general (all-ages) guidance states the same — avoid precise location
  unless necessary. ICO enforcement made BeReal/Sendit/Soda/X remove
  precise location from profiles/posts by default.
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/10-geolocation/
- **Suzy Lamplugh Trust**: safety-online page returned 403 (blocked) —
  **no direct "don't reveal your routine" quote sourced; unverified**.
  Trust's own listed safety-tech recommendation (Peoplesafe) shares live
  location with a nominated contact only in the moment of need, not a
  standing routine broadcast — consistent with, not a direct citation for,
  the brief's premise. https://www.suzylamplugh.org/peoplesafe-personal-safety-app
- **Meetup**: safety is organiser/reporting-centric — optional
  pseudonymity, profile-visibility control, Trust & Safety review of
  reports. No time-band/schedule-privacy mechanic found (its exposure
  model is a public event date/time, structurally different from a
  personal recurring schedule). https://help.meetup.com/hc/en-us/articles/39257846459789-Reporting-a-Meetup-group-or-event
- **Conclusion on coarse time-bands**: no source says "AM/PM bands are
  certified safe practice" in those words — **not found, mark unverified
  as a direct claim**. But the triangulation (Strava's Flyby reversal
  targeting precise, repeatable location+time correlation; ICO's
  granularity-based doctrine, not a blanket temporal ban; nothing surveyed
  treating a coarse descriptor as equivalent risk to a precise one) points
  to coarsening both the time axis and decoupling it from place as the
  established mitigation pattern — stated here as inference, not citation.

---

## 4. "People using this programme" / programme-centred discovery

- **Boostcamp** (direct fetch confirmed): programme cards show an
  **aggregate join count** — nSuns 5/3/1: 43,766 athletes joined; GZCLP:
  38,937; PHUL: 31,689 — plus a star rating (e.g. 4.31). No per-programme
  comment thread found on the marketing site. Counting is anonymous —
  users are tallied, never listed by name; no opt-in needed for the count
  itself. https://www.boostcamp.app/
- **Hevy**: no "N users on this routine" counter found in its own feature
  docs — likely absent, but **unverified** (in-app routine-detail screen
  not directly inspectable via web search/fetch).
- Neither product shows an **identifiable participant list** — both
  confirmed patterns are anonymous-count-only, the safer default; a named
  roster would be a materially different, and should be an explicitly
  opt-in, feature.

---

## 5. Gym pages, gym labels and de-duplication

- **Hevy**: no general "gyms" feature with member lists today; only a
  **gym leaderboard** ranking best lifts among people you already follow
  (not a public roster). A July 2026 community update (direct fetch)
  confirms gym *tagging* on workouts is coming "soon," framed as "a first
  step... connected to it" — fuller gym features are roadmapped, not
  shipped, and the update names no gym database, Places integration, or
  de-duplication approach. https://www.hevyapp.com/features/gym-leaderboard/
  https://www.hevyapp.com/community-updates/july-26/
- **Strava**: no canonical "gym" object. Gyms appear via (a) **Clubs**
  (750,000+ on-platform, uncontrolled naming — duplicate/near-duplicate
  club names for one physical gym are structurally possible, not
  centrally deduplicated) or (b) **operator partnerships** (Flywheel,
  Life Time, Expresso) piping class data in directly — no duplicate risk
  because it's a managed feed, not user text.
  https://support.strava.com/en-us/articles/15402172-clubs-on-strava
  https://www.healthclubmanagement.co.uk/health-club-management-news/latest-news/334264
- **De-duplication mechanism, generally**: no fitness competitor's own
  approach was found. The standard generic pattern (not fitness-specific)
  is a **Places-autocomplete-backed picker** — Google Places Autocomplete
  returns a stable `place_id` per venue, so constraining gym entry to
  autocomplete selection (not free text) prevents duplicate labels by
  construction. This is an inferred best-practice, **not a confirmed claim
  any competitor uses Places under the hood**.
  https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

---

## Decisions this evidence supports

1. **Three-tier relationship model**: Follow (asymmetric, default) →
   Mutual (auto-derived, no accept flow) → Message permission on a
   per-user setting with Strava's exact three values (Anyone I Follow /
   Mutuals Only / No One Unless I Start It) — matches where the category
   has converged, lighter than LinkedIn's connect-to-interact coupling.
2. **Never gate profile/programme visibility behind mutual connection** —
   Strava, Garmin, Peloton and Hevy all treat follow alone as sufficient
   to view public activity; only messaging (and, on Garmin, precise
   stats) is gated tighter.
3. **Messaging permission needs a setting, not an inbound-request UI** —
   no surveyed product shows accept/decline on individual message
   requests; Strava's permission-based model is simpler and sets the
   market expectation.
4. **Gate messaging at 18+, non-overridable for a confirmed minor** —
   direct, reusable Strava precedent: DOB required, default locked for
   under-18 regardless of other toggles.
5. **Never show a numeric match percentage** — no training-partner or
   compatibility product surveyed does; Hinge explicitly avoids it. Use
   plain-language reasons ("both usually train evenings," "same
   experience level," "same gym").
6. **Include a schedule/time-band signal in match reasons** (GymBuddy is
   the one confirmed precedent for "schedule" as a matched attribute) but
   surface only a coarse band (morning/evening or a weekday set), never a
   precise recurring slot, and never paired with a precise location.
7. **Coarsen location specifically** — never a specific gym address in a
   pre-contact match reason; ICO Standard 10's granularity principle and
   Strava's Flyby reversal both point the same way: gym-area/name only,
   never GPS precision, never time+place combined pre-connection.
8. **Require an in-app conversational gate before any meeting logistics**
   — modelled on Sweatty (verification + in-session-only location),
   Meetup (report/pseudonymity), and Strava (message-first gating): no
   product surveyed puts exact time+place directly on a match card.
9. **One-tap in-message reporting + a hard block that deletes the
   thread** — directly modelled on Strava's flag-to-Trust&Safety and
   block-deletes-conversation pattern, the most concrete found.
10. **Programme-participant counts as anonymous aggregate only, no
    opt-in required for the count** — Boostcamp's confirmed pattern; a
    named/identifiable roster is a separate, materially different, and
    should be an explicitly opt-in, feature.
11. **Gym labels as controlled vocabulary via autocomplete against a
    place database, not free text** — prevents duplicates at entry per
    the Places `place_id` model; no competitor's actual backing store is
    confirmed, so this is best-practice inference, not a "competitor X
    does this" claim.
12. **Launch a gym "page" as a lightweight tag/leaderboard object first**
    (Hevy's shipped pattern: best lifts among people you follow), not a
    full public member list — Hevy's own roadmap treats tagging as step
    one; Strava still has no canonical gym object after years. No
    competitor has shipped an opt-in-gated public gym roster to model
    against, so member-list visibility should be its own founder decision.
