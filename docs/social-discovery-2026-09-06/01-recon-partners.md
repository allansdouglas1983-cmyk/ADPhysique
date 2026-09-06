# 01 — RECON: the current Partners feature (READ-ONLY inventory)

Authority: founder brief 2026-09-06 (Social / Community / Discovery). Method: read from the tree at
`/home/user/ADPhysique` (branch `claude/volyume-social-discovery-h7dknu`), then compared against the recorded design
intent in `docs/bp-partner-system-rebuild.md` and `docs/partners-build-2026-07-03/DESIGN-SPEC.md`. Every claim carries
file:line.

One-line definition: Partners is a 1:1, invite-code-only accountability pairing (max 3 concurrent pairs) that shares a
**derived weekly attendance signal**, a shared streak in weeks, one fixed-line cheer per local day, an optional weekly
integer aim, an optional shared block NAME, and explicit user-approved "win cards". No feed, no search, no discovery,
no free text.

---

## 1. Screens and components

- `src/screens/PartnerScreen.js` (2,353 lines) — the ONLY Partners destination. Route name `Partner`; header title
  "Partners" (`:1040`, `:1052`, `:1073`). Header comment claims DESIGN-SPEC B2-B7 (`:1-15`).
  - States rendered:
    - loading skeleton `:1040-1050`;
    - hard-error state, title "Partners needs a refresh" `:1052-1060`;
    - **empty / never-paired** `:1128-1200`: icon `people-outline`, title "Train with a partner" (or "Add a partner to
      share this update" when arriving with an incoming share payload, `:1133`), pitch body `:1134-1137`, full
      `PartnerPrivacyReceipt`, primary "Invite someone you train with" `:1153`, secondary "I have a code" `:1159` opening a
      code field + "Join";
    - **pending invite**: `PendingCard` `:1441-1517` — "Invitation sent. Waiting for your partner." `:1477`, share-again
      `:1483`, refresh `:1491`, "Cancel invitation" `:1511`;
    - **paired**: `PairCard` `:447-559` — avatar initial `:468-471`, shared-streak hero (`RollingNumber`, shown only at
      run >= 2, `:456`, `:488`), person rows `PersonRow` `:200-211`, cheer pill `CheerPill` `:159-199` ("Sent today"
      `:188`), moment slot `MomentCard` `:212-222`, shared-block chip `BlockStatusCard` `:397-425`, win cards
      `PartnerWinCards` `:327-368`, share-an-update card `PartnerShareWinsCard` `:290-316`, guided week card
      `PartnerGuidedWeekCard` `:248-289`, archived-run `ReconnectCard` `:369-396`, local-read-only notice `LocalReadNotice`
      `:426-446`;
    - **ended**: `partnerRowState` returns `'ended'` (`src/lib/partners/signals.js:61`); copy "Partnership ended" `:942`;
    - **safety/consent**: the receipt IS the consent notice; Beat 2 of the invite journey records
      `PARTNER_PRIVACY_NOTICE_VERSION` (`:1573` "Agree and get my code"; version constant `src/lib/partners/consent.js:36`).
- Sheets/modals owned by the screen: invite journey `InviteJourney` `:1518-1610` (3 beats + progress dots `:577-588`),
  manage sheet `:1230-1248`, shared-block sheet `BlockSheetBody` `:1628-1695`, acknowledgement picker `AckSheetBody`
  `:1305-1338`, share-wins sheet `ShareWinsSheetBody` `:1339-1440`.
- `src/components/PartnerPrivacyReceipt.js` (158 lines) — the two-column "What your partner can see" receipt (`:58`,
  `:62`, `:71`), used in the empty state and invite Beat 2.
- `src/components/BeforeAfterShareSheet.js:136,302,446-449` — progress-photo before/after sheet with an
  `onPreviewForPartner` hand-off into Partners.
- `src/components/ProGate.js:39,293-302` — DORMANT gate copy "Training partner" and a pending-invite-code capture that
  calls `savePendingPartnerCode`.
- Entry points (item 2 lists the navigate calls): You/Coach tab NavRow (`src/screens/YouScreen.js:609-611`), Progress
  utilities tile (`src/screens/AnalyticsScreen.js:519-522`), post-workout beat
  (`src/screens/WorkoutSummaryScreen.js:198-500, 1073-1095`), progress-photo share
  (`src/screens/ProgressPhotosScreen.js:552-556`), notification tap (`src/lib/notifications/notificationRoute.js:141`).
- Settings surface: `src/screens/CoachingRemindersScreen.js:615-636` — "Partner cheers" section + toggle.
  `NotificationSettingsScreen.js:597` names partner cheers in its summary line. ConsistencyScreen deliberately carries
  NO partner row (pinned, item 9).

## 2. Navigation, deep links, invite format

- Lazy import: `src/navigation/RootNavigator.js:235`.
- Registration: `RootNavigator.js:527` — `<Stack.Screen name="Partner" component={PartnerScreen} .../>` inside
  **ProgressStack**, plain and UNGATED (D137 free-for-all; pinned by `src/__tests__/proScreenGating.guard.test.js:107`).
- Deep-link config: `RootNavigator.js:826-827` prefixes `['volyume://', 'https://volyume.app']`; `:884-896` maps
  `ProgressTab.screens.Partner = 'partner/:code?'`. Param MUST be named `code` (consumed at `PartnerScreen.js:635` via
  `parseInviteCode`).
- Android intent filter: `app.json:99-103` (`https`, host `volyume.app`, pathPrefix `/partner`); scheme `volyume` at
  `app.json:11,87`.
- iOS universal links: `public/.well-known/apple-app-site-association` paths include `/partner/*`.
- Web landing page for a not-yet-installed invitee: `public/partner/index.html`.
- `navigate` call sites (all of them):
- `src/screens/AnalyticsScreen.js:522` `navigation.navigate('Partner', { source: 'progress_tile' })`
- `src/screens/YouScreen.js:377` `navigateCrossTab(navigation, 'ProgressTab', 'Partner', { source: 'coach_row' })`
- `src/screens/WorkoutSummaryScreen.js:1082` and `:1093` `navigateCrossTab(... 'Partner', ...)`
- `src/screens/ProgressPhotosScreen.js:554` `navigation?.navigate?.('Partner', {...})`
- `src/lib/notifications/notificationRoute.js:141` returns `{ tab: 'ProgressTab', screen: 'Partner', params: { source:
  'notification' } }`
- Invite code format: server-minted **10 uppercase hex chars** (`supabase/migrate_081_training_partners.sql:263`);
  only its sha256 hash is stored (`:268`). Client shapes at `src/lib/partners/link.js:18-19`: `volyume://partner/<CODE>`
  and `https://volyume.app/partner/<CODE>`; validation regex `/^[A-Z0-9]{8,}$/` at `link.js:23`. Expiry 7 days
  (`src/lib/partners/inviteCache.js:24`, server rule in 081's redeem RPC).

## 3. Domain modules — `src/lib/partners/*` (15 files, 1,798 lines + 2,504 lines of tests)

- `acknowledgements.js` — closed 4-key cheer enum. `ACKNOWLEDGEMENTS:19`, `DEFAULT_ACK_KEY:26`, `isValidAckKey:31`,
  `ackLine:36`.
- `consent.js` — `PARTNER_PRIVACY_NOTICE_VERSION = 3 :36`; `recordPartnerSharingConsent:44` appends a
  `partner_sharing` row to the shared `consent_log` rail via RPC `record_partner_consent`.
- `intention.js` — `KEPT_LINE:23`, `resolveIntention:55`, `weekKeptTogether:78`, `clampAim:91` (the mutual weekly aim,
  never compared).
- `inviteCache.js` — module-scoped single-mint cache. `INVITE_EXPIRY_DAYS:24`, `getCachedInvite:30`,
  `setCachedInvite:37`, `clearCachedInvite:43`.
- `link.js` — `isValidInviteCode:22`, `buildInviteLinks:27`, `parseInviteCode:40`, `inviteShareMessage:57`.
- `moments.js` — milestone-moment engine, local-derived, fail-closed ED suppression (`:1-25`).
  `getVisibleMoments:112`, `markMomentSeen:246`.
- `pendingInvite.js` — AsyncStorage of a code captured before eligibility. `savePendingPartnerCode:39`,
  `rememberPendingPartnerCode:47`, `readPendingPartnerCode:56`, `clearPendingPartnerCode:72`.
- `service.js` (583 lines) — ALL online partner ops (see item 6): `createPartnerInvite:189`,
  `redeemPartnerInvite:219`, `sendCheer:287`, `sendPartnerWinCard:336`, `revokePartnerWinCard:366`,
  `pushWeeklyIntention:392`, `blockPartner:415`, `unpairPartner:437`, `pushWeekSignal:463`, `proposeSharedBlock:497`,
  `adoptSharedBlock:527`, `leaveSharedBlock:551`, `fetchPartnerView:570`.
- `shareWins.js` — the win-card catalogue, policy, forbidden-field list and draft/preview builders:
  `SHARE_WIN_TYPES:1`, `SHARE_WIN_POLICY:28`, `SHARE_WIN_CARD_RULES:34`, `SHARE_WIN_DELIVERY_GUARDRAILS:41`,
  `SHARE_WIN_REVIEW_STEPS:48`, `SHARE_WIN_FORBIDDEN_FIELDS:71`, `isValidShareWinType:115`, `shareWinTypeByKey:119`,
  `buildShareWinDraft:144`, `shareWinDraftHasForbiddenFields:207`, `validateShareWinDraft:212`,
  `buildShareWinPreview:220`, `buildShareWinReviewReceipt:235`, `buildShareWinExampleDrafts:254`,
  `buildShareWinExamplePreviews:260`.
- `sharedStreak.js` — `jointWeekState:31`, `computeSharedStreak:45`, `sharedStreakLabel:90`, `buildSharedWeeks:110`.
- `signals.js` — `ticksLabel:12`, `partnerRowLine:24`, `cheerAllowed:38`, `lastCheerCaption:44`, `partnerRowState:58`,
  `maxPartnersForTier:76` (flat 3), `canAddPartner:80`.
- `supportPlan.js` — `PARTNER_SUPPORT_PRIVACY_LINE:1`, `buildPartnerSupportPlan:8`.
- `telemetry.js` — `trackPartnerSurfaceView:44`, `trackInviteJourneyStep:49`, `trackInviteMinted:55`,
  `trackInviteRedeemed:60`, `trackInviteDiedAtPaywall:65`, `trackCheerSent:70`, `trackUnpair:75`,
  `trackPairWeekActive:80`.
- `tierGate.js` — NEUTERED by D137: `resolveEffectiveTier:13` returns null, `isLapsedPartner:18` returns false.
- `weekSignalWriter.js` — `computeCurrentWeekState:60`, `writeOwnWeekSignals:133` (the outbound derived signal;
  ED/SCOFF freeze lives here).
- Hook: `src/hooks/usePartners.js` (749 lines) — the single consumer-facing facade: `pickPrimary:87`, optimistic pair
  state `:323`, default export `:350`, action set `:519-744`, `writeOwnWeekSignals` call `:443`.
- Partner code OUTSIDE `src/lib/partners/`: `src/lib/streak.js:7,66-73` (the one consistency engine the partner signal
  serialises from), `src/lib/streakState.js:6`, `src/lib/telemetry/events.js:186-214` (14 allowlisted partner telemetry
  names), `src/lib/coachReport.js:19`.

## 4. Local SQLite schema (`src/lib/database.js`, versions by array index)

- **v44** `:1481-1511` — `partnerships` `:1482-1492` (id, member_a, member_b, status, streak_enabled, created_at,
  accepted_at, ended_at, updated_at); `partner_week_signals` `:1493-1503` (pair_id, user_id, week_start, planned_count,
  done_count, week_met, state, updated_at; PK triple); `partner_cheers` `:1504-1510` (id, pair_id, sender_id, sent_on,
  created_at).
- **v52** `:1615-1625` — `partner_shared_blocks` (pair_id PK, block_ref, block_name, proposed_by, status, created_at,
  updated_at).
- **v53** `:1637-1641` — `partner_week_signals.completed_block`, `.hit_pb`, `partnerships.partner_first_name`.
- **v55** `:1678-1689` — `partner_weekly_intentions` (pair_id, user_id, week_start, weekly_aim, created_at,
  updated_at) + `partner_cheers.kind` DEFAULT `'here'`.
- **v56** `:1694-1710` — `partner_win_cards` (id, pair_id, sender_id, card_type, title, summary, detail,
  visible_to_partner, remains_private, created_at, revoked_at, updated_at) + index `idx_partner_win_cards_pair`.
- DRIFT NOTE: the comment at `database.js:1711` labels the Progress Scan entry "v56", but by array index it is v57 —
  the partner win-card entry is the real v56. Only the comments drift; `PRAGMA user_version` follows the index.
- Local read/write API: `getPartnershipsLocal:8077`, `getActivePartnerCount:8090`, `getPartnerWeekSignal:8102`, pair
  signals `:8120`, `getLastCheerSentOn:8127`, `getLastCheerReceived:8138`, `upsertPartnershipFromCloud:8149`,
  `upsertPartnerWeekSignalFromCloud:8184`, `upsertPartnerCheerFromCloud:8202`, `setLocalPartnerCheerSent:8224`,
  `getPartnerWeeklyIntention:8243`, `setLocalPartnerWeeklyIntention:8254`, `upsertPartnerWeeklyIntentionFromCloud:8267`,
  `getPartnerSharedBlock:8287`, `upsertPartnerSharedBlockFromCloud:8295`, `deleteLocalPartnerSharedBlock:8311`,
  `getPartnerWinCards:8318`, `upsertPartnerWinCardFromCloud:8331`, `markLocalPartnerWinCardRevoked:8355`,
  `getLocalPartnershipIds:8365`, pair purge `:8374-8389`, `markLocalPartnershipEnded:8401`.
- Wipe lists: `PARTNER_LOCAL_WIPE_TABLES` `:6948-6955` (six tables), consumed at `:7008`, `:7244`, `:7307`, and
  excluded from the owner-scoped backup at `:7284`; backup exclusion rationale strings `:7495-7500`.
- `partner_blocks` has NO local mirror (server-only write surface, `:1480`).

## 5. Cloud schema (`supabase/migrate_*`)

- **081 `migrate_081_training_partners.sql`** — `partnerships` `:84` (invite_code hash unique index `:98`, status
  CHECK invited|active|ended `:89`, FKs ON DELETE SET NULL `:86-87`), `partner_week_signals` `:124`, `partner_cheers`
  `:193`, `partner_blocks` `:227`. RLS on all four (`:101,138,203,234`) with member-scoped read/write policies
  (`:109,113,118,142,154,206,216,239`). LWW touch trigger `_partner_signal_touch` `:170`. RPCs (SECURITY DEFINER,
  search_path pinned): `create_partner_invite` `:248` (10-hex code, sha256 hash stored) and `redeem_partner_invite`
  `:287` (not-self / 7-day expiry / single-use / not-blocked, all failures raise the same `invite_invalid`). Both
  GRANTed to `authenticated` `:280,330`.
- **092 `migrate_092_partner_end_purge.sql`** — `end_partnership(_pair_id)` `:27`, member-only SECURITY DEFINER;
  DELETES the pair's week signals + cheers and marks the partnership `ended` (the tombstone stays). Header `:8-12`
  records that the earlier "cascade does this" claim in 081/service.js was false.
- **100 `migrate_100_partner_shared_blocks.sql`** — `partner_shared_blocks` `:60` (block_name capped 80 chars,
  server-minted `block_ref`), RLS `:71-135` (read/propose/adopt/delete policies), column-scoped `GRANT UPDATE (status,
  updated_at)` `:123`, touch trigger `:138`, `_partnership_ended_purge_block()` + status->ended trigger `:148-167`, and
  `end_partnership` REPLACED `:169` to also purge the block.
- **102 `migrate_102_partner_safety_consent.sql`** — widens `consent_log`'s consent_type CHECK to add
  `partner_sharing` + a `notice_version` column `:95-118`; `record_partner_consent` RPC `:120`;
  `partnerships.member_a_first_name` / `member_b_first_name` `:151-152` fed by `_partner_first_name(uuid)` `:154` (first
  whitespace token of `users_profile.first_name`, capped 40); `create_partner_invite` hardened to **single-mint**
  `:180`; `redeem_partner_invite` re-created with a server-side ceiling of 3 concurrent active pairs `:253-320`;
  `partner_week_signals.completed_block` / `.hit_pb` `:328-329`.
- **105 `migrate_105_partner_weekly_intention.sql`** — `partner_weekly_intentions` `:70` + RLS `:80-112` (read both,
  write own) + touch trigger `:113` + `_partnership_ended_purge_intentions()` and its ended trigger `:124-145` +
  `end_partnership` REPLACED again `:147`.
- **106 `migrate_106_partner_cheer_kind.sql`** — `partner_cheers.kind` text DEFAULT `'here'` `:52` with a CHECK
  pinning the closed 4-key set `:60-72`.
- **107 `migrate_107_partner_win_cards.sql`** — `partner_win_cards` `:20` (card_type CHECK
  workout_summary|personal_record|block_milestone|progress_card, title 1-80 chars), index `:35`, RLS `:37-78`,
  column-scoped `GRANT UPDATE (revoked_at, updated_at)` `:79`, touch trigger `:81`,
  `_partnership_ended_purge_win_cards()` + trigger `:86-102`, `end_partnership` REPLACED a fourth time `:104`. Header
  `:2-3`: applied remotely 2026-07-10.
- **155 `migrate_155_partner_cheer_server_date.sql`** — replaces the cheer INSERT policy so `sent_on` must equal the
  DB's UTC date `:17-30`, closing an arbitrary-date daily-rate bypass.
- **`supabase/README.md` status on 155 — BLOCKED:** `:77` "155 is PENDING on a client prerequisite"; `:79-87` gives
  the reason verbatim — the app's own fallback insert (`src/lib/partners/service.js`, `insertCheerDirectly`) stamps
  `todayLocalKey()` (LOCAL date) while the policy demands the DB's UTC date, so around UTC midnight the fallback would
  be rejected and `normaliseCheerInsertError` would mis-map the RLS rejection to "partner not active". "The client
  fallback must stamp the UTC date and that build must be in users' hands before 155 runs." Ledger row `:427` marks it
  "PENDING — do not apply without explicit production authorization." Applied to production: 001-048, 050-071, 073-154,
  156-157 (`:77-78`).
- No cron/purge job exists for partner data; purge is entirely trigger + RPC + edge-function driven. `migrate_157`
  removed an unrelated cascade cron.

## 6. Sync — and direct Supabase access

- Registry entry: `src/lib/sync/registry.js:221-236`, `table: 'partner_signals'`, pk
  `['pair_id','user_id','week_start']`, LWW, bidirectional. It is the ONE pair-scoped entry in an otherwise user-scoped
  registry (`:222-229`).
- Transport wiring: `src/lib/sync/transport.js:51,102,124,156`.
- Handler `src/lib/sync/tables/partners.js` (258 lines):
- PUSH `pushPartners:27` — my own week signals for ACTIVE pairs only, batched 200, upsert on
  `pair_id,user_id,week_start` `:72-77`; benign skip when the cloud table is missing `:74`; lapsed override (now always
  false) `:41-58`.
- PULL `pullPartners` — `partnerships` `:99`, then per active pair `partner_week_signals` `:154`, `partner_cheers`
  newest-first limit 200 `:173`, `partner_shared_blocks` `:191`, `partner_weekly_intentions` `:214`, `partner_win_cards`
  `:229`; local prune of vanished partnerships `:140-149`.
- **The client DOES query Supabase directly for partners, outside the sync layer.** `src/lib/partners/service.js`
  calls `getSupabaseClient()` and then `.from(...)` / `.rpc(...)` / `.functions.invoke(...)` directly:
  `c.rpc('create_partner_invite')` `:194`; `c.rpc('redeem_partner_invite')` `:225` and `c.from('partnerships').select`
  `:255`; `c.functions.invoke('partner-cheer')` `:293`; direct `partner_cheers` insert fallback
  `insertCheerDirectly:127` (used at `:302`, `:315`); `partner_win_cards` insert `:355` and update `:377`;
  `partner_weekly_intentions` upsert `:400`; `partner_blocks` upsert `:420`; `c.rpc('end_partnership')` `:441`;
  `partner_week_signals` upsert `:470`; `partner_shared_blocks` delete/insert/update `:504,509,533,559`;
  `fetchPartnerView` `partnerships` select `:575`. `src/hooks/usePartners.js:70-73` also grabs the client directly. This
  is the single largest architectural deviation from CLAUDE.md's "Components NEVER query Supabase directly; everything
  flows through the sync layer".
- No realtime: there is no `.channel(` / `postgres_changes` subscription anywhere in `src/`.

## 7. Notifications

- Category: `CATEGORY.PARTNER_CHEER = 'partner_cheer'` (`src/lib/notifications/categories.js:45`); channels PUSH +
  IN_APP `:143`; `partner_streak` and `partner_joined` both map into the same category `:219-225`. Budget membership
  `src/lib/notifications/budget.js:60`. Android channel description "Partner cheers and other Volyume updates"
  `src/lib/notifications/channels.js:43`.
- Prefs projection: `categoryPrefs.js:97-98` (`blobField: 'partnerCheerEnabled'`); the server-sendable-category note
  is at `:200`.
- Copy: `src/lib/notifications/partnerBeats.js` — `cheerPush:23` ("{name} cheered you on"), `streakKeptPush:32` ("N
  weeks running, together"), `joinPush:45` ("{name} joined you"). Watermark normaliser `:52`.
- Scheduling: `src/lib/notifications/scheduler.js:2031-2100`, `schedulePartnerBeats:2048`, storage key
  `@volyume_partner_beats_v1_<userId>` `:2037`, notification ids `:2038-2040`; exported via `index.js:56`.
- Routing: `notificationRoute.js:118-141` — all three partner beats resolve to `{ tab: 'ProgressTab', screen:
  'Partner' }`.
- Edge function `supabase/functions/partner-cheer/index.ts` (237 lines): inserts the cheer AS the caller under RLS,
  server-stamps the UTC day and ignores a legacy `sentOn` `:20-22`, resolves the recipient, checks the recipient's ED /
  wellbeing flag with the service role and downgrades delivery to in-app only when a flag is open `:11-16`, otherwise
  invokes `send-push` `:17-18`. Closed ack set mirrored at `:55-61`.
- `supabase/functions/delete-account/index.ts:129-156` sweeps partnerships and all five pair-scoped tables on account
  deletion.

## 8. Store

- **There is NO partner state in `src/store/useAppStore.js`** — a case-insensitive grep for "partner" over that file
  returns nothing. All partner state lives in `usePartners` (component-local) and SQLite. The only store coupling is
  indirect: `userProfile.scoffScore` read at `src/screens/ActiveWorkoutScreen.js:3784` when writing the outbound week
  signal.

## 9. Tests, and the guards that would break on a rename/removal

Behavioural suites (safe to delete alongside the feature):
`src/lib/partners/__tests__/{consent,inviteCache,link,moments,partnerAcknowledgements,partnerIntention,service,shareWins,signals,supportPlan,telemetry,weekSignalWriter}.test.js`;
`src/hooks/__tests__/usePartners.{cancelInvite,loadError,redeemCap,sharedBlock}.test.js`;
`src/lib/__tests__/partnerLocalPurge.test.js` (pins the five shared tables are purged locally);
`src/lib/sync/__tests__/sync.partners.test.js` (push-own-only, pull-both, prune-on-vanish, benign missing-table skip);
`src/lib/notifications/__tests__/partnerBeats.test.js`.

**Source-level regression guards (fs.readFileSync + regex) — these FAIL if a Partners screen, route, table, column or
copy string is renamed or removed:**

- `src/lib/partners/__tests__/partnerPrivacy.guard.test.js` — allowlist of the ONLY columns any client-side partner
  cloud write may serialise. Any new shared column fails here by design.
- `src/lib/partners/__tests__/partnerNames.guard.test.js` — pins migrate_102's server-side first-name derivation
  (first token, cap 40, snapshotted both sides).
- `src/lib/partners/__tests__/weekSignalScoff.guard.test.js` — pins that BOTH `writeOwnWeekSignals` call sites pass
  `scoffScore` (ED-adjacent).
- `src/lib/partners/__tests__/partnerIntentionPurge.guard.test.js` — pins that `partner_weekly_intentions` is purged
  by `end_partnership`, the ended trigger, the local unpair/wipe paths AND the delete-account edge function.
- `src/lib/partners/__tests__/partnerCheerEdge.guard.test.js` — pins edge-function internals (`users_profile` not
  `profiles`, missing-`kind` retry).
- `src/lib/__tests__/partnerCheerRateBoundary.guard.test.js` — reads BOTH `supabase/functions/partner-cheer/index.ts`
  and `migrate_155`; this is the file that encodes the 155 blocker.
- `src/screens/__tests__/PartnerScreen.test.js` — reads `../PartnerScreen.js`; pins multi-pair isolation, the flat 3
  cap, exact receipt copy, one-code minting, block/unpair primitives.
- `src/screens/__tests__/partnerPlacementSpine.guard.test.js` — pins the four placement invariants, including that
  **ConsistencyScreen carries NO Partners row** and AnalyticsScreen carries the tile inside the utilities grid.
- `src/screens/__tests__/partnerComparison.guard.test.js` — scans partner-surface string literals for any comparison
  construct (D5 hard lock).
- `src/screens/__tests__/partnerMomentsBeat.guard.test.js` — pins that WorkoutSummaryScreen derives its beat list from
  `partners.pairs`.
- `src/screens/__tests__/CoachingRemindersScreen.partnerCheers.guard.test.js` and
  `settingsDiscoverability.item9ab.guard.test.js` — pin the settings toggle.
- `src/__tests__/proScreenGating.guard.test.js:107` — pins `PartnerScreen` / route `Partner` as declared in the
  "Formerly Pro-only screens" block with NO guard HOC. Renaming either the component or the route fails this.
- `src/navigation/__tests__/linkingConfig.test.js:102-177` — pins `config.screens.ProgressTab.screens.Partner ===
  'partner/:code?'` and the code round-trip.
- `src/__tests__/universalLinksPreparation.test.js:17` and `campaign7.releaseConfig.test.js` — pin `/partner/*` in the
  AASA file.
- `src/lib/notifications/__tests__/campaign14.routingTruth.test.js:180-190` — pins that
  `partner_cheer`/`partner_streak`/`partner_joined` route to `ProgressTab`/`Partner` AND that a `/cheer/` marker exists
  in PartnerScreen.js.
- `src/lib/notifications/__tests__/campaign14.categoryOwnership.test.js`, `notificationRoute.test.js`,
  `scheduler.edSuppression.guard.test.js`.
- `src/__tests__/campaign15.stateContract.test.js:293` — `partner_signals` must appear in the registry table list.
- `src/__tests__/campaign6.longTerm.test.js:132-147,499-506` — exempts `partners/acknowledgements.js` from a copy law
  and pins the cheer pull `.order('created_at',{ascending:false}).limit(200)` plus the this-week scoping of both signal
  reads.
- `src/lib/__tests__/wipeAllUserData.test.js:117-121` — every local partner table must be FATAL during account wipe.
- `src/lib/__tests__/signOutWipeEscape.test.js`, `edFlagFailClosed.guard.test.js:39,148` (weekSignalWriter is one of
  the eight fail-closed feeds), `src/lib/__tests__/dbFunctionPrivilege.contract.test.js`,
  `edgeBodyLimits.guard.test.js`, `sync/__tests__/upsertConflictTargets.guard.test.js`,
  `src/__tests__/screen-mount.test.js:621` (PartnerScreen must mount), `themeTokens.guard.test.js`,
  `rollingNumber.guard.test.js`, `Button.hierarchy.guard.test.js`, `AppAlert.a11y.test.js` (all read PartnerScreen.js
  among other files).

## 10. Production data footprint for a paired user

Cloud (EU-Dublin), all pair-scoped unless noted:
- `partnerships` — 1 row per pairing (kept as a tombstone after `ended`; auth FKs are ON DELETE SET NULL, so a deleted
  account leaves the row).
- `partner_week_signals` — 1 row per (pair, member, week) for the life of the pair.
- `partner_cheers` — up to 1 row per (pair, sender, day).
- `partner_shared_blocks` — at most 1 row per pair.
- `partner_weekly_intentions` — 1 row per (pair, member, week) when used.
- `partner_win_cards` — 1 row per sent card, soft-revoked via `revoked_at`.
- `partner_blocks` — user-scoped, server-only, survives unpair by design.
- `consent_log` — append-only `partner_sharing` rows (grant + withdrawal) with `notice_version`; these are an AUDIT
  rail and must NOT be deleted by a migration.
- `partnerships.member_a_first_name` / `member_b_first_name` — snapshotted PII (first names) that live outside
  `users_profile`.
- Telemetry: 14 allowlisted `partner_*` event names in `src/lib/telemetry/events.js:186-214`, accepted by
  `record_engine_telemetry` (081/100/102/156). Retiring the names needs a matching allowlist migration.

Device (SQLite, six tables listed in item 4) plus AsyncStorage keys: `@volyume_partner_moments_seen_v1`, `_shown_v1`,
`_pb_v1` (`src/lib/partners/moments.js:49-51`), `@volyume_pending_partner_code` (`pendingInvite.js:17`),
`@volyume_partner_wk_<pairId>_<weeksActive>` (`weekSignalWriter.js:121`), `@volyume_partner_beats_v1_<userId>`
(`scheduler.js:2037`), and the `partnerCheerEnabled` notification-pref flag.

A clean retirement or migration must handle, in this order:
1. the four cumulative `end_partnership` re-definitions (092 -> 100 -> 105 -> 107) and the three
  `_partnership_ended_purge_*` triggers — dropping a table without updating them leaves a broken function;
2. `delete-account`'s hard-coded table list (`index.ts:138-155`);
3. `database.js`'s `PARTNER_LOCAL_WIPE_TABLES` and the backup exclusion list;
4. the `consent_log` `partner_sharing` CHECK value (append-only rail — widen, never narrow);
5. the telemetry allowlist inside `record_engine_telemetry`;
6. live invite links already shared out-of-band (`/partner/*` AASA + Android intent filter must keep resolving or the
  links dead-end);
7. **migration 155, which is BLOCKED and un-applied** — any successor scheme inherits the local-vs-UTC `sent_on`
  defect unless the client fallback is fixed.

## 11. User-facing copy that names the feature

- Screen title "Partners" — `PartnerScreen.js:1040,1052,1073`; error title "Partners needs a refresh" `:1056`.
- Empty state: "Train with a partner" `:1133`; "Add a partner to share this update" `:1133`; pitch `:1137`; "Invite
  someone you train with" `:1153`; "I have a code" / "Hide code entry" `:1159`; "Join" `:1183`.
- Receipt: "What your partner can see" `PartnerPrivacyReceipt.js:58`; "They will see" `:62` / "They never see" `:71`;
  six SEE lines `:27-32`; four NEVER lines `:35-38`; footer "Either of you can end this at any time. Everything shared
  is deleted." `:86-88`.
- Invite journey: "A partner, not an audience" `:1554`; "One person you already know and trust." `:1555`; "No feed, no
  followers, no public numbers." `:1556`; "Just whether you each trained against your current plan." `:1557`; "Continue"
  `:1559`; "Agree and get my code" `:1573`; channels Text/WhatsApp/ Email `:1589-1591`; "More options" `:1600`.
- Pair surface: "This week together" `:488`; "Counts towards each person's current plan. Rest weeks never break it."
  `:500`; "Your first shared week is under way" `:506`; "Send a cheer" `:1310`; "Sent today" `:188`; "Choose one fixed
  line for today. One tap, no free text, no pressure." `:1311`; "Share an update" `:307,1365`; "Shared updates" `:334`;
  "Stays private" `:1421`; "Sharing settings" `:418`; "Private partner area" `:473`; "Refresh partner data" `:438`;
  "Invite another partner" `:1117`; "Choose who receives it" `:1083`.
- Shared block: "Shared training block" `:228,1637`; the privacy line `:1638`; "Share block name" `:1668`; "Stop
  sharing this block name" `:1639`.
- Lifecycle alerts: "End partnership?" / "Sharing will stop right away and everything you shared will be deleted."
  `:935`; "Partnership ended" `:942`; "Cancel invitation?" `:953`; "Invitation cancelled" `:960`; "Partner connected"
  `:730,871`; "Partner blocked and partnership ended" `:988`; "Invitation sent. Waiting for your partner." `:1477` (also
  `src/lib/partners/signals.js:28`).
- Share text: `inviteShareMessage` — "Be my training partner on Volyume. You will see whether I trained this week, one
  daily cheer, and any win I choose to send. No food, photos, body metrics or feed." `src/lib/partners/link.js:57-58`;
  share sheet title "Train with me on Volyume" `PartnerScreen.js:806`.
- Notification copy: `partnerBeats.js:23-51` (three pushes).
- Settings: "Partner cheers" section + toggle + description `CoachingRemindersScreen.js:616,622,629,634`; toast
  "Partner cheers on/off" `:395`; NotificationSettings summary `:597`.
- Nav labels: "Partners" NavRow `YouScreen.js:609`; "Partners" tile `AnalyticsScreen.js:519`.
- Dormant gate copy: `ProGate.js:39` "Training partner".
- Web: `public/partner/index.html`.
- Support-plan copy: `src/lib/partners/supportPlan.js:1-2,10`.

## 12. Broader social infrastructure already in the tree (beyond Partners)

There is very little; the app is deliberately non-social.
- **Identity/avatars:** `src/lib/profileAvatar.js` (device-local files under `profile_avatars/`, `:4-32`),
  `src/lib/profileAvatarPresets.js` (6 fixed presets), `src/components/ProfileAvatarMark.js`. Avatars are LOCAL ONLY —
  no sync registry entry, no cloud column, no partner exposure.
- **Names:** the only cross-user identity is a FIRST NAME snapshot on `partnerships` (migrate_102). There is no
  username, handle, display name, public profile, follow/follower, feed, or content-report system anywhere in `src/` or
  `supabase/`.
- **Blocking:** exists, but partner-scoped only — `partner_blocks` (081 `:227`) + `blockPartner` (`service.js:415`) +
  the manage-sheet row. It is a pairing-prevention list, not a general block/report system.
- **Sharing rails that a social product could reuse:** `src/lib/shareCard/` (share-card rendering), `ShareCard` route
  (`RootNavigator.js:531`), `src/lib/sessionShareData.js`, `src/components/BeforeAfterShareSheet.js`,
  `src/lib/partners/shareWins.js` (the sanitised win-card catalogue and its forbidden-field list). These are the closest
  thing to existing social plumbing.
- **Consent rail:** `consent_log` + `record_partner_consent` (102) is a reusable, versioned, append-only per-purpose
  consent mechanism.
- **Push rail:** `supabase/functions/send-push` + `device_push_tokens` (migrate_053) already fan out server-initiated
  notifications; `partner-cheer` is the only current user-to-user producer.

---

## Where the tree diverges from the recorded design intent

- `docs/bp-partner-system-rebuild.md:38-41` locks "the ONLY thing shared is a per-week training tick". The shipped
  surface is materially wider: a weekly aim integer (105), two milestone booleans (102), a shared block NAME (100), win
  cards with title/summary/detail free-ish text (107), a first name (102), and a chosen acknowledgement line (106). Each
  widening is individually documented and guarded, but the blueprint's one-line promise no longer describes the feature.
- `bp-partner-system-rebuild.md:48-50` and `DESIGN-SPEC.md B2/B8` describe a Free=1 / Pro=3 cap and Pro gating. Both
  are GONE under D137: the cap is a flat 3 for everyone (`signals.js:76`) and the route is ungated
  (`proScreenGating.guard.test.js:107`). `ProGate.js:39` still carries dormant "Training partner" upsell copy.
- `DESIGN-SPEC.md B8` puts a `PartnerRow` on ConsistencyScreen; the tree has removed it and PINS its absence
  (`partnerPlacementSpine.guard.test.js:6-10`). `src/components/PartnerRow.js` no longer exists.
- `DESIGN-SPEC.md B8` promotes the Progress tile "directly after the insight-stack section"; Campaign 23 demoted it
  into the utilities grid (`partnerPlacementSpine.guard.test.js:11-16`, `AnalyticsScreen.js:519`).
- `bp-partner-system-rebuild.md:88-89` names `src/components/__tests__/PartnerSurfaces.test.js` as the invariant home;
  that file does not exist. The invariants now live in the guard suites listed above.
- CLAUDE.md architecture law says components never query Supabase directly; `src/lib/partners/service.js` and
  `usePartners.js:70-73` do exactly that for every partner write except the week signal.
