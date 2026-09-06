# Illegal Content Risk Assessment: Volyume Community

**UK Online Safety Act 2023, illegal content duty (s.9), assessed against
Ofcom's published risk assessment guidance structure for a small,
non-categorised user-to-user service.**

- Service assessed: **Volyume Community** (the social/UGC layer of the
  Volyume app: profiles, follow graph, training-story posts, comments,
  published programme structures). The rest of Volyume (the coaching
  engine, food diary, progress tracking) carries no user-to-user content
  and is out of scope for this duty.
- Date of this assessment: **6 September 2026**, updated the same day for
  the second campaign (connections, messaging, training profile bands,
  the training partner flag, and the "at my gym"/"near me" Find people
  doors). This update is itself the review triggered by "Direct messages
  are added" in Section 6 of the original assessment.
- Accountable person: **the founder** (named individual responsible for
  Online Safety Act compliance for Volyume).
- Status: recorded and kept on file, as Ofcom's baseline expects for a
  non-categorised service of this size; not required to be published.
- Review date: **6 September 2027**, or immediately on any of the trigger
  events in Section 6, whichever comes first.
- Authority for this document: `docs/social-discovery-2026-09-06/
  30-BLUEPRINT.md` §§2, 3, 6, 11; `40-DECISIONS.md` SD-04, SD-05, SD-06,
  SD-11, SD-12; `docs/social-discovery-2026-09-06/70-DISCOVERY-BLUEPRINT.md`
  §§1, 2, 3, 6, 12; `40-DECISIONS.md` SD-20, SD-21, SD-22, SD-23, SD-25,
  SD-31, SD-32; sourced legal findings in `docs/social-discovery-2026-09-06/
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
- Send a **connection request** to another adult (up to two fixed reasons
  plus an optional 120-character, keyword-filtered note); the recipient
  accepts or declines. Acceptance makes the two people mutually
  **Connected** and both follow each other.
- **Message** a person they are Connected with: one-to-one text only, no
  media, no groups, rate-limited, keyword-filtered, with an optional
  reference to a programme or story. Never available to or from a minor.
- Opt in to a **training profile**: coarse bands derived on-device from
  their own real training history (days, time-of-day bands, sessions per
  week, staple lifts, experience, programme, and an adult-only age band),
  shown to others only if the person switches each band on.
- Opt in to an **"open to training together"** partner flag that surfaces
  them on the Find people screen's "open to training together" door.
- Use the **Find people** screen's doors ("at my gym", "near me", "train
  like me", "on my programme", "open to training together", "people you
  might know") to find and follow, connect with, or (once connected)
  message other adults. The gym and area doors are label-based only; there
  is no map, radius search or coordinate of any kind.
- Report, block and mute other users and content, including a specific
  message.

What is deliberately **not** built (`40-DECISIONS.md` SD-12, SD-29), and
why each absence narrows this assessment: no free image upload of any kind
(no photo posts, no photo avatars, no media in messages), no true location
or "nearby" discovery (gym and area are self-typed labels, never
coordinates), no leaderboards or person-to-person comparison, no
engagement-ranked feed (Following and Discover are strictly chronological),
no anonymous accounts, no group messaging, no live presence or "at the gym
now" signal. Direct messaging was itself a deliberate omission at the
first campaign (SD-12); the second campaign reverses that specific
omission because the connection graph now supplies the mutual-consent gate
the earlier ruling lacked (SD-21, SD-29), and this assessment is rewritten
below to reason about that reversal honestly rather than carrying the old
"no DMs" reasoning forward unchanged.

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
- Free-text fields (bio, caption, comment body, message body, connection
  request note) are the content surfaces with any potential for illegal or
  harmful material.
- A follow graph and public discovery surface (search, suggestions,
  dimension pages, the Find people doors) mean a stranger can find and
  contact (via follow request, comment, or connection request) a public
  profile.
- Published programmes carry user-authored free-text notes and
  descriptions.
- **Messaging is a new private 1:1 channel.** This is the single largest
  change this update assesses: a private channel is the primary surface
  most grooming, coercive-control and targeted-harassment guidance warns
  about. It is mitigated, not removed (see below); the categories most
  affected are re-rated in Section 4.
- **The training profile and partner flag surface facts about a person's
  routine** (roughly when and how often they train, what they train, that
  they are open to meeting in person) that did not exist as shareable data
  before.
- **The "at my gym" and "near me" doors** let a stranger find people who
  share a self-typed label, which is a coarser version of the discovery
  risk the follow graph already carries.

**Reduces risk, by design:**
- No image or video upload anywhere in Community, including in messages,
  removes the single largest illegal-content vector on comparable services
  (CSAM, extreme pornography, intimate image abuse, animal cruelty
  imagery, weapons/drug imagery).
- **Messaging exists only after mutual consent.** A message is only
  possible once both people are Connected, and Connected only follows a
  connection request the recipient actively accepted; there is no way to
  open a channel to someone who has not agreed to it. `connect_from` lets
  a person refuse requests from anyone who is not already a follower, or
  from anyone at all.
- **Messages are text only, capped at 1,000 characters, rate-limited** (60
  an hour, 20 an hour for accounts under seven days old), and pass through
  the same shared keyword filter as every other free-text field.
- **Every message is individually reportable** (target kind `message`),
  and **block instantly and permanently closes the conversation** for both
  people, alongside the existing two-way invisibility.
- **Removing a connection also ends messaging** for that pair, even
  without a block.
- **The connection request note is capped at 120 characters and
  keyword-filtered**, same as any other free-text field; a declined or
  withdrawn request cannot be re-sent to the same person for 30 days,
  which limits repeat unwanted contact attempts.
- **Push notifications for messages never carry message content** ("New
  message from @handle" only), so a compromised or glanced-at lock screen
  reveals nothing about what was said.
- **Minors can neither send nor receive connection requests or messages**,
  server-enforced, and never appear on either side of a connection or
  conversation.
- **Training profile bands are opt-in, coarse and per-band toggled.** Days,
  time bands and the age band default off; time bands are never finer than
  a five-way band (morning/midday/afternoon/evening/late), never a date or
  a specific time, and never "last trained". A person sees exactly what
  they are about to share before sharing it (the Join flow's training
  profile step, and the Training profile screen).
- **The training partner flag is opt-in and off by default**; nobody is
  shown as looking to train with a stranger unless they switched it on,
  and turning it off removes every trace of it.
- **The "at my gym" and "near me" doors are label-based, never
  coordinate-based.** There is no map, no radius search, no live or "at
  the gym now" signal; a shared label is the entire mechanism (unchanged
  design principle from the first campaign, SD-10).
- No location or "nearby" feature (in the geocoded sense) removes the
  stalking-enablement vector that a map or radius search would create.
- Under-18 profiles are forced to followers-only and excluded from search,
  suggestions, dimension lists, Discover, every Find people door, and the
  public web pages (`30-BLUEPRINT.md` §2), so a minor's profile cannot be
  found by a stranger; it can only be reached via a link the minor has
  themselves shared, or by someone they have accepted as a follower.
- Blocks are two-way invisible (both follow edges deleted, no visibility
  either direction, conversation closed); mutes are silent.
- A shared keyword filter runs over every free-text field including
  messages and connection notes; a fixed-reason report flow, auto-hide at
  three distinct open reports, and a moderator queue with an audit log
  apply uniformly across posts, comments, profiles, programmes and
  messages.
- Rate limits are tighter for accounts under seven days old (posts,
  follows, comments, reports, messages).

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
| 2 | Child sexual exploitation and abuse | Low | Re-rated for messaging and connections: minors are excluded from both, server-enforced, in both directions, and never appear in any Find people door or age band, so the adult-only messaging channel this update adds is not reachable by or from a minor at all. No image upload anywhere (including in messages), no anonymous accounts; under-18 profiles cannot be found by strangers (forced followers-only, excluded from search/suggestions/discovery/every Find people door). Residual risk is limited to comments on a followers-only minor profile from an already-accepted follower, itself covered by report/block. |
| 3 | Hate offences | Low-medium | The realistic vector is hateful language in a comment, bio, caption or message. Mitigated by the keyword filter, a fixed report reason, block, auto-hide at three reports, and moderator review. |
| 4 | Harassment, stalking, threats and abuse | Low-medium | Re-rated: messaging is a new private channel and does raise exposure, since a private 1:1 route for harassment did not previously exist here. This is mitigated rather than left open: messaging requires mutual acceptance of a connection request first, is text-only and rate-limited, runs through the keyword filter, is individually reportable, and block instantly closes the conversation as well as removing visibility both ways; removing a connection alone (no block needed) also ends messaging. Public comments and follow/connection requests remain the other route. No true location removes stalking-enablement. Rating held at low-medium rather than raised, on the reasoning that the mutual-consent gate and instant, unilateral block are a materially different position from an open DM inbox. |
| 5 | Controlling or coercive behaviour | Low | Re-rated: a sustained 1:1 private channel now exists (messaging), which this category's guidance treats as the primary enabler. Held at low because the channel cannot be forced open (requires the other person's active acceptance of a connection request) and closes unilaterally and instantly on block or on removing the connection. What keeps this specifically low rather than low-medium is that the training profile a partner-in-coercion could otherwise exploit is bands, not routines: coarse, opt-in, per-band toggled, never a date or a precise time, never "last trained", so there is no feature surface that discloses where or exactly when a specific person will be. The "at my gym"/"near me" doors are label-based with no coordinates and no live signal. |
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
20/day, now including target kind `message`), block (two-way invisible,
follows removed, conversation closed), mute (silent), auto-hide at three
distinct open reports on any post, comment or programme, a moderator queue
with dismiss/hide/unhide/delete/restrict/suspend actions, an audit log of
every moderator action, rate limits tighter for accounts under seven days
old (posts, follows, comments, reports, and now messages), a
reserved-handle list (volyume, admin, support, help, moderator, official,
staff, team, community, coach, beat, nhs, plus route words) with an ASCII
lowercase character set, a shared keyword filter on every free-text field
(now including message bodies and connection request notes), priority
routing for harmful-body-or-eating reports, a strictly chronological feed
with no engagement ranking, no image upload anywhere (including messages),
no location feature (Find people's gym/area doors are label-based, no
coordinates), forced followers-only and discovery exclusion for under-18
profiles (now extended to every Find people door), EU-Dublin-only hosting,
and entry gated behind a dedicated consent screen (Community rules
acceptance recorded on the consent log, separate from Article 9 health
consent).

**New measures added with connections, messaging and the training
profile:**
- Messaging requires a mutual, accepted connection first (no way to open
  a conversation without the other person's active agreement).
- Messages are text only, no media, 1 to 1,000 characters, rate-limited
  (60/hour, 20/hour under seven days), keyword-filtered.
- Every message can be reported individually; block or removing the
  connection closes the conversation instantly for both people.
- Message push notifications never carry message content.
- The connection request note is capped at 120 characters and
  keyword-filtered; a declined or withdrawn request cannot be re-sent to
  the same person for 30 days.
- `connect_from` lets a person restrict who can send them a connection
  request at all (anyone, followers only, or nobody).
- Minors can neither send nor receive connection requests or messages,
  and are never listed in any Find people door or shown an age band
  (server-enforced).
- Training profile bands are opt-in, per-band toggled, coarse (a person
  sees and chooses exactly what is shared before sharing it), and never
  finer than the stated bands (no date, no precise time, no "last
  trained").
- The training partner flag is opt-in, off by default, and reversible; the
  in-app rules carry a safety line for anyone considering meeting a
  training partner in person (`COMMUNITY-RULES.md`).
- The "at my gym" and "near me" Find people doors are label-based only;
  there is no map, radius search or coordinate anywhere in the feature.

## 6. Additional measures and review triggers

No additional measure is judged necessary at this scale and this feature
set. Direct messages were added this update (SD-21), reversing the
first campaign's SD-12 omission, on the reasoning set out above: the
connection graph now supplies the mutual-consent gate that omission was
standing in for, and the messaging-specific mitigations (consent gate,
text-only, rate limits, keyword filter, per-message reporting, instant
block/removal closure, content-free push) are the risk-reducing design
choice in place of the earlier blanket absence. SD-12's remaining
deliberate omissions (image upload, true location, leaderboards, group
messaging, live presence) are themselves still the largest risk-reducing
design choices among what was not built, and are not treated as gaps to
fill. This assessment is reviewed in full, ahead of the 12-month date if
triggered earlier, on any of:

- Image, video or any other media is added to messages, posts or comments.
- Group messaging, or messaging without a prior mutual connection, is
  added.
- True location (coordinates, a map, radius search or a live "at the gym
  now" signal) is added anywhere, including to the gym/area doors.
- The training profile gains a band finer than currently specified (a
  date, a precise time, or anything read from body, food or coaching
  data).
- The user base grows into a different Ofcom size/category tier.
- Any moderator-queue pattern in the monthly review (`MODERATION-RUNBOOK.md`)
  shows a category above trending upward, including message reports or
  connection-request abuse.

## 7. Sources

`docs/social-discovery-2026-09-06/13-research-policy-safety-coldstart.md`
§§3, 5, 7 (Ofcom/OSA deadlines and baseline, moderation architecture,
ED/body-image safety findings, each independently sourced and cited
there). Priority-category naming: Ofcom illegal harms guidance, accessed
via secondary summaries this session (Ofcom's own site returned HTTP 403
to automated fetch); count and naming should be spot-checked against
Ofcom's current published Register of Risks at the next review if a
primary-source read becomes available.
