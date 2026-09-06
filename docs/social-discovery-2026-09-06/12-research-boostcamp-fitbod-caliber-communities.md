# Research: Boostcamp, Fitbod, Caliber, and training communities

Founder brief 2026-09-06. Read-only research on programme sharing,
discovery, creator ecosystems, gym-social, and ED-safe progress sharing.

**Access note:** WebSearch worked throughout. Direct WebFetch of
`reddit.com`/`old.reddit.com` was refused by the tool for this host —
subreddit specifics below are WebSearch-derived/general-knowledge and
flagged **unverified (exact wording)** where I couldn't confirm literal
rule text against a live wiki page. Everything else has a source URL.

---

## 1. Boostcamp — library, creators, sharing, customisation

- Free tier: 11,000+ programmes; 130+ "expert" ones built by named
  competitive coaches (Eric Helms, Alex Bromley, Cody Lefever/GZCL, Geoffrey
  Verity Schofield, Alberto Nuñez, Bryce Lewis, Greg Nuckols, Jonnie
  Candito, 50+ more). Remaining ~10,000 are community-built routines
  sitting in the same library, browsable by goal/level/schedule
  (2–6 days/week, home or gym). [BarBend](https://barbend.com/boostcamp-review/),
  [Garage Gym Reviews](https://www.garagegymreviews.com/boostcamp-review),
  [Boostcamp](https://www.boostcamp.app/)
- Creators are credited by name on programmes; no evidence of a
  follow-a-creator mechanic or creator-level rating distinct from the
  programme's own rating — ratings attach to the programme, not a profile.
- **Sharing:** fork/build a programme, share as a link — recipient opens
  it, taps save, it copies to their account in ~10 seconds ("you stay in
  control of who has it"). Separately, a user can publish a custom
  programme to the wider community, making it discoverable by everyone —
  presumably the source of the ~10,000 community programmes.
  [Boostcamp](https://www.boostcamp.app/share)
- **Customise-after-import = manual fork-and-edit only**: supersets, drop
  sets, training maxes, weekly waves are all editable on a forked copy;
  nothing auto-adapts on import. [Tips](https://www.boostcamp.app/blogs/tips-and-tricks-to-using-boostcamp-app),
  [Customise guide](https://www.boostcamp.app/blogs/how-to-customize-your-powerlifting-program)
- **Auto-adapt to equipment/schedule** exists only as a separate, Pro-gated
  AI *generator* (questionnaire → fresh plan) — it is generation, not
  re-fitting of an imported programme. [Boostcamp Pro](https://www.boostcamp.app/pro)
- **Community tab** (2026) = a social feed of completed workouts /
  follow-friends activity, NOT comments/forums on a programme page — no
  evidence of programme-level discussion threads.
- **Non-user link preview:** not confirmed by search; Boostcamp's own copy
  ("open it, tap save, run it") implies the link funnels toward
  app/account rather than a pre-signup preview — flag for direct testing.

## 2. Fitbod — social layer, sharing, adaptation mechanics

- **No social layer found**: no feed/following/comments in current
  marketing or help-centre material; search explicitly contrasts Fitbod
  (algorithm-first) with Hevy/Strong (community-first). [Fitbod
  2026](https://fitbod.me/blog/best-ai-fitness-apps-2026-the-complete-guide-to-ai-powered-muscle-building-apps/)
- **No dedicated share-card feature found** (unlike Hevy) — absence of
  evidence, not a confirmed non-feature.
- **Adaptation mechanics:** each muscle carries a computed recovery
  percentage (0–100%) from recent training history; the algorithm favours
  muscles not heavily trained in the last 48–72h. Equipment gating is a
  **hard filter**: only exercises matching selected equipment are ever
  shown (no barbell squat on a dumbbell-only profile; adding a cable
  machine makes cable moves eligible next session). Tuned against Fitbod's
  own aggregate logged-set corpus (claimed 150M+ workouts) plus the
  individual's history/goal/recovery/equipment. [Fitbod
  algorithm](https://fitbod.me/blog/fitbod-algorithm/), [Fitbod
  recovery](https://fitbod.me/blog/tracking-volume-intensity-and-recovery-with-fitbod/)
- **Sharing generated workouts:** not evidenced; Fitbod has no stable
  "programme" object — each session is freshly generated, so there may be
  nothing durable to share.

## 3. Caliber — coach-client, group coaching, community, messaging

- **Coach-client model:** assigned human coach programs training inside
  the app based on goals/experience/lifestyle, reviews logged sessions,
  adjusts the plan, and messages the client — programme and log sit in one
  shared, coach-editable record. [corahealth.app](https://www.corahealth.app/compare/caliber)
- **Templates:** 120+ coach-designed structured plans by
  goal/experience/schedule, alongside bespoke 1:1 programming.
- **Messaging:** 1:1 in-app chat PLUS a scheduled **weekly async video
  check-in** (Loom-style, reviewing the week and setting next week's
  goals) — a structured cadence layered on top of free chat, not pure
  open-ended messaging. [Garage Gym
  Reviews](https://www.garagegymreviews.com/caliber-app-review), [BarBend](https://barbend.com/caliber-fitness-app-review/)
- **Group coaching** ($19/mo cited): shared group chat with peers + a
  coach — many-to-one, cheaper than 1:1. [sports-nerd.com](https://sports-nerd.com/brand/caliber/)
- **Community groups** are separate from coaching: interest-based groups
  (Camping & Hiking, Cycling, Running, Swimming, "Gym Playlist"), plus
  private groups to train with friends — a lightweight affinity-group
  layer, not a programme-discovery feed.
- **What's shared coach↔client:** the live programme object itself
  (coach-edited, client-executed), logged session history, and the weekly
  video — object-linked context, never a bare chat thread. Pricing:
  Standard ~$50/mo up to $150–300+/mo for higher-touch tiers; group
  coaching is the low-friction entry point precisely because it
  substitutes shared for 1:1 attention.

## 4. Training communities — behaviour and moderation norms

*(Reddit unfetchable this session; specifics below are WebSearch-derived/
general-knowledge and should be confirmed before quoting as fact.)*

- **r/Fitness** (~12.6M) runs on a curated wiki/FAQ (`thefitness.wiki`)
  that front-loads recommended routines and nutrition basics so "what
  programme should I run" gets answered by a static resource before
  becoming a repeat thread. [thefitness.wiki](https://thefitness.wiki/)
- **r/bodyweightfitness** (~2M+) centres on ONE canonical "Recommended
  Routine" (since 2012) plus named easier (Minimalist, Primer) and harder
  forks — a single default path, not an open menu. Recurring themed
  threads: "Technique Thursday" (form), "Theory Thursday" (principles),
  monthly progress threads — content is time-boxed into slots rather than
  free-for-all. Ethos: "we're all gonna make it" (inclusive); "we do not
  frown on weights or barbells" (cross-modality welcome).
  [redditbwf.github.io](https://redditbwf.github.io/), [Recommended
  Routine mirror](https://github.com/NearHuscarl/recommended-routine)
- **Recurring moderation patterns** across lifting subs (general
  knowledge): no medical diagnosis (pain redirected to "see a doctor/
  physio," not diagnosed in-thread); no body-shaming pile-ons;
  progress-pic posts corralled into a fixed weekly/monthly megathread
  rather than standalone daily posts; self-promotion restricted to
  designated threads; minors barred from posting their own body/progress
  photos; sexual/suggestive content involving anyone appearing to be a
  minor is a platform-wide Reddit ToS violation. [Reddit
  policy](https://support.reddithelp.com/hc/en-us/articles/360043075352-Do-not-share-sexual-or-suggestive-content-involving-minors-or-engage-in-any-predatory-or-inappropriate-behavior-with-minors)
- **Valued vs noise (consistent pattern):** valued = specific programme
  questions with constraints, form-check videos with a specific question,
  progress posts on a fixed cadence with context, plateau troubleshooting
  with an actual log attached. Noise = vague "how do I get big," pile-on
  unsolicited advice, before/after posts with zero method, disguised
  product ads.
- **Discord (Boostcamp/Hevy):** no confirmed official Discord with
  documented rules found for either. Hevy's own positioning explicitly
  frames "community as inspiration/accountability" as its differentiator
  vs Boostcamp's methodology-first design. [push-pull.app](https://push-pull.app/blog/hevy-vs-boostcamp)
- **Barbell Medicine** runs its own hosted forum
  (`forum.barbellmedicine.com`) rather than Reddit/Discord — established
  coaching brands sometimes own their community surface outright.
- Jeff Nippard-style creators route audiences to their own Discords via
  bio links; community lives adjacent to content, not inside a training
  app — no rules/activity detail confirmed. StrongLifts 5x5 shows no
  evidence of an active dedicated community surface at all.

## 5. Programme-sharing UX best practice — preview, copy, "adapt to me"

- **Boostcamp's link-share** is the cleanest preview→copy example: sender
  shares a link, recipient opens/taps save/runs it in ~10 seconds, sender
  "stays in control of who has it" (not broadcast just by sending once).
  [Boostcamp](https://www.boostcamp.app/share)
- **Structure-first, weights-never** at share time is the implied norm:
  programme metadata browsed/shown is weeks/days/level/equipment/goal —
  never a specific person's working weights.
- **Fork-then-edit dominates "adapt to me"** — nobody researched
  auto-rewrites a whole imported programme:
  - Boostcamp: fork, then manually edit exercises/sets/maxes — no
    auto-substitution.
  - RP Hypertrophy app: 45–100+ templates; exercise selection is
    user-chosen up front to fit equipment, then ongoing adaptation is
    feedback-driven volume/load autoregulation (pump quality, soreness) —
    not equipment-driven mid-programme swapping. [RP
    Strength](https://rpstrength.com/pages/hypertrophy-app), [Dr Muscle
    review](https://dr-muscle.com/rp-hypertrophy-app-for-strength-training-expert-review/)
  - **Juggernaut AI is the strongest true-adaptation example**: a
    "Readiness Rating" adjusts the plan pre/intra/session-to-session/
    week-to-week/block-to-block from real-time RPE-style feedback, AND has
    an explicit equipment-substitution feature swapping to an alternative
    exercise on the same movement pattern when equipment is unavailable.
    [Toolify](https://www.toolify.ai/ai-news/crafting-your-perfect-powerlifting-program-with-juggernaut-ai-1979159),
    [Garage Gym Experiment](https://garagegymexperiment.com/juggernaut-ai/)
  - Fitbod is the outlier: no programme object at all to import/share —
    "adapt to me" IS the entire product, generated fresh each session.
- **Design takeaway:** the strongest products separate three things
  competitors often conflate — (1) structural template, (2) the
  recipient's own working numbers (never inherited, re-derived or left
  blank), (3) an explicit, visible equipment-substitution step at import
  — no product does all three cleanly; Juggernaut (substitution) and
  Boostcamp (structure-first metadata) are each half the answer.

## 6. Gym-based social products — mechanics, verification, failures

- **Hevy's "gym leaderboard" is NOT gym-location-based** despite the name
  — ranks best lift on 38 exercises purely among people you follow; no
  physical-gym verification, no location data, no duplicate/fake-account
  handling documented anywhere. A friend-leaderboard wearing a "gym"
  label. [Hevy leaderboard](https://www.hevyapp.com/features/gym-leaderboard/)
- Hevy's full social stack: follow/feed + separate "Discover" feed of
  non-followed users, likes + comments (with clickable links), saving
  another's workout as a reusable routine/live session, shareable
  programme/folder links and shareable images, private-profile follow-
  gating, "hide suggested users" toggle. Media cap: 3 photos or 2+1 video
  per workout, visibility follows profile privacy. [Hevy
  social](https://www.hevyapp.com/features/social-features/)
- **GymRat/GymRats** (two similarly-named apps) both market as social
  workout log / global fitness community / team challenges; both appear
  currently live per store listings — no shutdown evidence found.
- **Fitocracy — the clearest documented failure case**, useful as a
  cautionary pattern: launched 2011, heavily gamified (points/quests),
  strong community; by the mid-2020s functionally dead (no shutdown
  announcement, just abandonment — outdated app, unreliable uptime,
  inactive forums). **Reported cause chain**: mobile UX stagnated vs
  Strong/Strava/Fitbit → users left → community thinned → gamification
  stopped feeling meaningful without an audience → remaining users
  migrated to Reddit/Discord/Facebook instead. A pivot to paid coaching
  also failed to gain traction. **Lesson:** gamification cannot carry a
  social product once peer density thins — a small number of genuinely
  active people matters more than points/badges on an empty room.
  [Retrospective](https://the-titan-life.com/2025/08/28/what-really-killed-fitocracy-the-mistakes-that-doomed-a-great-fitness-app/),
  [Founder postmortem](https://medium.com/@captaincole/fitness-apps-are-hard-and-other-reasons-why-our-app-died-b39b461267ec)
- **ClassPass/Anytime Fitness/Gympass** are gym-ACCESS marketplaces
  (booking/check-in across studios), not gym-social products; ClassPass's
  only social mention is "celebrate milestones and share with friends" —
  no leaderboard or gym-specific community found.
- **No product researched has real physical-gym verification** — none
  confirm a user actually trains at a claimed gym before attaching them to
  a "gym" leaderboard/group. Any Volyume gym-flavoured feature needs its
  own verification design (proof-of-membership, geofenced check-in) or an
  honest rename (e.g. "training circle") rather than implying verification
  that doesn't exist anywhere in the market.

## 7. Progress-photo conventions and ED-safety practice

- Reddit's platform-wide policy (confirmed directly) bans sexual/
  suggestive content involving minors or anyone appearing to be one, and
  separately requires subject consent for posting nude/sexual images at
  all — a floor under any progress-photo subreddit regardless of its own
  rules. [Minors policy](https://support.reddithelp.com/hc/en-us/articles/360043075352-Do-not-share-sexual-or-suggestive-content-involving-minors-or-engage-in-any-predatory-or-inappropriate-behavior-with-minors),
  [Consent policy](https://globalnews.ca/news/1847885/reddit-says-no-nude-sexual-photos-videos-without-subjects-consent)
- r/progresspics' own specific posted rules (face-visibility, exact
  wording) could not be confirmed this session — **flag unverified**;
  generally understood (unverified here) to require stats/timeframe
  context alongside photos, route ED-recovery transformations under the
  same rules as weight-loss ones, and discourage numbers-only before/after
  posts with no method — consistent with §4's valued-vs-noise pattern.
- **Beat (UK ED charity)** body-image guidance favours curation over
  moderation mechanics: recommends unfollowing accounts that trigger
  comparison, and frames body positivity modestly as "accepting your
  appearance most of the time" rather than a stronger claim — matches
  Volyume's calm/non-shame voice mandate already. [Beat](https://www.beateatingdisorders.org.uk/get-information-and-support/get-help-for-myself/self-help-and-self-care/body-image/)
- Beat's media guidelines (aimed at journalists, directly reusable here):
  avoid detailed weight-loss-method/number descriptions presented as
  aspirational, avoid "thinspiration"-functioning images, centre
  recovery/support framing over transformation spectacle. [Beat
  guidelines PDF](https://beat.contentfiles.net/media/documents/Beat-Media_Guidelines.pdf)
- **No technical face-blurring feature found in any product researched**
  — face/consent handling everywhere is user convention (crop/blur before
  posting), not a platform mechanic. A built-in face-blur control would
  be a genuine differentiator, not something to copy.

---

## What Volyume should take from this

1. **Separate the shared object into three layers**: structural template
   vs the recipient's own working numbers (never inherited) vs an
   explicit equipment-substitution step. No competitor does all three;
   Juggernaut (substitution) and Boostcamp (structure-first) are each
   half.
2. **"Fork, don't merge" is the safe default for imports** — every
   credible competitor lets a recipient copy-then-edit; only Juggernaut AI
   auto-adapts, and only for equipment substitution, never whole-programme
   rewriting.
3. **Make equipment substitution visible and explicit at import, never
   silent** — the one place Juggernaut AI beats "just let them edit it";
   real opportunity given Volyume's engine already knows the user's
   equipment.
4. **Never inherit specific working weights across a share** — every
   product with public programme metadata (Boostcamp) keeps it structural
   only (weeks/days/level/equipment/goal).
5. **Creator model, now:** a named-coach layer (Boostcamp's model) is
   low-risk and cold-start-friendly — coach-authored content doesn't
   depend on network effects, solving the empty-library problem before a
   userbase exists.
6. **Creator model, later:** no competitor has a mature follow-a-creator/
   creator-earns mechanic distinct from the programme itself — real
   whitespace, not a pattern to copy.
7. **Community feed ≠ programme discussion** — Boostcamp's feed is
   completed-workout activity, not comments on a programme; nobody
   researched has programme-level Q&A. A deliberate gap to fill, not an
   established pattern to mirror.
8. **Cold-start lesson from Fitocracy:** gamification cannot carry a
   social product once peer density thins — prioritise a small number of
   genuinely active people over points/badges/streaks on an empty room.
9. **A "gym" label needs real verification or an honest rename** — Hevy's
   "gym leaderboard" is just a friend-leaderboard with no location check;
   build actual verification or call it something honest like "training
   circle."
10. **No competitor enforces face-blurring on progress photos** — a
    built-in face-blur/consent control at capture or share would be a
    genuine, GDPR/Article-9-aligned differentiator.
11. **Match Beat's modest register** ("accept your appearance most of the
    time," not "love your body") in any progress-sharing copy, over
    transformation-spectacle language.
12. **Apply Beat's anti-"thinspiration" media guidance** to any
    progress-photo or programme-completion share card — never present
    calorie/weight numbers as the achievement.
13. **Time-box progress content into a fixed cadence/place** (mirroring
    r/bodyweightfitness's themed-thread pattern) to stop a body-photo-
    adjacent feature dominating a general feed — directly useful for
    calm-mode-aware feed design.
14. **Coach-client shared object + scheduled async check-in (Caliber)** is
    reusable IF Volyume ever adds a human-coach layer — object-linked
    messaging beats free-form chat for staying on-topic.
15. **Moderation design rule:** across every community researched, valued
    = specific-question-plus-context, noise = numbers/photos-with-no-
    method — bake a lightweight version of that distinction into any
    programme-question or progress-post surface, rather than an open
    free-text box.
