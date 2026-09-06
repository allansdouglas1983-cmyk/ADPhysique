# Recon 04 — Sharing, Deep Links, Notifications, Live Activity/Widgets

Read-only recon for founder brief 2026-09-06 (Social/Community/Discovery).
File:line for every claim. Partners internals owned by another agent;
included here only where sharing/links/notifications touch them.

---

## A. Sharing

### A1. Share-card types, data, rendering, privacy, entry points

**Renderer.** ONE pure Skia draw routine serves both on-screen preview and
exported PNG — `src/lib/shareCard/drawShareCard.js:1-27`. Node-runnable (no
ESM imports), verified by `scripts/render-share-card.cjs` (`:9-13`). Fixed
1080px design space, scaled by `s = W/1080` (`:15`).

**Card types** (`drawShareCard.js:364-383,1315-1318,1383-1411`):
- `pr` — exerciseName, weight, reps, units, previousBest, date
  (`ShareCardScreen.js:266-275`); toggles: PR weight, previous best (`:761-765`).
- `milestone` — eyebrow, title, heroValue, heroUnit, caption, up to 3 stats,
  date (`ShareCardScreen.js:223-241`); Recaps-sourced (streak/perfect-month/
  tonnage/training-load).
- `session` — sessionName, workingSets, duration, tonnage, exerciseCount,
  exercises, prCount, topSet, intensityTier (solid/tough/epic), units,
  planName, date (`ShareCardScreen.js:243-264`); intensity heuristic
  `src/lib/sessionShareData.js:49-56`; best-lift = heaviest working set,
  warm-ups + ballistic sets excluded (`sessionShareData.js:18-38`); toggles:
  plan name, total weight, exercise names (`ShareCardScreen.js:754-759`).
- `weekly` — the "great week" recap, built via `buildWeeklyRecapParams`
  (`src/lib/shareCard/greatWeek.js`, `ShareCardScreen.js:28,210-221`); real
  weight-progress hero + best-lift feature, both independently toggleable AND
  both force-stripped under `suppress` (`:117-121,767-774`).
- `beforeAfter` — two-photo progress comparison, own component
  `src/components/BeforeAfterShareSheet.js` (not ShareCardScreen), same
  `drawShareCard` renderer (`:48,315-317`); fields: two photos, dates, elapsed
  badge, optional weight (founder exception, see below), optional Volyume
  Score/scan range (`:279-301`).
- Transparent **sticker** export (`drawSticker`, `ShareCardScreen.js:27,
  321-322`) — a stat-panel only, for pasting onto the user's own story photo;
  every card type can render as a sticker (`:137,144,311-314`).

**Formats:** story 9:16 (default, D109-1), square 1:1, portrait 4:5, sticker
(`ShareCardScreen.js:99-107,619-654`). Story format bakes platform-chrome safe
zones (top 14%, bottom 20%) into the renderer (`drawShareCard.js:75-80`).

**Pipeline:** Skia offscreen surface → canvas draw → `flush()` →
`makeImageSnapshot()` → `encodeToBase64()`
(`ShareCardScreen.js:303-338`, `BeforeAfterShareSheet.js:309-321`). Export
writes b64 PNG to `FileSystem.cacheDirectory`, timestamped filename so repeat
exports never overwrite (`ShareCardScreen.js:485-497`,
`BeforeAfterShareSheet.js:350-361`). Delivery: `expo-sharing` (`Sharing.
shareAsync`, image/png) for "Share image", `expo-media-library`
(`saveToLibraryAsync`) for "Save to gallery" (`ShareCardScreen.js:502-562`,
`BeforeAfterShareSheet.js:412-444`). No native Instagram/Facebook Stories
composer intent — founder decision 2026-06-30 (avoid new dependency +
mandatory Facebook App ID); OS share sheet presented AS a Story share via
icon framing only (`ShareCardScreen.js:42-47,530-537,783-805`).

**Privacy rules (code-enforced):**
- Standard cards: "Name, bodyweight, measurements and private notes are never
  included" (`ShareCardScreen.js:776-780`); no bodyweight field in any
  pr/milestone/session param builder (`:200-277`).
- Weekly recap: separate privacy line (carries real progress content),
  gated by `suppress` (`:777-779`).
- **ED/calm-mode, weekly recap:** `usePhotoSuppression()` hook (fail-closed,
  starts suppressed pre-resolve, suppresses on read failure) OR-ed with a
  caller `suppressParam` (`:84-93`); suppressed ⇒ progress toggles hidden
  and `buildWeeklyRecapParams` strips all progress language (`:117-121,
  210-214,767-774`).
- **Before/after card:** WITHHELD ENTIRELY (returns `null`, no compose/
  encode/share path reachable) under `usePhotoSuppression()`
  (`BeforeAfterShareSheet.js:12-16,185,463`). Weight-on-card is a
  **founder-approved exception** to "never include bodyweight" (progress-
  photos §3.8, DECISIONS #2, `:17-21`) — opt-in toggle per export, still
  bounded by the suppression withhold; name/measurements/private notes stay
  banned (`:160,584-596,621-623`).
- One-time confirm dialog before first export (AsyncStorage flag
  `progressShareConfirmed`, `:104-106,363-383`).

**Entry points (`navigation.navigate('ShareCard', {...})`):**
- `src/screens/WorkoutSummaryScreen.js:1058` (session + PR), `:1148`, `:1164`
  (other share triggers on the same screen).
- `src/screens/CoachOutputScreen.js:2707` (weekly recap, "great week" CTA,
  gated on safe/on-target per comment at `:2691`).
- `src/screens/LiftProgressScreen.js:237,277` (PR share from lift history).
- `src/screens/BodyMetricsScreen.js:1276` (milestone card).
- `src/screens/YearOfLiftsScreen.js:690` (milestone card).
- Route registered three times (once per auth-state stack) in
  `src/navigation/RootNavigator.js:127` (lazy import), `:441,531,607` (`Stack.
  Screen name="ShareCard"`).
- `BeforeAfterShareSheet` is a modal-style sheet, not a route; mounted from
  `src/screens/ProgressPhotosScreen.js:83,1917`.

### A2. Share text / link generation

- **Partner invite links** (only outbound share-text/link generator in the
  repo): `src/lib/partners/link.js:26-34` builds both
  `volyume://partner/<CODE>` and `https://volyume.app/partner/<CODE>`;
  `:57-59` builds the out-of-band invite MESSAGE carrying the web link.
  Partners-owned UI; noted only as the share-text precedent to extend.
- **Share-to-partner "wins"** (text-only, no image): `src/lib/partners/
  shareWins.js` defines 4 moment types (`workout_summary`, `personal_record`,
  `block_milestone`, `progress_card`), each with explicit `shared`/`private`
  field lists (`:1-26`), a forbidden-field blacklist
  (`shareWinDraftHasForbiddenFields`, `:71-92,207-210`), and a preview/
  review-receipt builder (`:220-246`). `progress_card`'s own text confirms
  "The image itself is never sent" (`:23`) — the closest existing analogue
  to a "post an update" primitive, though one-recipient/ask-every-time/
  no-feed by design (`SHARE_WIN_POLICY`, `:28-32`).
- No `volyume.app/<other-path>` share link exists elsewhere in `src/` (only
  `partner/`, `privacy`, `support@volyume.app` — `PrivacyPolicyScreen.js:
  118,137`, `ProUpgradeScreen.js:653`, `CreditsScreen.js:99`).
- RN core `Share` API (distinct from `expo-sharing`) used only in
  `DebugLogScreen.js`, `PartnerScreen.js`, `SettingsAboutScreen.js`,
  `MealPlanScreen.js`, `errorLog.js` — not share-card paths (those use
  `expo-sharing` exclusively, see A1).

---

## B. Deep links

### B3. Linking configuration

**Scheme + universal domain:** `app.json:11` `"scheme": "volyume"`; Android
`intentFilters` (`app.json:81-107`) register `volyume://` (autoVerify) and
`https://volyume.app/partner/*` (autoVerify) as BROWSABLE/DEFAULT. iOS side is
the AASA file (see B4).

**React Navigation linking prop:** `src/navigation/RootNavigator.js:826-947`
(`const linking = {...}`). `prefixes: ['volyume://', 'https://volyume.app']`
(`:827`). `getStateFromPath: safeGetStateFromPath` (`:828`, wrapper module
`src/navigation/safeGetStateFromPath.js`, not audited further here — pure
routing safety wrapper).

**Every reachable route today** (`RootNavigator.js:829-926`):
| URL | Tab / Screen | Notes |
|---|---|---|
| `volyume://workout/start` | HomeTab → BuildWorkout | `:837` |
| `volyume://active-workout` | HomeTab → Home (not ActiveWorkout) | `:846-861`; deliberately lands on Today because ActiveWorkout has no own rehydration route (ADR in comment) |
| `volyume://diary`, `/diary/:date?` | DiaryTab → Diary | `:868-874`; optional date param, `dayKey.js` local-day format |
| `volyume://routine/:planId` | PlansTab → PlanDetail | `:879-885`; param MUST be `planId` (history: a `:id` mismatch dead-ended the screen, audit 2026-07-01) |
| `volyume://progress` | ProgressTab → Analytics | `:891` |
| `volyume://partner/:code?`, `https://volyume.app/partner/:code?` | ProgressTab → Partner | `:896-905`; param MUST be `code` (`PartnerScreen.js:635`); optional so a bare link still opens pairing |
| `volyume://coach` | ProfileTab → CoachOutput | `:913-916`; defaults to latest week |
| `volyume://checkin` | ProfileTab → WeeklyCheckIn | `:918` |

Total: **7 distinct link targets** across 6 tabs, all inside the signed-in
`MainTabs` tree — no route from the welcome/onboarding/article-9 stacks is
addressable by URL.

**Cold vs warm handling:** declarative only (react-navigation's own
cold-start URL resolution + `Linking` listener); no `src/lib/linking*` or
`deepLinks*` files exist — only `authDeepLink.js` and `partners/link.js`,
both pure builders/parsers, not navigators.

**Auth gating is IMPLICIT, not queued** (`RootNavigator.js:812-822`): the
linking config only names screens inside `MainTabs`, so a URL tapped while
signed out / mid-onboarding simply fails to resolve and the user stays on
whichever stack is mounted — **no persisted "resume this link after
sign-in" queue exists**. Grepped `pendingDeepLink|queuedLink|deferredLink|
pendingLink` across `src/` — zero matches. Genuine gap if a social feature
needs "tap an invite link signed out, land on it after signing in."

**Auth callback deep link is a SEPARATE mechanism** (`src/lib/
authDeepLink.js`): `isVolyumeLink()` (`:15-20`) validates scheme/host,
`parseAuthParams()` (`:22-48`), then three exchange mechanisms (token_hash/
OTP, code, implicit access+refresh) each independently verify server
identity before installing a session (`:70-184`). Guarded by
`deepLinkOrigin.guard.test.js` (exact-host match, no `startsWith`, `:6-9`)
and `authDeepLink.guard.test.js` (`:12-16`).

**Notification-tap routing is ALSO separate** — `navigationRef.navigate` in
an `onTap` effect driven by `notificationRoute.js`
(`routeForNotificationType`), independent of the URL `linking` config
(`RootNavigator.js:823-825`; see C5).

**Tests:** `linkingConfig.test.js` resolves every path above through the
REAL `safeGetStateFromPath` + real config, asserting route AND param names
(guards the `:id`/`planId` and unwired-invite-path bug classes);
`universalLinksPreparation.test.js` pins the AASA path allowlist (`:10-19`)
and email-bridge `safeCallbackTarget` origin checks (`:21-38`);
`deepLinkOrigin.guard.test.js` + `authDeepLink.guard.test.js` are
source-level guards on `authDeepLink.js`.

### B4. Web presence for link previews

- `public/.well-known/apple-app-site-association` — `appID:
  "K79JA5JUF8.app.volyume"`, paths `["/partner/*", "/auth/callback",
  "/auth/callback/"]`. Only 3 paths registered — **no path for any of the
  other 7 in-app deep-link targets** (workout/start, diary, routine,
  progress, coach, checkin, active-workout); those stay `volyume://`-only.
- `public/.well-known/assetlinks.json` — `package_name: "app.volyume"`, but
  `sha256_cert_fingerprints` are BOTH still literal placeholder strings
  (`REPLACE_WITH_SHA256_OF_PLAY_APP_SIGNING_KEY_CERT` /
  `..._UPLOAD_KEY_CERT`) — observed: Android App Links verification is not
  actually live (placeholder text in the file; not confirmed against Play
  Console).
- A full web app exists at `web/apps/web/` (Next.js) with routes for
  `(auth)/sign-in`, `(app)/plan`, `/progress`, `/account`, `/coaching`,
  `/settings`, `/marketing`, `/dashboard`, `app/auth/callback`. **No
  `/partner/*` route exists there** — grepped `web/` for `*partner*`, zero
  files. This contradicts `src/lib/partners/link.js:10-12`'s comment ("The
  universal link lands on a web page (web/) that states the derived-
  signals-only promise... for a partner who does not have the app yet") —
  observed: that landing page does not exist, so a tapped
  `https://volyume.app/partner/<CODE>` from someone without the app has
  nowhere real to land today. `web/apps/web/vercel.json` confirms Vercel as
  the deploy target.
- No link-preview (Open Graph/oEmbed) metadata generation found anywhere in
  `web/apps/web/src/app`.

---

## C. Notifications

### C5. Scheduler API, categories, quiet hours, budget, foreground suppression, ED suppression, settings screen

**Scheduler API** (`src/lib/notifications/scheduler.js`, 2188 lines). Every
category gets a `schedule*`/`cancel*` function pair (grep `^export`, ~30
functions): e.g. `scheduleMorningWeightNotification` (`:147`),
`scheduleEveningWeightReminder`/`cancelEveningWeightReminder` (`:340,357`),
`scheduleMealReminders`/`cancelMealReminders` (`:482,495`),
`scheduleCascadeGateNotifications`/`cancel...` (`:745,815`),
`scheduleMissedCheckinFollowups`/`cancel...` (`:1052,1057`),
`scheduleActivationNudge`/`cancel...` (`:1167,1171`),
`scheduleReturnNudge`/`cancel...` (`:1287,1317`),
`scheduleWeeklyCoachReady`/`cancel...` (`:1523,1572`),
`restoreNotifications` (bulk re-lay from prefs on boot, `:1802`),
`rescheduleForTimezoneIfChanged` (`:1788`), `schedulePartnerBeats`
(`:2048`, Partners-adjacent, noted only as the pattern to extend). A new
social/community category should follow this exact `schedule*`/`cancel*`
pair convention plus registration in `categories.js` to get quiet-hours +
budget + telemetry for free.

**Category enum** (`src/lib/notifications/categories.js:17-56`, 21 live
values): `WEEKLY_CHECKIN_REMINDER`, `CASCADE_GATE`,
`SUBSCRIPTION_PAYMENT_FAILURE`, `SUBSCRIPTION_EXPIRING`, `SYNC_ERROR`,
`ED_PATTERN_LOCKOUT`, `FFM_FLOOR_HOLD`, `WEEKLY_COACH_READY`,
`COACH_TRIAL_ENDING`, `MORNING_WEIGHT`, `EVENING_WEIGHT`,
`TRAINING_REMINDER`, `YEAR_OF_LIFTS_UNLOCK`, `MONTHLY_RECAP`, `TRIAL_DAY3`,
`WINBACK`, `PARTNER_CHEER`, `CHECKIN_MISSED`, `PLANNED_MEAL_CONFIRM`,
`REST_TIMER`, `MEAL_LOG_REMINDER`, `ACTIVATION_NUDGE`, `RETURN_NUDGE`.
Each maps to a channel set via `CATEGORY_CHANNELS`
(`categories.js:114-167`: push / in_app / email, some both) and a
`data.type` string via `categoryForDataType()` (`:208-249`, used by tap
telemetry to resolve category from the runtime notification payload).
`PARTNER_CHEER` already models push-downgrades-to-in-app-under-ED-flag
(`categories.js:140-143`) — the pattern a social "like/cheer" notification
would reuse.

**Quiet hours** (`src/lib/notifications/quietHours.js`): default 22:00-07:00
local, AsyncStorage-persisted (`QUIET_HOURS_KEY`, `:18-26`), pure
`isInsideQuietHours`/`shiftHourMinuteOutOfQuietHours`/
`shiftDateOutOfQuietHours` helpers (`:74-129`) consumed by scheduler.js
before pinning any trigger. Wrap-midnight window handled correctly (`:80-86`).

**Push budget** (`src/lib/notifications/budget.js`): `EVENT_DAILY_CAP = 2`,
`EVENT_WEEKLY_CAP = 8` (`:35-36`). Only "event" categories are budgeted —
listed in `EVENT_PRIORITY` in priority order, highest first
(`:43-61`): CASCADE_GATE, WEEKLY_COACH_READY, ACTIVATION_NUDGE,
CHECKIN_MISSED, RETURN_NUDGE, TRIAL_DAY3, WINBACK, YEAR_OF_LIFTS_UNLOCK,
MONTHLY_RECAP, PLANNED_MEAL_CONFIRM, PARTNER_CHEER. Habit reminders (morning
weight, training day, weekly check-in) and transactional server pushes are
exempt (`budget.js:11-22`). Pure decision core `decideBudget()`
(`:185-223`): one-per-topic-per-day rule, day cap, then week cap, strict
higher-priority-only eviction (equal priority never evicts), losers dropped
not requeued. Async orchestrator `requestEventPushSlot()`
(`:239-289`) fails OPEN on any schedule-read error. **A new social
notification category (e.g. "someone followed you", "your post got a
cheer") needs a slot in `EVENT_PRIORITY` to be budgeted at all** — omitting
it makes it exempt/unbounded.

**Foreground suppression handler** (`handler.js:17-83`,
`configureNotificationHandler()`): intercepts before display, suppresses
when the underlying action is already done — `rest_end` always in
foreground (`:25-27`); weight prompts if already logged today OR ED flag
open (`:33-36`); `weekly_checkin` if checked in this week (`:37-39`);
`training_reminder` if trained today (`:40-42`); `checkin_missed` if
recently checked in or ED-flag open (`:47-50`); `meal_log_reminder` always
under ED flag (`:56-58`); `activation_nudge` if stage passed or ED-flag open
(`:59-66`). `_edFlagOpen()` (`:140-155`) is fail-CLOSED: a DB read error is
treated as flag-open, never flag-closed.

**ED-flag suppression rule (repeated pattern, 5 sites in scheduler.js)**
pinned by a SOURCE-LEVEL regression guard, not behaviour test:
`src/lib/notifications/__tests__/scheduler.edSuppression.guard.test.js`
(header explains why: `scheduler.js` drags in the full expo-notifications/
AsyncStorage/store stack at import time, so a fs.readFileSync + regex guard
plus one mocked-IO behavioural test is the house pattern here).

**Settings screen:** `src/screens/NotificationSettingsScreen.js` (1019
lines). Exposes toggles for: Training reminders (`:605-618`,
`CATEGORY.TRAINING_REMINDER`), "Getting started" section — Return nudge
(`:396`, `CATEGORY.RETURN_NUDGE`) and Activation nudge (`:417`,
`CATEGORY.ACTIVATION_NUDGE`), Meal reminders (`:709-730`), Quiet hours
(`:758-775`). **Not every category has a settings-screen toggle** — e.g.
`WEEKLY_CHECKIN_REMINDER`, `MORNING_WEIGHT`, `EVENING_WEIGHT`,
`PARTNER_CHEER` are controlled elsewhere (respectively the check-in flow,
BodyMetrics/weigh-in settings, and Partners screens — not audited further
here, out of this agent's scope).

**Preference persistence API**
(`src/lib/notifications/preferences.js`): `setPreference`, `getPreference`,
`getAllPreferences`, `getPreferencesUpdatedSince`, `applyPreferenceFromPull`,
`migrateFromLegacyBlob`, `deletePreferencesForUser`
(`:35-271`) — backs a `notification_preferences(user_id, category, enabled,
time_pref)` table per `docs/NOTIFICATIONS_LOCKED.md:209`; this is the
per-category on/off store a new social category would slot into.

**`docs/NOTIFICATIONS_LOCKED.md` — 10 locked rules:**
1. Provider stack: Expo Push + custom in-app banner/toast, no client email
   at v1 (`:5-10`).
2. ED-pattern flag NEVER fires via push/email — in-app only (`:16-18`).
3. Every push respects quiet hours, default 22:00-07:00 local (`:19-20`).
4. One notification per topic per day max; no drip campaigns (`:21`).
5. Every push has a one-tap unsubscribe/disable path (`:22-23`).
6. Locale-aware timing — local time, never server/UTC (`:24-25`).
7. Global cap: 2 event-class pushes/day, 8/week; habit + transactional
   pushes sit outside the cap (`:301-309`).
8. Fixed collision priority; equal priority never evicts, loser dropped not
   requeued (`:314-337`).
9. Open ED/wellbeing flag suppresses every event push at schedule time;
   quiet hours + one-per-topic always win (`:341-348`).
10. Shame copy banned ("you missed" never appears, `:352-354`). Rest-
    finished alert is an explicit, documented exception to quiet-hours/
    budget/ED-copy-review (session-scoped) — `:369-394`.

### C6. Remote push pipeline

**YES — a full Expo push token pipeline exists, end-to-end:**
- Client: `src/lib/notifications/pushToken.js`. `getExpoPushToken()`
  (`:76-99`) calls `getExpoPushTokenAsync({projectId})`, requires
  permission granted + an EAS `projectId`. `registerPushToken(userId)`
  (`:108-137`) upserts `device_push_tokens(user_id, expo_push_token,
  platform)` via Supabase after sign-in; `unregisterPushToken(userId)`
  (`:147-173`) deletes the row on sign-out before local wipe.
- Cloud table: `supabase/migrate_053_device_push_tokens.sql` — composite PK
  `(user_id, expo_push_token)`, RLS on `auth.uid()`, **applied remotely in
  production** (2026-07-27, per header status block).
- Edge function: `supabase/functions/send-push/index.ts` — service-role-only
  (401 without it, `:16-21`), reads `device_push_tokens` for a `user_id`,
  fans out via Expo's push API (`:48-57`), self-prunes dead tokens on
  `DeviceNotRegistered` (`:33-37`).
- Callers: `play-billing-rtdn` (payment failure, the original reason this
  exists) and **`supabase/functions/partner-cheer/index.ts`** — an
  authenticated endpoint sending a one-tap partner "cheer": verifies JWT,
  rate-limits one/UTC-day (UNIQUE constraint, 429 on duplicate), checks the
  recipient's ED flag with the service role and downgrades to in-app-only if
  open (never blocks sending, only push delivery, `:9-14`), else calls
  `send-push`. **Closest existing template for a social "like/reaction/
  follow" push** — same auth → service-role-check → fan-out shape.
- **Observed discrepancy:** `pushToken.js:22-25` comment says "no projectId
  at time of writing... this module logs once and no-ops" but `app.json:8`
  currently DOES carry a projectId
  (`2f60a6ed-8b37-4cd6-8057-60ee04e39ea8`) — the comment is stale relative
  to current `app.json`. Not independently confirmed whether remote push is
  actually flowing in production (would need a device/log check, out of
  scope here) — flagging the discrepancy, not asserting either way.

### C7. In-app notification centre / inbox

**No evidence of one.** Grepped `src/` for `notification.*inbox`, `activity
feed`, `NotificationCentre`, `NotificationCenter`, `ActivityFeed` —
zero matches. The only "in-app" notification surfaces found are (a) the
`CHANNEL.IN_APP` toast/banner delivered live via the foreground handler
(ephemeral, not a persisted list — `handler.js`) and (b) Partners' one-shot
"cheer"/"win" delivery (also ephemeral per `shareWins.js`/`partner-cheer`
edge function, no feed by policy — `SHARE_WIN_POLICY.excluded`,
`shareWins.js:31`: "No passive feed... or automatic photo sharing"). A
social/community feature that wants a persistent activity inbox would be
building new ground, not extending an existing surface.

### C8. Tests pinning notification behaviour

| Test file | Pins |
|---|---|
| `budget.test.js` | Push-budget decision core: exemptions, one-per-topic, daily/weekly caps, priority eviction, fail-open on unreadable schedule |
| `scheduler.edSuppression.guard.test.js` | Source-level: the fail-closed ED-suppression pattern repeated at 5 sites in scheduler.js |
| `scheduler.nextWeekdayDate.guard.test.js`, `triggerDate.guard.test.js`, `triggerDate.test.js` | DATE-trigger validation — a past native crash (Sentry VOLYUME-1K, invalid Date → native EXC_BREAKPOINT); pins that nothing schedules outside `triggerDate.js` and no DATE trigger is built unvalidated |
| `campaign14.categoryOwnership.test.js` | ONE authority per user-controlled category (kills 3-way pref-source disagreement across sync mechanisms); **also asserts every `CATEGORY` value is either user-controlled or explicitly declared not** (`:252-253`) — **this is the regression guard that will fail/force-update when a new category is added without classifying it** |
| `campaign14.routingTruth.test.js` | Every delivered notification either navigates to a real destination or is an explicit, declared non-navigating type — no dead routes, no "route string exists so we navigate anyway" |
| `campaign14.inactivityStandDown.test.js` | 3-week-no-training stand-down on routine weigh-in prompts; boundary-day fails open |
| `notificationRoute.test.js` | `routeForNotificationType()` mapping table — **also the guard that fails when a new `data.type` has no route/non-navigating decision registered** |
| `preferences.test.js`, `winbackScheduler.test.js`, `winbackContent.test.js`, `returnNudge.test.js`, `missedCheckin.test.js`, `activationNudgeScheduler.test.js`, `partnerBeats.test.js`, `plannedMealConfirm.test.js`, `campaign10h.mealReminderRestore.test.js` | Per-feature scheduling/copy/restore behaviour for each named category |
| `listeners.test.js`, `restTimerActions.test.js`, `restTimerActions.adversarial.test.js`, `restCuesBackground.guard.test.js` | Tap listener wiring + rest-timer action buttons |
| `nextCheckinDate.dst.test.js` | DST-safe weekly check-in date math |
| `scheduler.copyFixes.guard.test.js` | Source-level copy-string pins (the house convention referenced by the ED-suppression guard above) |
| `blockReadyRelay.test.js` | Block-complete review notification relay |

**The two regression guards that must be updated for ANY new
category:** `campaign14.categoryOwnership.test.js` (classification
completeness) and `notificationRoute.test.js` (routing-decision
completeness) — both iterate `Object.values(CATEGORY)` /
`routeForNotificationType` and will fail on an unclassified addition, which
is the intended enforcement mechanism, not a defect.

---

## D. Live activity / widgets

**`modules/live-activity/`** (iOS-only native module,
`modules/live-activity/index.ts:1-40`): wraps Apple ActivityKit for the rest
timer — `startRestActivity()`/`updateRestActivity()`/`endRestActivity()`
drive a lock-screen/Dynamic-Island widget ticking down rest time without the
app foregrounded. No-ops everywhere except iOS native builds (`isAvailable()`
false on Android/Expo Go, every method silently no-ops — callers need no
platform branch). Also hosts `writeWidgetSnapshot()`, unrelated to the
rest-timer lifecycle: publishes the home/lock-screen widget snapshot to a
shared iOS App Group, called from `src/lib/widgets/storage.js`
independent of whether Live Activities are enabled (`index.ts:22-27`).
Requires manual founder-side Apple Developer portal provisioning (App
Groups + Live Activities capability) before it functions in a real build.

**`modules/rest-timer-live/`** (Android counterpart,
`modules/rest-timer-live/index.ts:1-30`): foreground-service-backed
notification API — `startRestActivity`/`updateRestActivity`/
`startWorkoutForeground`/`startRestForeground`/rest-cue actions — the
Android equivalent of a "live" rest timer, implemented as an ongoing
foreground-service notification rather than ActivityKit (no Android Live
Activity equivalent exists at the OS level). Both modules together are what
`volyume://active-workout` deep links target when tapped
(`RootNavigator.js:838-843` comment references `activeWorkout.js:152`,
`restForeground.js:72,107`).

**`plugins/withVolyumeWidget.js` + `src/widgets/`**: an Expo config plugin
(`withVolyumeWidget.js:1-40`) that creates the iOS widget-extension Xcode
target at prebuild time (ios/ is gitignored, managed workflow) and copies in
the Swift widget sources + entitlements. Two content widgets exist, mirrored
across platforms: **NextSession** (routine name + planned day + week-in-block
chip) and **WeeklyConsistency** ("N of M sessions this week", neutral dots,
never a red/fail colour). Android renderer: `src/widgets/widgets.js`
(react-native-android-widget, `:1-40`) — free tier, **never weight/calories/
body data** because "the home screen is semi-public" (`widgets.js:7-8`).
iOS renderer: `modules/live-activity/widget/VolyumeHomeWidgets.swift` +
`VolyumeWidgetBundle.swift`. Data pipeline is OTA-patchable JS
(`src/lib/widgets/snapshot.js`) — a small versioned JSON snapshot
(`buildWidgetSnapshot()`, `:32-56`) written by `src/lib/widgets/writer.js`
through a storage adapter (`src/lib/widgets/storage.js`) that swaps to the
native App-Group/SharedPreferences bridge at build time; widgets themselves
are dumb renderers of that snapshot, never the DB directly. **Consistency
block is FULLY suppressed** (falls back to neutral next-session content)
while an ED/wellbeing flag is open (`snapshot.js:12-14`), inheriting the
same suppression rule as everywhere else in the app.

**"Training now" state availability for a social feature:** `activeWorkout`
IS exposed in the Zustand store — `src/store/useAppStore.js:1459`
(`activeWorkout: null` initial), set via `setActiveWorkout()` (`:1578`) and
read at many call sites (`:195-243,759,1365-1578,1687`). **However this is
purely local, in-memory session state** — grepped `src/lib/sync/registry.js`
and `src/lib/sync.js` for `activeWorkout`: zero matches, confirming it is
NOT pushed through the sync layer and therefore NOT visible to any other
user or device. A cross-user "X is training now" social signal does not
exist today and would need new plumbing (either a lightweight
presence/heartbeat row synced through the registry, or reuse of the
existing `partner-cheer`-style authenticated edge-function pattern) — it
cannot be read off the current store.

---

*End of recon. ~350-line cap observed.*
