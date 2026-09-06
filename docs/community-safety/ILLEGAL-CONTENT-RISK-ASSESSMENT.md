# Illegal Content Risk Assessment: Volyume Community

**UK Online Safety Act 2023, illegal content duty (s.9), assessed against
Ofcom's published risk assessment guidance structure for a small,
non-categorised user-to-user service.**

- Service assessed: **Volyume Community** (the social/UGC layer of the
  Volyume app: profiles, follow graph, training-story posts, comments,
  published programme structures). The rest of Volyume (the coaching
  engine, food diary, progress tracking) carries no user-to-user content
  and is out of scope for this duty.
- Date of this assessment: **6 September 2026**.
- Accountable person: **the founder** (named individual responsible for
  Online Safety Act compliance for Volyume).
- Status: recorded and kept on file, as Ofcom's baseline expects for a
  non-categorised service of this size; not required to be published.
- Review date: **6 September 2027**, or immediately on any of the trigger
  events in Section 6, whichever comes first.
- Authority for this document: `docs/social-discovery-2026-09-06/
  30-BLUEPRINT.md` §§2, 3, 6, 11; `40-DECISIONS.md` SD-04, SD-05, SD-06,
  SD-11, SD-12; sourced legal findings in `docs/social-discovery-2026-09-06/
  13-research-policy-safety-coldstart.md` §3 (Ofcom/OSA), §5 (moderation
  architecture), §7 (ED/body-image safety).

---

## 1. Service characteristics

Volyume Community lets a signed-in adult or teenage user (self-declared age
13-100 at onboarding, no anonymous mode) who has created a Community
profile:

- Follow other users (public profiles: instant; followers-only profiles:
  by request).
- Post a **training-story** card generated from their own logged training
  (a personal best, a finished session, a completed training block, a
  consistency milestone, or a shared programme), with an optional caption.
  No post is auto-generated or auto-published; nothing is ever posted
  without the user tapping Post.
- Comment on posts and on published programmes.
- Publish a programme as a structural snapshot (days, exercises, sets, rep
  ranges, rest, notes, circuit groups, style tag) that another user can
  copy or have adapted to their own kit and limitations.
- Search and be suggested to other users along chosen facts (training
  style, goal, training setting, an optional area/gym label).
- Report, block and mute other users and content.

What is deliberately **not** built (`40-DECISIONS.md` SD-12), and why each
absence narrows this assessment: no direct messages, no free image upload
of any kind (no photo posts, no photo avatars), no location or "nearby"
discovery, no leaderboards or person-to-person comparison, no engagement-
ranked feed (Following and Discover are strictly chronological), no
anonymous accounts.

## 2. User base

Individual consumer users of a UK-based, EU-Dublin-hosted strength-training
app, predominantly UK with some international reach (Google Play + TestFlight
iOS). Onboarding requires a self-declared date of birth (age 13-100); there
is no hard age-verification step beyond that self-declaration (see
`CHILDRENS-ACCESS-ASSESSMENT.md`). The product is fully free (no
paywall), so there is no separate "content moderation incentive" created by
monetisation.

## 3. Functionalities that create or reduce risk

**Creates some risk:**
- Free-text fields (bio, caption, comment body) are the only content
  surface with any potential for illegal or harmful material.
- A follow graph and public discovery surface (search, suggestions,
  dimension pages) mean a stranger can find and contact (via follow
  request/comment) a public profile.
- Published programmes carry user-authored free-text notes and
  descriptions.

**Reduces risk, by design:**
- No image or video upload anywhere in Community removes the single
  largest illegal-content vector on comparable services (CSAM, extreme
  pornography, intimate image abuse, animal cruelty imagery, weapons/drug
  imagery).
- No direct messages removes the private 1:1 channel most grooming,
  coercive-control and targeted-harassment guidance treats as the primary
  risk surface.
- No location or "nearby" feature removes the stalking-enablement vector.
- Under-18 profiles are forced to followers-only and excluded from search,
  suggestions, dimension lists, Discover and the public web pages
  (`30-BLUEPRINT.md` §2), so a minor's profile cannot be found by a
  stranger; it can only be reached via a link the minor has themselves
  shared, or by someone they have accepted as a follower.
- Blocks are two-way invisible (both follow edges deleted, no visibility
  either direction); mutes are silent.
- A shared keyword filter runs over every free-text field; a fixed-reason
  report flow, auto-hide at three distinct open reports, and a moderator
  queue with an audit log apply uniformly across posts, comments,
  profiles and programmes.
- Rate limits are tighter for accounts under seven days old (posts,
  follows, comments, reports).

## 4. Priority illegal content categories

Ofcom's illegal harms guidance groups the ~130 priority offences in
Schedules 5-7 OSA 2023 into a working set of categories for risk
assessment purposes. The count and exact naming of this set has varied
slightly across Ofcom's own publications as the guidance has been updated
(a 2025 review added "encouraging or assisting serious self-harm" and
"cyberflashing" as named priority offences); this assessment uses the
17-category structure below, current as of this assessment date, and
folds "assisting serious self-harm" into category 15 given its direct
relevance to Volyume's ED-safety posture. **[Sourced from Ofcom's public
guidance via secondary summaries during this research pass; Ofcom's own
site returned 403 to automated fetch; treat the category count and naming
as directionally correct, not a verbatim quote of Ofcom's primary text.]**

Each category is rated for **this service's actual features**, not for
user-to-user services in general.

| # | Category | Risk | Reasoning |
|---|---|---|---|
| 1 | Terrorism | Low | Text-only short fields, no image/video/livestream, no groups, no DMs; keyword filter + report + moderator review; small, non-radicalised UK-weighted fitness userbase. |
| 2 | Child sexual exploitation and abuse | Low | No image upload anywhere, no DMs, no anonymous accounts; under-18 profiles cannot be found by strangers (forced followers-only, excluded from search/suggestions/discovery). Residual risk is limited to comments on a followers-only minor profile from an already-accepted follower, itself covered by report/block. |
| 3 | Hate offences | Low-medium | The realistic vector is hateful language in a comment, bio or caption. Mitigated by the keyword filter, a fixed report reason, block, auto-hide at three reports, and moderator review. |
| 4 | Harassment, stalking, threats and abuse | Low-medium | No DMs removes the main private harassment channel; public comments/follow requests remain a route. Block and mute give an immediate, unilateral remedy; no location removes stalking-enablement. |
| 5 | Controlling or coercive behaviour | Low | Requires a sustained 1:1 private channel this service does not have (no DMs); the only 1:1 relation (follow) is removable unilaterally by block, which is two-way invisible. |
| 6 | Intimate image abuse | Low | No image upload exists in Community at all; nothing a user posts here can be an image. |
| 7 | Extreme pornography | Low | Same reasoning as (6); text fields are filtered and reportable. |
| 8 | Sexual exploitation of adults | Low | No images, no DMs, no payment, listing or booking feature of any kind. |
| 9 | Human trafficking | Low | No marketplace, listing, DM or location feature; nothing in the feature set could facilitate this. |
| 10 | Unlawful immigration | Low | No relevant feature exists in Community. |
| 11 | Fraud and financial offences | Low | Fully free product (D137); no payment rails in Community; no marketplace; free-text fields pass through the keyword filter and are reportable. |
| 12 | Proceeds of crime | Low | No payment or transfer mechanism exists in Community. |
| 13 | Drugs and psychoactive substances | Low | No image upload; this is not a supplement marketplace; text fields are filtered and reportable. |
| 14 | Firearms, knives and other weapons | Low | No relevant feature; text fields filtered and reportable. |
| 15 | Encouraging or assisting suicide or serious self-harm (including eating-disorder encouragement) | Medium | The one category this assessment rates above low, in keeping with the "evidence before assertion" duty to be honest about the awkward case. A fitness app's comments/captions/bios are a real, documented vector for body-shaming and restrictive-eating content (`13-research-policy-safety-coldstart.md` §7). Mitigations: bodyweight, body composition, nutrition and coaching output never enter Community in any form (SD-04) so no calorie or macro figure can ever appear in a post; a dedicated "Harmful body or eating content" report reason exists and is auto-flagged `priority` (moderated ahead of the general queue); the feed is strictly chronological with no engagement ranking of body-adjacent content (SD-06, matching the fitspiration research finding that algorithmic amplification of appearance content is the harm mechanism); the shared keyword filter runs on every free-text field; Beat UK signposting already exists app-wide and is untouched by this feature; the app's ED-safety engine (`edPatternDetector.js`, `wellbeing.js`) is a separate, locked system Community code never touches. Residual risk after mitigation is low-medium, not zero: free text can never be reduced to zero risk. |
| 16 | Foreign interference | Low | No advertising, no resharing/boosting mechanic, no coordinated-amplification feature exists. |
| 17 | Animal cruelty | Low | No image or video upload exists; not a relevant content type. |

Other (non-priority) illegal content: assessed as low by the same
reasoning as above (no image/video, no DMs, no location, no payments; all
free text is filtered, reportable, and moderated).

## 5. Existing measures (already built)

Report (six fixed reasons, one open report per reporter/target, rate
20/day), block (two-way invisible, follows removed), mute (silent),
auto-hide at three distinct open reports on any post, comment or
programme, a moderator queue with dismiss/hide/unhide/delete/restrict/
suspend actions, an audit log of every moderator action, rate limits
tighter for accounts under seven days old, a reserved-handle list
(volyume, admin, support, help, moderator, official, staff, team,
community, coach, beat, nhs, plus route words) with an ASCII lowercase
character set, a shared keyword filter on every free-text field, priority
routing for harmful-body-or-eating reports, a strictly chronological feed
with no engagement ranking, no image upload anywhere, no direct messages,
no location feature, forced followers-only and discovery exclusion for
under-18 profiles, EU-Dublin-only hosting, and entry gated behind a
dedicated consent screen (Community rules acceptance recorded on the
consent log, separate from Article 9 health consent).

## 6. Additional measures and review triggers

No additional measure is judged necessary at this scale and this feature
set; SD-12's deliberate omissions (DMs, image upload, location,
leaderboards) are themselves the largest risk-reducing design choice and
are not treated as gaps to fill. This assessment is reviewed in full,
ahead of the 12-month date if triggered earlier, on any of:

- Image or video upload is added anywhere in Community.
- Direct messages are added.
- Location or "nearby" discovery is added.
- The user base grows into a different Ofcom size/category tier.
- Any moderator-queue pattern in the monthly review (`MODERATION-RUNBOOK.md`)
  shows a category above trending upward.

## 7. Sources

`docs/social-discovery-2026-09-06/13-research-policy-safety-coldstart.md`
§§3, 5, 7 (Ofcom/OSA deadlines and baseline, moderation architecture,
ED/body-image safety findings, each independently sourced and cited
there). Priority-category naming: Ofcom illegal harms guidance, accessed
via secondary summaries this session (Ofcom's own site returned HTTP 403
to automated fetch); count and naming should be spot-checked against
Ofcom's current published Register of Risks at the next review if a
primary-source read becomes available.
