# 13 — Policy, Safety, Legal & Cold-Start Research

Campaign: `docs/social-discovery-2026-09-06/`. Authority: founder brief
2026-09-06. Read-only research; web access worked for all queries below
(WebSearch + WebFetch succeeded throughout this session — no fallback to
unverified knowledge was needed except where explicitly marked
**[unverified]**).

---

## 1. Apple App Store Review — Guideline 1.2 (UGC) and 5.1.x

**Guideline 1.2 exact requirements** (quoted from the live guidelines page):
- "A method for filtering objectionable material from being posted to the app"
- "A mechanism to report offensive content and timely responses to concerns"
- "The ability to block abusive users from the service"
- "Published contact information so users can easily reach you"
- Source: https://developer.apple.com/app-store/review/guidelines/

- Apps that end up "used primarily for pornographic content, Chatroulette-style
  experiences, random or anonymous chat, objectification of real people (e.g.
  'hot-or-not' voting), making physical threats, or bullying" may be removed
  without notice — relevant because progress-photo comparison/rating UI must
  never resemble a "hot-or-not" pattern. Source: same guideline text above.
- Reviewer response duty: developers act on reports within **24 hours**,
  removing content and (where warranted) ejecting the offending user. Source:
  https://acceptmy.app/guidelines/1-2-user-generated-content (industry summary
  of Apple's stated expectation; Apple's own guideline text does not give a
  numeric hour figure — **the 24-hour figure is second-hand, treat as
  directionally right but not Apple's literal wording**).
- **2026 clarification**: February 2026 guideline update explicitly pulled
  "random or anonymous chat" apps under 1.2 scrutiny (not directly relevant —
  Volyume has no anonymous chat — but confirms Apple is actively tightening
  1.2 enforcement in 2026). Source:
  https://appcompliance.io/blog/apple-2026-app-review-guideline-changes/
- **How reviewers test it**: reviewers expect the filter/report/block/contact
  functions to be reachable and demonstrably working during the review
  session — a published feature that isn't wired up (e.g. a "Report" button
  that does nothing) is a common rejection reason per multiple third-party
  guideline-explainer sources (AcceptMyApp, BuddyBoss). No official Apple
  "test script" is published; treat as **unverified** beyond "it must
  actually work when tapped."
- **Age rating**: social/UGC features (photo sharing, comments, follows) push
  an app toward Apple's "Infrequent/Mild" or higher content descriptors for
  user-generated content, which can raise the App Store age rating band —
  this is standard practice per guideline-explainer sources but Apple's own
  guidelines page does not give a fixed UGC→age-rating table.
  **[unverified — confirm empirically via App Store Connect's rating
  questionnaire before submission; do not assume 4+ survives.]**

**5.1.x findings** (fetched verbatim from Apple's guidelines page):
- **5.1.5 (Location Services)**: "Ensure that you notify and obtain consent
  before collecting, transmitting, or using location data... explain the
  purpose in your app." Directly relevant to any "nearby lifters" or
  location-based discovery feature — must be opt-in, purpose-explained, and
  is a distinct guideline from 5.1.1/5.1.2 (data collection/sharing
  disclosure).
- **5.1.3 (Health and Health Research)**: health/fitness data "may not... be
  disclosed to third parties... for advertising, marketing, or other
  use-based data mining purposes," and apps "must disclose the specific
  health data" collected. This directly bounds any social feature that
  surfaces workout/bodyweight data: it must not be repurposed for
  advertising/marketing and its collection must be disclosed per-datum, not
  just in a blanket privacy policy.
- **5.1.2(i)** update (per search summary, not independently re-quoted from
  primary text): apps must "clearly disclose where personal data will be
  shared with third parties, including with third-party AI, and obtain
  explicit permission before doing so" — relevant if any moderation vendor
  (Vision/Sightengine/Rekognition, see Section 5) is treated as a third party
  receiving user images; disclosure + explicit permission is required.
- Source for all 5.1.x quotes: https://developer.apple.com/app-store/review/guidelines/

---

## 2. Google Play — User Generated Content policy

**Core requirement** (quoted): "Require users accept the app's terms of use
and/or user policy before users can create or upload UGC," "defines
objectionable content and behaviours," and provide "an in-app system for
reporting and blocking objectionable UGC and users, and taking action against
UGC or users where appropriate." Source:
https://support.google.com/googleplay/android-developer/answer/9876937

**Tiered requirement by UGC shape** (this matters for Volyume's exact
feature set):
- Closed/verified communities → in-app **reporting** required.
- 1:1 interaction features (DMs, tagging, mentions) → in-app **blocking**
  required.
- Public UGC (social networking, public profiles/feeds) → **both** reporting
  and blocking required, for content and for users.
  Source: https://support.google.com/googleplay/android-developer/answer/9876937
  and https://support.google.com/googleplay/android-developer/answer/12923286

**Monetisation**: no distinct lighter rule for free vs paid UGC apps — same
moderation bar applies regardless of monetisation model; the only
monetisation-specific clause requires "safeguards to prevent in-app
monetization from encouraging objectionable user behavior" (not relevant —
Volyume is fully free, D137). Source: same UGC policy page.

**Sexual content / body images nuance**: Google Play bans "sexual nudity, or
sexually suggestive poses in which the subject is nude, blurred or minimally
clothed" but grants an EDSA exemption (Educational, Documentary, Scientific,
or Artistic) for otherwise-restricted nudity. Progress photos in athletic
wear/underwear framed as fitness documentation likely sit inside normal
policy (not nudity) and wouldn't need the EDSA exemption at all if minimally
clothed in a non-sexualised way — but Google's own text does **not**
explicitly carve out "fitness progress photos" as a named category. Treat
conservatively: default progress photos to private/non-public in the social
layer, require explicit opt-in to share, and never allow comparison/rating
mechanics on bodies (also an Apple 1.2 "objectification" risk, see Section 1).
Source: https://support.google.com/googleplay/android-developer/answer/9878810
and https://support.google.com/googleplay/android-developer/answer/12923286

**Health apps policy**: must complete the Health apps declaration form,
publish a privacy policy that "comprehensively disclose[s] the access,
collection, use, and sharing of personal or sensitive user data," disclose
what's collected/used/shared and obtain **affirmative consent** for
health-permission use. January 2026 enforcement tightened Health Connect
data justifications and required verified Organization Account migration by
28 Jan 2026 (Volyume should confirm its Play Console org account status is
already compliant — verify, don't assume).
Source: https://support.google.com/googleplay/android-developer/answer/16679511,
https://myappmonitor.com/blog/google-play-health-apps-update-2026-requirements

**User Data policy (location)**: not independently re-fetched this session;
per general Play policy pattern (consistent with the Health findings above),
location access requires prominent in-app disclosure of purpose plus
runtime permission — **[unverified against the primary User Data policy
page text; recommend a direct fetch of
support.google.com/googleplay/android-developer/answer/10144311 before
implementation]**.

---

## 3. UK Online Safety Act (Ofcom) & EU DSA

**Deadlines already passed by 2026-09-06** (Volyume is almost certainly
already out of compliance grace period and should treat these as live
obligations, not future ones):
- **17 March 2025**: Illegal Harms Codes of Practice in force — risk
  assessment for illegal content had to be complete by 16 March 2025; safety
  measures live from 17 March 2025.
  Source: https://cms-lawnow.com/en/ealerts/2025/03/online-safety-act-illegal-content-duties-are-now-in-force
- **24 July 2025 / 25 July 2025**: Children's Codes of Practice — children's
  risk assessment due 24 July 2025, mitigation measures live from 25 July
  2025.
  Source: https://www.rpclegal.com/snapshots/technology-digital/spring-2025/the-online-safety-act-illegal-harms-codes-officially-in-force-focus-now-on-children/
- **2026 ongoing**: Ofcom's "Small but Risky Services" taskforce (est. 2024)
  specifically targets small-userbase, high-harm-potential services
  (typically <1% UK MAU) — Volyume's small user base does not exempt it.
  Source: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-protecting-people-from-illegal-harms-online
- Category 1/2A providers (large platforms) face further risk-assessment
  submission deadlines through 2026 (May–Oct 2026) — **not applicable to
  Volyume's scale**, listed only to confirm Volyume sits outside the
  categorised-service tier and inside the general "all in-scope services"
  tier instead.

**What a small, low-risk user-to-user service must actually have** (Ofcom's
own recommended baseline for services that assess their own risk as low
across all harms):
- Terms of service/conditions that are "easy to access and understand."
- A user complaints/reporting process for illegal content.
- Ability to review flagged content and take it down.
- A named individual responsible for OSA compliance.
- A recorded illegal-content risk assessment (kept, not published, for
  non-categorised services) and a recorded children's access assessment
  outcome.
  Source: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/childrens-access-assessment-duties-under-the-online-safety-act
  and https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act

**Children's access assessment**: every in-scope service must assess and
**record** whether it's "likely to be accessed by children," regardless of
stated age gate — a self-declared "18+ only" ToS clause does not exempt the
service from doing (and documenting) this assessment. If likely accessed,
a children's risk assessment and proportionate safety measures follow.
Source: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/childrens-access-assessment-duties-under-the-online-safety-act

**Age assurance implication for Volyume**: given the ED-safety posture
already in the app (Section 2 inviolables) and no current age-verification
mechanism beyond self-declared DOB at onboarding, the honest documented
answer to the children's access assessment is almost certainly "possibly
accessed by children" unless a harder age gate is added — this is a
decision fork, not a research conclusion; flag to synthesis/blueprint.

**EU DSA** — obligations that bite regardless of size:
- **Notice-and-action** (Art. 16): must provide "an electronic reporting
  mechanism that allows any individual or entity to easily report specific
  items of allegedly illegal content," reviewed and acted on "without undue
  delay." This is essentially the same mechanism as Apple 1.2 / Play UGC
  reporting — one reporting pipeline can satisfy all three regimes if
  designed to their common denominator (named categories, timestamped
  triage, actioned-or-explained outcome).
  Source: https://www.whitecase.com/insight-alert/eu-digital-services-act-revolutionize-legal-landscape-online-intermediaries
- **Terms of service transparency** and a basic **transparency
  reporting** duty apply to all intermediary services; **VLOP-only**
  duties (systemic risk assessment, independent audits, ad-repository,
  researcher data access) do **not** apply to Volyume's scale.
  Source: https://digital-strategy.ec.europa.eu/en/policies/dsa-impact-platforms
- Micro/small enterprise carve-outs reduce (not eliminate) some DSA duties;
  Volyume should self-assess as micro/small and document that assessment.
  Source: https://www.whitecase.com/insight-alert/eu-digital-services-act-revolutionize-legal-landscape-online-intermediaries

---

## 4. GDPR for social features

- **Lawful basis for public profiles**: a public profile / discovery-visible
  identity is best grounded in **consent** (Art. 6(1)(a)), not contract —
  contract (6(1)(b)) only covers what's strictly necessary to deliver the
  core coaching service, and social visibility is an optional layer, not
  core-service-necessary. Consent must be freely given, specific, granular
  (separate from ToS acceptance), and withdrawable without losing core app
  function. **[synthesised from general GDPR consent/contract distinction —
  no single ICO page fetched naming "public profile" specifically; apply the
  standard necessity test.]**
- **Special category data risk**: health data (bodyweight, training
  metrics) is Article 9 special category data requiring both an Art. 6 basis
  AND an Art. 9 condition (explicit consent is the only realistic condition
  here — no employment/public-interest basis fits a consumer fitness app).
  Source: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-rules-on-special-category-data/
- **Inferred special category data**: ICO guidance treats data as special
  category if sensitive attributes can be inferred "with a reasonable degree
  of certainty" — directly relevant to progress photos (body composition
  visible in photos) and any location-based discovery signal that could
  reveal e.g. attendance at a specific gym/clinic. Any inference pipeline
  (including automated image moderation, Section 5) that could derive health
  or other special-category inferences from photos must be treated as
  processing special category data.
  Source: https://www.urmconsulting.com/blog/are-you-processing-special-category-personal-data-without-knowing-it
- **Location data & children (ICO Age Appropriate Design Code)**:
  geolocation options must be **off by default** unless a compelling,
  child-best-interest reason justifies on-by-default; must give an obvious
  visible sign when location tracking is active; and any setting that makes
  a child's location visible to others must **revert to off at the end of
  each session**. Directly actionable for any "nearby lifters"/gym-check-in
  discovery feature.
  Source: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/10-geolocation/
  and .../7-default-settings/
- **Right to erasure when content is shared/copied (Art. 17(2))**: the
  controller must take "reasonable steps, including technical measures," to
  inform other controllers/processors who received the public data that
  erasure was requested, "taking account of available technology and cost."
  Practical rule: build erasure so that deleting a post/profile also
  triggers a real attempt to cascade deletion into any cached copies,
  notification payloads, and shared card exports Volyume itself controls —
  full removal from third parties Volyume doesn't control (e.g. a
  screenshot) is not achievable and isn't required, only "reasonable
  steps" over what Volyume can technically reach.
  Source: https://gdpr-info.eu/art-17-gdpr/ and
  https://www.exabeam.com/explainers/gdpr-compliance/what-is-gdpr-article-17-right-to-erasure-and-4-ways-to-achieve-compliance/

**Practical rules for Volyume**:
1. Social visibility (profile, posts, discovery) is a separate consent
   toggle from core-service ToS — never bundled.
2. Bodyweight/health metrics default private in any social surface; sharing
   requires an explicit, separate, re-confirmable opt-in per Art. 9.
3. Location-based discovery defaults off, session-scoped if ever made
   visible to others, and never on-by-default for any user who could be a
   minor.
4. Deletion of a social post/profile must cascade to every Volyume-owned
   cache/copy (feed indexes, notification payloads, share-card renders) —
   document this as the "reasonable steps" record for Art. 17(2).

---

## 5. Moderation architecture for small teams

**Minimum viable moderation stack**:
- Report reasons: a fixed enum (not free text alone) — recommended set per
  cross-referencing Apple/Play/DSA/ED-safety needs: harassment/bullying,
  impersonation, spam, sexual content, hate/discrimination, self-harm/ED
  content (see Section 7), illegal content, other (free text).
- A moderation queue (even a simple admin table + status enum:
  open/actioned/dismissed) with per-report SLA target (Apple's stated
  informal expectation is ~24h; Play/DSA say "without undue delay" — adopt
  24h as the internal target, it's the tightest of the three and satisfies
  all).
- Audit trail: who/when/what action, retained for dispute/appeal and for
  the OSA-required record-keeping duty.
- Appeal path: at minimum, a way for an actioned user to contest (email is
  sufficient at this scale — a dedicated in-app appeal UI is not mandated
  by any of the three regimes for a service this size).

**Automated first-line — image moderation options** (for progress photos
and any shared media):
- **Google Cloud Vision SafeSearch**: pay-per-unit, free tier 1,000
  units/month, <200ms p95 latency, 5 likelihood categories (adult, spoof,
  medical, violence, racy). Callable from a server-side function (Supabase
  Edge Function, which runs Deno and can make outbound HTTPS calls) — no
  published blocker to calling it from an EU-region edge function, but
  **note**: Vision API itself is a Google Cloud endpoint, not
  EU-data-residency-guaranteed by default; a data-processing/residency
  check against Volyume's EU-Dublin-only rule is needed before wiring it in
  (raw image bytes would leave Dublin to reach Google's endpoint unless a
  specific EU processing region is configurable — **verify** before
  adopting).
  Source: https://cloud.google.com/vision/pricing,
  https://oneuptime.com/blog/post/2026-02-17-how-to-use-safe-search-detection-with-the-cloud-vision-api-to-filter-explicit-content/view
- **AWS Rekognition** (DetectModerationLabels): $1.00/1,000 images up to 5M/
  month, drops to $0.60/1,000 at high volume; same EU-residency caveat
  applies (need an EU AWS region + confirm no cross-region transfer).
  Source: https://flypix.ai/amazon-rekognition-tool-review/
- **Sightengine**: ~$1.00/1,000 images, $29–99/month entry tiers, 120+
  detection classes including AI-generated/deepfake/near-duplicate
  detection — richer classification than the two hyperscalers but a
  smaller vendor to vet for a DPA and EU processing location.
  Source: https://checkthat.ai/brands/sightengine/pricing
- At Volyume's likely early volume (dozens to low hundreds of images/month)
  cost is negligible on any of the three (all comfortably inside free/entry
  tiers); the deciding factor is EU data-residency compliance and DPA
  availability, not price. **This is a founder/lead decision, not a
  research conclusion** — flag to blueprint.

**Rate limiting / anti-spam patterns** (from general industry practice,
Instagram/X-documented thresholds as reference points, not prescriptive for
Volyume's scale):
- New/cold accounts should have materially lower action ceilings
  (posts/follows/DMs per hour) than established accounts for the first N
  days — standard "trust score ramps up" pattern.
  Source: https://opentweet.io/blog/x-dm-limits-2026,
  https://creatorflow.so/blog/instagram-api-rate-limits-explained/
- Track engagement-quality signals (reply rate, block rate, report rate) per
  sender, not just volume — a high report/block ratio should throttle
  further before an explicit report is even filed.
- Rate-limit responses should be soft (temporary lockout: minutes to hours),
  not permanent bans, on first breach.
  Source: https://en.wikipedia.org/wiki/Rate_limiting

**Impersonation / username policy**:
- Reserve system/brand/authority terms (admin, support, volyume, staff,
  moderator, etc.) as unregisterable usernames, matched on substring not
  just exact string.
- Apply Unicode normalisation (NFKC or similar) before uniqueness checks and
  reserved-word checks, to close the homoglyph bypass (visually-identical
  Cyrillic/Greek characters substituting for Latin ones) that has bitten
  major platforms.
  Source: https://icecream23.medium.com/i-fooled-the-filters-homoglyph-username-bypass-vulnerability-an-overlooked-threat-in-major-dd5f8cc63ba6,
  https://www.stingrai.io/blog/homoglyph-attacks-explained
- Restrict the allowed character set for usernames to ASCII
  letters/digits/underscore/hyphen (removes most homoglyph surface at the
  input stage, simplest mitigation for a small team).

---

## 6. Cold start and small-network design

**"Come for the tool, stay for the network"** — Volyume already has this
mechanically for free: the coaching engine is a genuinely useful
single-player tool with zero network required. The social layer should be
built as an *additive* layer on that existing utility, not a
network-dependent gate — this is the single most load-bearing cold-start
finding for Volyume specifically, since it means the app doesn't need any
minimum network size to keep delivering value on day one.
Source: https://dala.medium.com/the-cold-start-problem-how-to-start-and-scale-network-effects-by-andrew-chen-book-notes-part-iii-2168d2976739,
Instagram case: https://www.lennysnewsletter.com/p/atomic-network

**Atomic network sizes actually published** (Andrew Chen's book, via
secondary summaries — treat the exact figures as the book's own claims, not
independently verified primary data):
- Zoom: 2 people (a single call).
- Slack: ~3 users found to create a "stable" team network.
- Airbnb: "hundreds" of active listings in a given city market before the
  marketplace held together unassisted.
- Uber: enough drivers in a city to keep wait times under 5 minutes.
- General finding: the atomic network is usually smaller than founders
  expect ("maybe on the order of hundreds of people, at a specific
  moment"), and it must be tight/dense in one specific context (one city,
  one team, one moment) rather than spread thin across geography.
  Source: https://www.lennysnewsletter.com/p/atomic-network,
  https://blas.com/the-cold-start-problem/

**Ghost-town pitfall**: "early users sign up and leave when they see the
network is dead" — the standard failure mode; countered by not exposing
network-shaped UI (feeds, follower counts, "who's nearby") until local
density genuinely supports it, and defaulting new users into the
single-player experience with social surfaced progressively/opportunistically
rather than as a mandatory first-run step.
Source: https://dala.medium.com/the-cold-start-problem-how-to-start-and-scale-network-effects-by-andrew-chen-book-notes-part-iii-2168d2976739

**Strava/Duolingo/early-Instagram mechanics** (secondary-source synthesis,
not independently primary-sourced this session):
- Instagram: opened as a photo-editing *tool*; the network (home feed of
  others' photos) was introduced mechanically once there was enough content
  to make a feed non-empty — sequencing, not simultaneity.
- Strava/Duolingo-specific cold-start numbers were not found in searchable
  form this session; **[unverified — no primary source located for
  Strava/Duolingo specific density thresholds despite two search attempts;
  do not cite a number for either without further research]**.

**Nextdoor/Meetup/Peanut specific density thresholds**: **not found**
despite three search attempts each. Nextdoor publishes neighbourhood-based
radius mechanics (e.g. events surfaced within a 10-mile radius) but no
published minimum-density-before-launch number. Peanut and Meetup density
thresholds: **[unverified — no published figures located; do not invent
numbers for these]**.

**"Suggested people" without popularity bias**: not independently
researched to a citable primary source this session (search budget spent
on higher-priority items 1-5, 7). Recommend a follow-up research pass if
the blueprint needs a specific algorithmic design here — the general
principle from the cold-start literature above (locally dense over
globally popular) applies directly: rank suggestions by shared local
context (same programme, same start week, similar training age) rather
than follower/like counts, which is consistent with density-first cold
start theory but not a separately sourced claim.

---

## 7. Eating-disorder & body-image safety in fitness social products

- Fitness/fitspiration social content is documented to normalise "extreme
  calorie restriction, excessive exercise" and can teach users "how to hide
  these habits from loved ones" — a direct citation for why calorie-count
  posts and explicit restriction content must never be a supported social
  post type in Volyume.
  Source: https://www.allianceforeatingdisorders.com/a-deeper-look-at-social-media-and-eating-disorders/
- "Thinspiration"/"fitspiration" content is specifically named as harmful:
  algorithmic amplification of appearance-focused, restrictive content
  pushes vulnerable users toward "progressively more extreme diet or
  fitness material" — a direct argument against any engagement-optimised
  ranking of body-focused content (i.e. no algorithmic feed ranking by
  engagement for photo/body content; chronological or explicit-follow-only
  is the safer default).
  Source: https://www.allianceforeatingdisorders.com/a-deeper-look-at-social-media-and-eating-disorders/
- UK-specific charity resource located: **First Steps ED** publishes
  guidance on "practical ways to make online spaces safer, healthier and
  more positive" regarding social media and body image — this is a UK
  charity in the same space as Beat, useful as an additional published
  authority alongside Beat for Volyume's "no outside consultants, resolve
  from published authority" posture.
  Source: https://firststepsed.co.uk/
- **Beat UK itself was not independently re-fetched this session** — the
  app already has Beat UK signposting wired in per CLAUDE.md Section 2; no
  new Beat-specific social-features guidance was located via search beyond
  what's already implemented. **[gap — if the blueprint needs Beat's
  specific position on fitness-app social features, fetch beateatingdisorders.org.uk
  directly in a follow-up pass; not done here.]**
- **NEDA-specific guidance**: not independently located this session beyond
  the general social-media/ED literature above. **[unverified — no NEDA-
  specific fitness-social document found; treat the Alliance for Eating
  Disorders source above as the closest substitute located.]**
- **Strava/Hevy/MyFitnessPal body-metric visibility precedent**: Strava
  does not display weight directly but privacy zones and per-metric
  visibility controls (share HR but not power, "Everyone"/"Followers"/
  "Only You" per-activity) are the closest published precedent for
  granular body-metric-adjacent visibility controls; segment leaderboards
  filtered by weight class mean weight *can* leak indirectly even when not
  displayed directly — a caution for Volyume's own leaderboard/comparison
  features, if any are ever considered (they are not currently in scope
  per the founder brief description of this campaign, but the precedent is
  worth recording).
  Source: https://support.strava.com/en-us/articles/15401776-strava-s-privacy-controls-faq,
  https://support.strava.com/hc/en-us/articles/5999538163853-Activity-Privacy-Considerations
- Hevy/MyFitnessPal specific body-metric-visibility documentation: **not
  found** despite search attempts. **[unverified]**

**Recommended reporting category addition specific to this section**:
alongside the general moderation enum in Section 5, add a dedicated
**"pro-eating-disorder / body-shaming content"** report reason, routed with
priority handling consistent with the app's existing ED-safety posture
(`edPatternDetector.js`, `wellbeing.js`) — this is a product-design
recommendation from the research, not a change to the locked ED-safety
engine code itself.

---

## Minimum Volyume must ship on day one

1. In-app **report** mechanism for content and users (fixed reason enum,
   not free text only) — Apple 1.2 + Play UGC + DSA notice-and-action.
2. In-app **block** mechanism for any 1:1 interaction feature (DMs,
   mentions, follows) — Play UGC explicit requirement.
3. Published **contact information** reachable from the app — Apple 1.2
   explicit requirement.
4. Moderation queue + audit trail (who/when/what action) with an internal
   24-hour SLA target on reports.
5. A named individual internally responsible for OSA compliance (can be the
   founder) — Ofcom baseline expectation, document it.
6. Recorded **illegal content risk assessment** (kept on file, not
   published at this scale) — OSA duty, already overdue since March 2025.
7. Recorded **children's access assessment** outcome — OSA duty, already
   overdue since July 2025.
8. Updated **Terms of Service** covering UGC acceptance-before-posting,
   objectionable content definitions, and the reporting/appeal process —
   Play UGC explicit requirement + OSA baseline.
9. Separate, granular **consent toggle** for social visibility (profile,
   posts, discovery) distinct from core-service ToS acceptance — GDPR
   Art. 6/9 lawful basis requirement.
10. Bodyweight/health metrics **default private** in any social surface;
    explicit opt-in required to include in a shared post — GDPR Art. 9 +
    ED-safety posture.
11. Location-based discovery **off by default**, session-scoped if ever
    shown to others — ICO Age Appropriate Design Code.
12. Username **reserved-word list** + Unicode normalisation + restricted
    character set — impersonation prevention (Apple/Play/DSA all implicitly
    require anti-impersonation via the reporting/blocking mechanisms; this
    is the preventive front-end).
13. Rate limits on posts/follows/DMs, tighter for new accounts —
    anti-spam baseline.
14. No calorie-count or explicit restriction content as a supported social
    post type — ED-safety.
15. No engagement-optimised algorithmic ranking of body/photo content;
    chronological or follow-only feed for that content type — ED-safety +
    fitspiration research.
16. Dedicated **"pro-ED / body-shaming content"** report reason, routed with
    priority handling into the existing ED-safety pathway.
17. **Cascading deletion** design for posts/profiles across all
    Volyume-owned caches (feed index, notification payload, share-card
    render) — GDPR Art. 17(2) reasonable-steps record.
18. Automated first-line image check before publish (any of Vision
    SafeSearch/Sightengine/Rekognition) — **EU data-residency compliance
    must be confirmed before vendor selection**, not assumed.
19. DPA/data-processing check for any moderation vendor treated as a
    third-party processor — Apple 5.1.2(i) + GDPR processor rules.
20. Self-documented **DSA size self-assessment** (micro/small enterprise)
    on file, plus the basic notice-and-action mechanism (satisfied by
    item 1 if designed to the common denominator of all three regimes).

## Numbers to adopt for density thresholds

- **No minimum network size gate for core value** — the coaching engine is
  already a complete single-player tool; do not delay or gate the social
  layer's *usefulness threshold* on user count. Evidence: "come for the
  tool, stay for the network" pattern, Instagram precedent. Source:
  https://www.lennysnewsletter.com/p/atomic-network
- **~3 users as the smallest socially-meaningful unit** (Slack's found
  atomic-network size) — a reasonable floor for surfacing any group/circle-
  shaped social feature (e.g. "training partners," a small squad) rather
  than a global feed. Evidence: secondary summary of Chen's Cold Start
  Problem; **not independently verified against Slack's own published
  data** — treat as directionally useful, not precise.
  Source: https://www.lennysnewsletter.com/p/atomic-network
- **24-hour report response SLA** — tightest of Apple's informal
  expectation / Play's "promptly" / DSA's "without undue delay"; adopt as
  the one internal number that satisfies all three regimes simultaneously.
  Source: https://acceptmy.app/guidelines/1-2-user-generated-content (Apple
  figure, second-hand) cross-checked against DSA "without undue delay"
  language (https://www.whitecase.com/insight-alert/eu-digital-services-act-revolutionize-legal-landscape-online-intermediaries).
- **No specific numeric density threshold found for progressive feature
  surfacing** (e.g. "show nearby lifters only once N users are within
  radius X") — despite dedicated search attempts against Nextdoor, Meetup,
  Strava clubs, and Peanut, no publisher disclosed a specific number.
  **Do not invent one.** Recommend the blueprint phase either (a) pick a
  provisional internal number as a founder/lead decision explicitly labelled
  "no external evidence, internal choice," or (b) design the feature to be
  density-adaptive by rule (e.g. "surface only when ≥3 other users share an
  explicit connection or match on active programme + week") rather than by
  a raw local-population count, since no raw-count precedent exists in the
  public record.
