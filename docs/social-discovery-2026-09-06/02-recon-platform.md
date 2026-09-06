# Platform recon — social/discovery placement inputs

Authority: founder brief 2026-09-06 "Social / Community / Discovery"
(`docs/social-discovery-2026-09-06/`). Read-only recon, tree-sourced,
file:line cited. Partners feature itself NOT inventoried here (owned by
another agent) — only noted where it hangs off these surfaces.

---

## 1. Navigation

**File:** `src/navigation/RootNavigator.js` (2,253 lines).

Bottom tabs (`MainTabs`, line 630-697), internal route id → visible label
(line 690-694, icon map line 675-684):

| Internal tab id | Visible label | Icon (focused/unfocused) | Root stack |
|---|---|---|---|
| `HomeTab` | Today | `today` / `today-outline` | `HomeStack` → `HomeScreen` |
| `PlansTab` | Train | `barbell` / `barbell-outline` | `PlansStack` → `PlansScreen` |
| `DiaryTab` | Nutrition | `nutrition` / `nutrition-outline` | `DiaryStack` → `DiaryScreen` |
| `ProgressTab` | Progress | `stats-chart` / `stats-chart-outline` | `ProgressStack` → `AnalyticsScreen` |
| `ProfileTab` | Coach | `pulse` / `pulse-outline` | `ProfileStack` → `YouScreen` |

- Internal ids are kept stable for deep links/push routing; only the
  *visible* label reads Today/Train/Nutrition/Progress/Coach
  (RootNavigator.js:687-694).
- Custom tab bar: `src/components/VolyumeTabBar.js` — sliding amber pill
  cushion behind active icon+label, no centre FAB ("a paywalled centre
  button violates the free/pro exposure rule", VolyumeTabBar.js:1-26).
  Docks `ActiveSessionMiniBar` above it during a live workout. Carries an
  unseen-coach-review amber dot on the Coach tab (VolyumeTabBar.js:24-30).
  Tabs are default-lazy (mount on first focus) except `HomeTab`
  (RootNavigator.js:645-653).
- Each tab stack pops to root on re-tap of the already-focused tab (NAV-5
  listener, repeated per stack, e.g. RootNavigator.js:360-368).
- Every registered screen in every stack has `headerShown: false`
  (react-navigation chrome is never used) — screens render their own header
  component instead (see below).
- **Modal/sheet presentation:** stack screens are pushed (slide), except
  four food-flow screens explicitly given `presentation: 'modal'`
  (`FoodSearch`, `AddCustomFood`, `ScanBarcode`, `ScanLabel`,
  RootNavigator.js:377-395; also `MyRecipes`/`MyMeals`/`RecipeBuilder`,
  lines 402-415). In-screen sheets (BottomSheet, see §6) are the more common
  transient-content pattern app-wide, not stack-modal presentation.
- **Hero-zoom transition:** a shared "card grows into full screen" push
  animation (`heroZoomTransition`/`heroZoomOptions`, RootNavigator.js:261-349)
  applied to `ActiveWorkout`, `WorkoutSummary`, `PlanDetail`,
  `RoutineDetail`, and `ExerciseDetail` (the only screen using the
  origin-aware variant that grows from the tapped card's measured rect).
- **Auth/consent/first-run routing** — `renderNavigator()`
  (RootNavigator.js:2110-2164), in order:
  1. `!user` → `WelcomeStack` (Welcome, QuizTraining, PlanPreview, Login,
     PrivacyPolicy).
  2. Signed-in, Article 9 consent unresolved for a new user, or explicitly
     declined → `Article9ConsentStack` (blocking gate).
  3. `!firstRunComplete` → `ProOnboardingStack` (the one six-step setup
     wizard for every user; the old free/pro branch is gone, D137).
  4. Else → `LockedMainTabs` (`MainTabs` + optional biometric lock overlay,
     RootNavigator.js:708-723).
- **Deep links** (`linking` config, RootNavigator.js:826-915):
  `volyume://workout/start`, `volyume://active-workout` → Today;
  `volyume://diary(/:date)` → Nutrition; `volyume://routine/:planId` →
  Train → PlanDetail; `volyume://progress` → Progress → Analytics;
  `volyume://partner/:code?` (and `https://volyume.app/partner/:code`) →
  Progress → `Partner` screen (**Partners' only deep-link surface today**);
  `volyume://coach` → Coach → CoachOutput; `volyume://checkin` → Coach →
  WeeklyCheckIn. Prefixes: `volyume://`, `https://volyume.app`
  (RootNavigator.js:827).
- **Header chrome, two shapes** (`docs/rules/styling.md` referenced,
  not opened here — direct from component source):
  - `src/components/ScreenHeader.js` — tab-root chrome: large page title
    (`h1`, 32px InterDisplay-Bold, left) + compact 34px "Volyume V" brand
    mark box (right), optional `subtitle` line, optional `right` node
    override (ScreenHeader.js:1-74). Used by Today/Train/Nutrition/
    Progress(as "Progress")/Coach roots.
  - `src/components/BackHeader.js` — pushed/modal screen chrome: back
    chevron (left) + centred title + optional `right` action, ~61 call
    sites (BackHeader.js:1-101).
  - `src/components/ModalHeader.js` exists as a third sanctioned shape
    (not opened in this pass; referenced by BackHeader.js:33 as sharing its
    close-target sizing convention).

## 2. Progress tab (root: `AnalyticsScreen.js`, 876 lines)

Section order, top to bottom (`AnalyticsScreen.js:242-527`):

1. **`ScreenHeader title="Progress"`** (line 256).
2. **Answer Block** ("am I making progress", always rendered) — one
   `Card surface="surfaceElevated"` containing three `PillarRow` entries
   separated by hairline dividers (lines 276-309): Training → `LiftProgress`,
   Body → `BodyMetrics`, Progress photos → `ProgressPhotos` (hidden under
   `visualPillar.suppressed`, i.e. calm mode/open ED flag). This is the
   screen's one elevated/hero surface (design note lines 266-275).
3. **Load-error / empty states** (`EmptyState` component, lines 321-346).
4. **Recent sessions** (`SectionLabel` + outline `Button` "All sessions" →
   `WorkoutHistory`, lines 349-409) — each row is a `SessionCard`
   (`Card`, function at line 659) → `WorkoutSummary` (read-only).
5. **This week's volume** (`SectionLabel` + `InfoTooltip`, lines 411-429) —
   `VolumeSummaryStrip` (`Card`, line 579) → `VolumeHeatmap`.
6. **Moments** — a dismissible recap-ready banner card (not a `Card`
   component, a bespoke `TouchableOpacity` row, lines 434-455) →
   `RecapStory`.
7. **More stats** grid (`SectionLabel` "More stats" + `navGrid` of
   `NavTile` — 2-col wrap, icon+label+optional locked countdown, lines
   458-525): **Consistency**, **Full history** (`WorkoutHistory`),
   **Recaps** (locked until 10 sessions), **Year of Lifts** (conditional,
   unlocks after 1 year), **Partners** (`people` icon, `t.colors.primary`,
   → `Partner` screen with `source: 'progress_tile'`, lines 516-524 —
   **this is where Partners sits today: last tile in the utility grid**,
   demoted from a full-width row per Campaign 23 §27, line 512-515).

Component used for every entry: `NavTile` (icon/color/label, optional
`locked`+`lockedSub`) for grid items; `Card`-based rows for list items
(SessionCard, PillarRow). No FlatList — the whole screen is one `ScrollView`
(line 244) with `.map()` over `recentSessions` (line 367).

## 3. Coach (`YouScreen.js`, 770 lines) and Home/Today (`HomeScreen.js`, 3,509 lines)

**Coach (`YouScreen.js`)** — one `ScrollView`, `ScreenHeader title="Coach"
subtitle="Weekly coaching from your logs."` with a settings-gear `right`
node (lines 383-397). Structure: profile `Card` (avatar, name, session
count, focus line) → `AthleteProfile` (lines 434-457); optional tappable
"Weekly coaching decision" status `Card` (`tone="primary"`) when a completed
decision exists (lines 477-504); then a run of `SectionLabel` + `NavGroup`
blocks, each `NavGroup` a single bordered container of `NavRow`s separated
by hairlines (not one Card per row — a documented fix for "ten near-
identical boxes", NavGroup docblock lines 111-125): **Your body**
(Injuries & limitations), **This week** (Weekly check-in, conditionally
Coaching decision, Your week/WeeklyStory), **Setup** (goal/phase, nutrition
targets, coaching reminders, volume targets), **Support** (Partners row,
`sub` from `partnerRowLine()`, → cross-tab to `ProgressTab`/`Partner`,
lines 604-614), **Safety checks** (Goal lock, Wellbeing check — tier-blind
by law, lines 616-645). Component vocabulary: `NavRow` (icon chip + label +
one-line `sub` + chevron) is the workhorse; `PressableCard` underneath it.

**Home/Today (`HomeScreen.js`)** — largest screen file in the app (3,509
lines). One `ScrollView`, `ScreenHeader title="Today"` (line 2240). Three
`Card surface="surfaceElevated"` hero cards near the top (lines 2373, 2408,
2431, each with its own `SectionLabel`) for the day's primary state (next
session / active workout / similar — not read in full this pass). Further
down, a muted `SectionLabel` "Injuries & limitations" (line 2786) echoes the
tier-blind capability row also seen on Coach and Settings. Uses the same
`Card`/`SectionLabel` vocabulary as every other tab root; no FlatList.

## 4. Profiles

### `src/screens/AthleteProfileScreen.js` (895 lines)

- **Header:** `BackHeader title="Athlete profile"` (line 441) — this is a
  *pushed* screen off Coach, not a tab root.
- **Hero card:** avatar (`ProfileAvatarMark`, tappable, opens avatar
  `BottomSheet`) + display name + session count + "current focus" line
  (lines 443-476).
- **Stat grid** (4 `StatTile` cards, 2×2, lines 510-515): Body weight,
  Volyume Score / Body fat / "Not scored yet" (photo-derived, suppressed
  under calm/ED flag), Strength (baseline label), Profile status
  (freshness rollup).
- **Strength baselines** section: one `Card` row per key lift with a
  level pill (lines 518-551), `EmptyState` if none.
- **Keep profile current** section: three `Row`s (body metrics / progress
  scan / lifts freshness, each with a status pill fresh/soon/attention,
  lines 553-592) → BodyMetrics / ProgressPhotos / LiftProgress.
- **Details and data** section: `Row`s → `SettingsProfile`, `SettingsData`,
  `Settings` (lines 594-620).
- **Avatar picker** (`BottomSheet`, lines 622-684): "Photo from phone" row
  (via `expo-image-picker`) + a grid of `AVATAR_PRESETS` (Volyume house
  avatars, `ProfileAvatarMark presetKey=`) + a "Clear" action. No username,
  no bio, no city/gym field anywhere on this screen.

**Fields that exist on the local profile object** (`userProfile`, from
`useAppStore`), as read/written by this screen and `SettingsProfileScreen`:
`firstName`, `avatarUri`, `avatarPreset`, `sex`, `heightCm`, `age`
(→ `dateOfBirth` in `user_body_profile`), `dietPreference`. **No username,
no bio/tagline, no location/city, no gym field exists anywhere in the
profile model** (confirmed by reading both profile screens in full; the
only identity fields are first name + avatar + biometric/diet fields feeding
the coaching engine).

- **Avatar picking/upload:** `expo-image-picker` (`ImagePicker.
  launchImageLibraryAsync`, square crop, quality 0.8,
  AthleteProfileScreen.js:344-357) → `saveAvatarPhoto()` in
  `src/lib/profileAvatar.js`.
- **Avatar storage — confirmed LOCAL ONLY, no cloud path:**
  `src/lib/profileAvatar.js:4` — `BASE_DIR =
  ${FileSystem.documentDirectory}profile_avatars/`; files named
  `${owner}_${Date.now()}.jpg`, EXIF-stripped on copy
  (`copyPhotoStrippingExif`, profileAvatar.js:1-36). No
  `supabase.storage` call anywhere in this file. Grepped `avatarUri` /
  `avatarPreset` across `src/lib/sync/tables/*.js` and every
  `supabase/migrate_*.sql`: **zero hits** — the avatar/preset fields are
  not part of the sync registry and there is no `avatar_uri` column in any
  cloud migration. A social feature showing other users' avatars therefore
  needs a genuinely new mechanism (no existing avatar-sync or CDN path to
  reuse).

### `src/screens/SettingsProfileScreen.js` (376 lines)

Editable fields, each in its own bordered `dietBlock` row (icon + label +
sub-copy + control): first name (`TextField`, save-on-blur), biological sex
(two `Chip` radios, confirmed via `appAlert` since it moves calorie floors/
BMR, lines 193-204), height (`HeightFeetInchesField`, save-on-blur, ft/in →
cm, validated 100-250cm), date of birth as age in years (`AgeYearsField`,
save-on-blur, validated 13-100y), diet preference (4 `Chip`s from the
shared `DIETS` list: Omnivore/Pescatarian/Vegetarian/Vegan). Dual-writes to
both `userProfile` (local store) and `user_body_profile` (engine source) for
sex/height/age. No avatar control here (that lives on AthleteProfile).

## 5. Settings (`SettingsScreen.js`, 159 lines)

Uses `src/components/SettingsPrimitives.js` (`SettingsPage`, `SettingRow`,
`settingsStyles`, `useSettingsStyles`) — not seen in full this pass, but its
consumer shape is clear from every row below: icon + label + `sub` one-liner
+ chevron, in one bordered `section` container (same grouped-hairline shape
as Coach's `NavGroup`).

Row order (`SettingsScreen.js:41-155`): Injuries & limitations, Account
(sub = email), Profile, Coaching, Workout & units, Nutrition targets,
Dietary needs, Notifications and reminders, Coaching reminders, Display and
accessibility, Home screen widget (opens an `appAlert`, not a screen),
Health integration (conditional on `isHealthAvailable()`), Your data
(sync/backup/import/export), Privacy and legal, Help and about. No
"Community"/"Social"/"Friends" section exists today — Partners is not
listed on this screen at all (it lives on Coach's Support section and
Progress's More-stats grid only).

## 6. Theme and components

**`src/styles/theme.js`** token names (dark values shown; a parallel light
table + HC/CVD modifier tables exist, resolved live via `useTheme()`):

- **Colours** (`baseColors`, theme.js:37-190): surface ladder `background`
  `#0D0D0D` → `surface` `#191917` → `surfaceElevated` `#222220` →
  `surface2` `#2A2A27` → `surface3` `#343431`; `border` `#6E6E6E`,
  `borderLight` `#7A7A7A`, `borderSubtle` `#2E2E2C`; brand
  `primary` `#F5A623` / `primaryFill` `#E08C0B` / `primaryDim` `#B45309` /
  `primaryBg` (12% amber) / `onPrimary` `#0D0D0D`; status
  `success`/`warning`/`error` (+ `*Bg` tints, + `onSuccessBg`/`onErrorBg`
  ink-on-tint pairs, + `errorFill` for destructive button fills);
  text `textPrimary` `#FFFFFF` / `textSecondary` `#9E9E9E` /
  `textMuted` `#9C9C9C` / `textDisabled` `#727272`; `tabBar`/`tabBarBorder`/
  `inputBg`; trophy `gold`/`silver`/`bronze`; macro colours `macroProtein`
  (=primary amber) / `macroCarb` (Okabe-Ito sky blue) / `macroFat` (violet)
  / `macroFibre` (neutral grey); one `scrim` for every dimmed backdrop.
- **Spacing** (theme.js:380-391): `hair` 1, `xxs` 2, `xs` 4, `xs2` 6,
  `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32, `xxxl` 48.
- **Radius** (theme.js:393-401): `hair` 2, `xs` 4, `sm` 6, `md` 10,
  `lg` 16 (card default), `xl` 20, `full` 999. `circle(size)` helper for
  perfect circles (avatars, FABs).
- **Font size** (theme.js:409-419): `micro` 10, `xs` 11, `sm` 13,
  `md` 16 (body), `lg` 17, `xl` 20, `xxl` 24, `xxxl` 32, `display` 40.
- **Font weight** (theme.js:531-538): `regular` 400, `medium` 500,
  `semibold` 600, `bold` 700, `heavy`/`black` 800 (same ExtraBold face).
- **Type roles** (`type.*`, `buildTypeRoles`, theme.js:576-706): `display`,
  `h1`, `h2`, `h3`, `title`, `body`, `bodyStrong`, `label`, `overline`
  (uppercase eyebrow), `caption`, `bodySm`, `captionTight`,
  `captionStrong`, `micro`; plus `type.w(role, weight)` (correct Inter face
  per weight) and `type.num(role)` (tabular figures for any numeral).
- **Shadow** (theme.js:743+, not fully quoted): `shadow.sm/md/lg/card`,
  plus one sanctioned glow (`shadow.glow`) reserved for three Pro-moment
  hero surfaces — "no other glow, gradient orb or bloom is permitted"
  (theme.js:28-31).
- **Materials policy** (theme.js:18-36): elevation is the surface ladder in
  dark, shadows in light; no blur (Android-first, expo-blur declined); one
  chart engine (`VolyumeChart`), no second charting library.

**Shared component vocabulary** (`src/components/`):

- **`Card.js`** — the one card surface. Props: `tone` (accent border:
  primary/success/warning/error/gold), `elevated` (sits on
  `surfaceElevated`), `surface` (override tier: surface/surfaceElevated/
  surface2/surface3), `radius` (hair/xs/sm/md/lg default/xl),
  `borderless`, `padding` (spacing key or `'none'`), `onPress`/
  `onLongPress` (auto-wraps in `PressableCard` spring), plus standard
  accessibility props.
- **`Button.js`** — one button primitive. Variants (D148 house rule,
  Button.js:9-25): `emphatic` (solid amber fill, ≤1 per screen),
  `primary` (default — raised charcoal, amber icon glyphs, this is the
  routine-action look, NOT amber-filled), `secondary`/`outline` (quieter),
  `tertiary` (ghost, amber-tinted), `destructive` (solid error fill).
  Sizes `sm`/`md`/`lg`. Props: `loading`, `state` ('idle'/'loading'/
  'success' morph with `onSettled`), `icon`/`trailingIcon`, `fullWidth`
  (default true), `hitSlop`.
- **`Chip.js`** — selectable pill. Props: `label`, `selected`, `onPress`,
  `icon`, `disabled`, `accessibilityRole` ('button' or 'radio' for
  single-select groups). Min touch target 44/48dp.
- **`EmptyState.js`** — icon (52px circle badge) + `title` + `text` +
  optional `actionLabel`/`onAction` (primary `Button`) + optional
  `secondaryLabel`/`onSecondary` + `ghost` variant (dashed, faint,
  dismissible "preview" style) + `compact`. Copy pattern: "adherence-
  neutral, no shame copy, purely directional" (EmptyState.js:8-9).
- **`SectionLabel.js`** — section eyebrow label (referenced throughout,
  e.g. AnalyticsScreen.js:355, `tone="muted"` variant used for de-emphasised
  labels).
- **`SearchBar.js`** — leading search glyph + `TextInput` (min 16px to
  block iOS zoom) + trailing clear-X or `ActivityIndicator` when
  `loading`. Controlled via `value`/`onChangeText`; `onClear` defaults to
  clearing text.
- **`SegmentedControl.js`** — bordered track, pill segments, selected one
  filled `primaryFill`. `options: [{label, value}]`, `equalWidth` (default
  true; false lets content-sized segments share leftover space), `error`
  (red track border).
- **`BottomSheet.js`** — the one sheet chrome, thin wrapper over
  `@gorhom/bottom-sheet`'s `BottomSheetModal`: scrim backdrop, slide-up
  panel, drag handle, tap-outside + hardware-back dismiss, reduce-motion
  aware, screen-reader-modal, and TalkBack/VoiceOver isolation of the
  screen behind it while open (BottomSheet.js:1-45). Controlled via
  `visible`/`onClose`.
- **`AppAlert.js`** (`appAlert(title, message?, buttons?, options?)`) —
  themed replacement for `Alert.alert`, reserved for destructive
  confirmations only (delete account, switch tier, reset history); a
  module-level singleton callable from anywhere including non-component
  lib code.
- **`Toast.js`** (`useToast().show(msg, {variant, duration})`) — ephemeral
  snackbar for routine success/info feedback, FIFO queue (one visible at a
  time), auto-dismiss 2.5s (errors 4s), tap-to-dismiss.
- **`ProfileAvatarMark.js`** — the shared avatar render (uri photo, preset
  key, or initials fallback), used on Coach, AthleteProfile, and the avatar
  picker sheet; supports `editable`/`selected` states and a `size` prop.
- **`VolyumeTabBar.js`** — described in §1.
- **`ModalHeader.js`**, **`BackHeader.js`**, **`ScreenHeader.js`** — the
  three sanctioned screen-chrome shapes (per `docs/rules/styling.md`,
  not opened this pass).
- Domain component folders exist under `src/components/`: `auth/`,
  `coachOutput/`, `food/` (EntryRow, FoodRow, MealSection, QuickAddSheet,
  MacroRings, etc.), `home/` (EvidencePanel, TodayLine), `workout/` — a
  precedent for a future `social/` or `discovery/` component folder in the
  same convention.

## 7. Search

Two existing search patterns, both in `src/lib/*` + a screen, no shared
"SearchScreen" component yet:

- **Exercise picker** (`src/components/ExercisePickerModal.js`): free-text
  query filtered against a `useMemo`-derived `base` list, then run through a
  **six-tier ranked fuzzy search** module, `src/lib/exerciseFuzzySearch.js`
  (referenced ExercisePickerModal.js:435-444 — "alias-aware six-tier ranked
  search... staples outrank specialists within a tier"), with a recents/
  frequents shortcut list ahead of the ranked results and a capability-aware
  filter (Injuries & limitations) that can be toggled off with a "show
  anyway" affordance (ExercisePickerModal.js:256-372).
- **Food search** (`src/screens/FoodSearchScreen.js`): `SearchBar`-style
  input, **250ms debounced** (`debounceRef`, FoodSearchScreen.js:151,
  367-399), waterfall lookup via `src/lib/food/waterfall.js`
  (`searchFoods(userId, q, {limit: 25})`, local cache first then live
  OpenFoodFacts/USDA), request-id guarded against out-of-order responses
  (`searchRequestRef`, lines 152, 380-399), tabbed browse (Suggested/
  Favourites/Frequents/Custom) via `src/lib/food/searchTabs.js`, and a
  personal-history re-ranker (`rankByPersonalHistory`,
  `mergePersonalMatches`).

No debounce/ranking module currently exists for people/users (there is no
user-search surface anywhere in the app today — confirmed by the absence of
any "UserSearch"/"AthleteSearch"/"FriendSearch" screen or lib module).

## 8. Lists

No app-wide FlatList/SectionList wrapper component; each screen wires RN's
own `FlatList` directly. Conventions observed (`WorkoutHistoryScreen.js`
as the representative case, ~18 screens use FlatList/SectionList in total):

- `keyExtractor={item => item.workout.id}` (WorkoutHistoryScreen.js:869) —
  keys off the domain id, not array index.
- `refreshControl={<RefreshControl .../>}` for pull-to-refresh
  (WorkoutHistoryScreen.js:873; also `AnalyticsScreen.js:247-253` on its
  ScrollView).
- `ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}`
  — a plain spacing View, not a themed divider component
  (WorkoutHistoryScreen.js:921).
- No `onEndReached`/pagination convention found in this pass (Progress and
  Coach roots are both single ScrollViews with `.map()`, not paginated
  lists) — a social feed screen would be introducing pagination fresh to
  the codebase's list vocabulary, not following an existing precedent.

## 9. Media

**Dependencies** (`package.json`): `expo-image` `~3.0.11`, `expo-image-
manipulator` `~14.0.8`, `expo-image-picker` `~17.0.11`, `expo-camera`
`~17.0.10`, `expo-media-library` `~18.2.1`, `react-native-vision-camera`
`^4.7.3` (used by the barcode/progress-scan camera flows).

**Progress photos** (`src/lib/progressPhotos.js`, 425 lines) — header
comment states plainly: **"app's private document directory: never synced
to Supabase, never uploaded"** (progressPhotos.js:6). `BASE_DIR =
${FileSystem.documentDirectory}progress_photos/` (line 32), EXIF-stripped
on save (`copyPhotoStrippingExif`, lines 238-251), ordered/queried via
`FileSystem.readDirectoryAsync` (line 315), per-user wipe on account
deletion (line 423). **No Supabase Storage bucket exists for photos at
all** — grepped every `supabase/migrate_*.sql` for
`storage.buckets`/`storage.objects`/`progress_photo`: only unrelated hits
(RPC/RLS files for user-data deletion). Progress photos and the profile
avatar (§4) are both 100% on-device; there is no existing cloud media
pipeline (no bucket, no CDN, no upload path) for any image in the app
today. A social/discovery feature that shows other users' photos or
avatars requires building that pipeline from zero, not extending one.

## 10. Copy voice

Representative user-facing strings (house voice — calm, factual, no shame,
no em dash, British spelling):

1. "No training trends yet" / "Training charts appear here once sessions
   are logged. Body metrics, progress photos and scans are still
   available below." (AnalyticsScreen.js:341-345, empty state)
2. "Couldn't load your training trends" / "Check your connection and try
   again. Your data is safe on this device." (AnalyticsScreen.js:322-326)
3. "Your {month} recap is ready - 45 seconds" (AnalyticsScreen.js:444,
   recap card — note the hyphen-space substitute for what would be an em
   dash)
4. "Nothing logged this week yet." (AnalyticsScreen.js:593, volume empty
   state)
5. "Couldn't refresh Coach" / "Your saved profile stays unchanged. Tap to
   try again." (YouScreen.js:420-421)
6. "First check-in not open yet" / "Log your morning weight and train as
   normal. Volyume will open the check-in once the baseline is ready."
   (YouScreen.js:169-172)
7. "Answer the weekly check-in to produce your coaching decision. Until
   you do, targets stay unchanged." (YouScreen.js:196)
8. "Profile pictures aren't available on your device."
   (AthleteProfileScreen.js:348, degraded-native-module toast)
9. "Change biological sex? Set biological sex to {label}. This affects
   BMR, calorie floors and future nutrition targets. Your current targets
   are not recalculated until the next weekly check-in."
   (SettingsProfileScreen.js:197-198, confirmation alert)
10. "Add lifts for strength standards" / "Log body weight and your main
    lifts to compare against baseline standards." (AthleteProfileScreen.js:
    546-547, empty state)

**Lint rule banning em dashes:** `/home/user/ADPhysique/eslint.config.js`
lines 243-254 (repeated per config block, e.g. also 298-334 and a
`ShareCardScreen.js`-scoped copy at 354-360) — `no-restricted-syntax`
selectors `Literal[value=/—/]` and `JSXText[value=/—/]`, message:
"No em dash (—) in user-facing copy. Use a full stop, comma, or colon
(CLAUDE.md voice rule)." Same block also bans marketing-tell words (delve,
leverage, utilise/utilize, facilitate, seamless(ly), streamline*, robust,
comprehensive — eslint.config.js:256) and hardcoded hex colours
(line 201-204).

## 11. Web

**`web/`** is a pnpm-workspace monorepo (`web/pnpm-workspace.yaml`,
`web/package.json`) with a real Next.js 15.5.24 app at
**`web/apps/web/`** (`@volyume/web`, package.json — deps include
`@supabase/ssr`, `@supabase/supabase-js`, `next`, `react` 18.3.1,
workspace packages `@volyume/supabase` and `@volyume/ui`). This is the
live `volyume.app` site (`public/CNAME` → `volyume.app`).

**`public/`** at the repo root also carries the deployed static site
surface: `index.html`, `privacy.html`/`privacy-policy.md`, `app-map/`,
`articles/`, `auth/`, `email/`, `get/`, `partner/`, `screenshots/`,
`support/`, `survey/`, plus brand assets (`volyume-v.png`,
`volyume-wordmark.png`, `favicon.png`).

**Universal-link association files, both present:**
- `public/.well-known/apple-app-site-association` (exists; not opened this
  pass).
- `public/.well-known/assetlinks.json` — `android_app` /
  `app.volyume` package, `delegate_permission/common.handle_all_urls`,
  with placeholder SHA-256 cert fingerprint strings
  (`REPLACE_WITH_SHA256_OF_PLAY_APP_SIGNING_KEY_CERT`,
  `REPLACE_WITH_SHA256_OF_UPLOAD_KEY_CERT`) still unfilled.

A `public/partner/` directory already exists at the web root, consistent
with the `volyume.app/partner/:code` universal link seen in §1 — the only
existing web-to-app social-adjacent surface.

**`marketing/`** directory also exists at repo root (`FACT-BASE.md`, `hq/`,
`parts/`) — the Marketing HQ operating area (separate skill-driven system,
not part of the shipped app or web surface; not inventoried further here as
out of scope for platform placement).

## 12. Full screens list (`src/screens/*.js`, 81 files)

| File | Purpose (inferred from name/route context) |
|---|---|
| ActiveWorkoutScreen.js | Live in-progress workout logging screen |
| AddCustomFoodScreen.js | Modal: create a custom food item |
| AnalyticsScreen.js | Progress tab root (see §2) |
| Article9ConsentScreen.js | Blocking GDPR health-data consent gate |
| AthleteProfileScreen.js | Athlete profile (see §4) |
| AvoidedMovementsScreen.js | List of movements user has excluded |
| BlockReflectionScreen.js | End-of-training-block reflection prompt |
| BodyMetricsScreen.js | Body weight/composition log and trend |
| BuildWorkoutScreen.js | Blank/ad-hoc workout builder |
| CascadeGateScreen.js | Dormant billing gate screen (unregistered) |
| CoachHeldHistoryScreen.js | Archive of held/paused coach decisions |
| CoachOutputScreen.js | Weekly coaching decision detail |
| CoachReviewScreen.js | Review screen post-coach-decision |
| CoachingRemindersScreen.js | Check-in/weigh-in reminder schedule |
| ConsistencyScreen.js | Training consistency/streak view |
| CreditsScreen.js | App credits/acknowledgements |
| DebugLogScreen.js | Internal debug log viewer |
| DiaryScreen.js | Nutrition tab root, food diary |
| ExerciseDetailScreen.js | Single exercise history/detail |
| FoodInsightsScreen.js | Nutrition insights/trends |
| FoodSearchScreen.js | Food search + add to diary (see §7) |
| GoalChangeSummaryScreen.js | Summary of a training-goal change |
| GoalLockConsentScreen.js | Consent for cutting-goal conservative limit |
| HomeScreen.js | Today tab root (see §3) |
| HowYouTrainAddScreen.js | Add an injury/limitation entry |
| HowYouTrainScreen.js | Injuries & limitations home |
| ImportScreen.js | Data import flow |
| LiftProgressScreen.js | Per-lift strength progress |
| LoginScreen.js | Sign-in screen |
| ManualBuilderScreen.js | Manual plan/routine builder |
| MealNamesScreen.js | Meal name editor (unreachable, retained by order) |
| MealPlanScreen.js | Meal-plan view |
| MesocycleBuilderScreen.js | Mesocycle/training-block builder |
| MethodologyScreen.js | "How Precision Coaching works" explainer |
| MyMealsScreen.js | Saved meals library |
| MyRecipesScreen.js | Saved recipes library |
| NotificationSettingsScreen.js | Notification preferences |
| NutritionEducationScreen.js | Nutrition guide/education content |
| NutritionTargetsScreen.js | Calorie/macro target editor |
| PartnerScreen.js | Partners feature (owned by another agent) |
| PlanDetailScreen.js | Single training plan detail |
| PlanLibraryScreen.js | Browse plan library |
| PlanPreviewScreen.js | Pre-account plan preview (quiz flow) |
| PlanUpdateScreen.js | Plan update/regeneration flow |
| PlansScreen.js | Train tab root |
| PrivacyPolicyScreen.js | In-app privacy policy viewer |
| ProGoalSetupScreen.js | Goal/phase/schedule setup editor |
| ProOnboardingScreen.js | Six-step guided onboarding wizard |
| ProSetupCompleteScreen.js | Onboarding hand-off/completion screen |
| ProUpgradeScreen.js | Dormant billing upsell screen (unregistered) |
| ProgressPhotosScreen.js | Progress photo capture/gallery |
| QuizScreen.js | Pre-account training quiz |
| RecipeBuilderScreen.js | Build a custom recipe |
| RoutineDetailScreen.js | Single routine detail within a plan |
| ScanBarcodeScreen.js | Barcode scanner for food logging |
| ScanLabelScreen.js | Nutrition-label scanner |
| SettingsAboutScreen.js | Help/feedback/rating/version |
| SettingsAccountScreen.js | Account (email, delete account) |
| SettingsCoachingScreen.js | Coaching preferences |
| SettingsDataScreen.js | Sync/backup/import/export |
| SettingsDietaryScreen.js | Dietary needs/allergies |
| SettingsDisplayScreen.js | Appearance/accessibility settings |
| SettingsFaqScreen.js | FAQ content |
| SettingsHealthScreen.js | Health-app integration settings |
| SettingsPrivacyScreen.js | Privacy/consent/data-sharing settings |
| SettingsProfileScreen.js | Profile field editor (see §4) |
| SettingsScreen.js | Settings landing (see §5) |
| SettingsWorkoutScreen.js | Workout & units settings |
| ShareCardScreen.js | Shareable workout/progress card generator |
| SnapshotsScreen.js | Data snapshot viewer |
| SubscriptionPolicyScreen.js | Dormant billing policy screen (unregistered) |
| SubscriptionScreen.js | Dormant subscription screen (unregistered) |
| TrainingConsiderationsScreen.js | Free-tier training-consideration discovery |
| VolumeHeatmapScreen.js | Per-muscle weekly volume heatmap |
| WeeklyCheckInScreen.js | Weekly coaching check-in questionnaire |
| WeeklyStoryScreen.js | "Your week" combined training/eating/coach view |
| WelcomeScreen.js | Pre-auth welcome/landing screen |
| WellbeingCheckScreen.js | SCOFF/wellbeing self-report screening |
| WorkoutHistoryScreen.js | Full workout history list |
| WorkoutSummaryScreen.js | Post-workout summary |
| YearOfLiftsScreen.js | Annual training recap |
| YouScreen.js | Coach tab root (see §3) |
| (paywallExcerpts.js) | Not a screen — dormant billing copy data module |
