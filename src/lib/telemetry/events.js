/**
 * Canonical event names per TELEMETRY_DASHBOARDS_LOCKED.md
 * Event catalogue. Source of truth for both the client-side
 * allow-list and the server-side record_engine_telemetry
 * CHECK list. Adding a new event here is the only step needed;
 * the transport.js push picks it up automatically.
 *
 * Keep this file FLAT (no imports beyond core) so static analysis
 * can read it without evaluating side-effect code.
 *
 * The TELEMETRY_EVENTS array drives:
 *   1. the client-side allow-list in transport.js
 *   2. the source-scan acceptance test
 *      (TELEMETRY_DASHBOARDS_LOCKED.md "Acceptance check": every
 *       event in the catalogue has a corresponding track() call
 *       in the codebase, verified by a test scanning the source)
 *
 * Events with `deferred: true` are catalogued for future work but
 * have no current emitter; the source-scan test allows them. Move
 * to `deferred: false` once a track() call site lands.
 */

export const TELEMETRY_EVENTS = Object.freeze([
  // Panel 2: engine health
  { name: 'ed_pattern_flag_fired',           deferred: false, panel: 2 },
  { name: 'ed_pattern_flag_cleared',         deferred: false, panel: 2 },
  { name: 'goal_lock_set',                   deferred: false, panel: 2 },
  { name: 'goal_lock_cleared',               deferred: false, panel: 2 },
  { name: 'weekly_coach_run',                deferred: false, panel: 2 },
  { name: 'ffm_floor_hold_fired',            deferred: false, panel: 2 },
  { name: 'rapid_loss_compression_triggered',deferred: false, panel: 2 },
  // Q4 ruling (2026-08-21, no-outside-party law): the five CC32
  // capability operational counters are RETIRED from the catalogue.
  // Even content-free events land per-user, so their presence alone
  // could reveal that a user has capability rules. No capability-derived
  // event leaves the device; migrate_150 is retired unapplied.

  // Panel 3: food layer
  { name: 'food_lookup_barcode',             deferred: false, panel: 3 },
  { name: 'ocr_writeback_attempted',         deferred: false, panel: 3 },
  { name: 'food_logged',                     deferred: false, panel: 3 },
  { name: 'food_search_attempt',             deferred: false, panel: 3 },
  { name: 'custom_food_created',             deferred: false, panel: 3 },
  // Food audit D-6 + P-7: data-quality + assembly observability. Counts/flags +
  // coded reasons only, never food names or values.
  //   meal_plan_assembled       per-generate: kind, dayCount, withinTolerance,
  //                             unfilledDays, fatInBand, maxCloseOutIterations
  //   food_promote_failed       a network food never cached (source only)
  //   ocr_low_confidence_saved  a custom food saved with low-confidence OCR
  //                             fields (count of flagged fields only)
  //   food_sanity_check_failed  sanity gate tripped (coded reason + edit/override)
  // Server allow-list: supabase/migrate_085_food_quality_telemetry.sql.
  { name: 'meal_plan_assembled',             deferred: false, panel: 3 },
  { name: 'food_promote_failed',             deferred: false, panel: 3 },
  { name: 'ocr_low_confidence_saved',        deferred: false, panel: 3 },
  { name: 'food_sanity_check_failed',        deferred: false, panel: 3 },

  // Panel 4: sync health
  { name: 'sync_run',                        deferred: false, panel: 4 },
  { name: 'sync_conflict_resolved',          deferred: false, panel: 4 },

  // Panel 5: cascade + conversion
  { name: 'tier_changed',                    deferred: false, panel: 5 },
  { name: 'cascade_started',                 deferred: false, panel: 5 },
  { name: 'cascade_advanced',                deferred: false, panel: 5 },
  { name: 'cascade_skipped_ahead',           deferred: false, panel: 5 },
  { name: 'cascade_state_transition',        deferred: false, panel: 5 },
  { name: 'paid_converted',                  deferred: false, panel: 5 },
  { name: 'churn_at_gate',                   deferred: false, panel: 5 },
  { name: 'subscription_cancelled',          deferred: false, panel: 5 },
  { name: 'paywall_shown',                   deferred: false, panel: 5 },
  { name: 'paywall_tapped_cta',              deferred: false, panel: 5 },
  // Full-screen Pro lock impression. Emitted when a free user lands on a Pro
  // route and the ProLocked gate renders (the view half of the lock -> upgrade
  // funnel, so lock-view -> ProUpgrade is computable). Payload: the feature key
  // only (e.g. 'Food diary'); no PII, no values. Server allow-list:
  // supabase/migrate_103_feature_locked_telemetry.sql.
  { name: 'feature_locked_viewed',           deferred: false, panel: 5 },
  // COMP-025-A: cancellation-reason capture. enum reason + surface only, no
  // PII (free text routes to user_feedback, never here).
  //   reason  = price|not_using|missing_feature|switching|temporary_break
  //   surface = pre_store_handoff|post_lapse_sheet
  // Server allow-list: supabase/migrate_079_cancel_reason_telemetry.sql.
  { name: 'cancel_reason_captured',          deferred: false, panel: 5 },
  { name: 'purchase_initiated',              deferred: false, panel: 5 },
  { name: 'purchase_completed',              deferred: false, panel: 5 },
  { name: 'purchase_failed',                 deferred: false, panel: 5 },
  { name: 'restore_purchases_attempted',     deferred: false, panel: 5 },

  // Panel 6: notifications
  { name: 'notification_sent',               deferred: false, panel: 6 },
  { name: 'notification_tapped',             deferred: false, panel: 6 },
  { name: 'notification_failed',             deferred: false, panel: 6 },

  // Panel 8: privacy + consent
  { name: 'article9_consent_recorded',       deferred: false, panel: 8 },
  { name: 'article9_consent_withdrawn',      deferred: false, panel: 8 },
  { name: 'account_created',                 deferred: false, panel: 8 },
  // account_deleted: cannot fire from the client because
  // engine_telemetry.user_id has ON DELETE CASCADE; the
  // non-cascading account_deletions_log table (migration 039) is
  // the surviving audit trail. The locked catalogue lists the
  // event so the dashboard mapping is recorded; no track() call.
  { name: 'account_deleted',                 deferred: true,  panel: 8,
    deferralReason: 'cascade-deleted with auth.users; replaced by account_deletions_log per CURRENT_STATUS.md § 4' },

  // Panel 1: lifecycle
  { name: 'sign_in',                         deferred: false, panel: 1 },
  { name: 'sign_out',                        deferred: false, panel: 1 },
  { name: 'app_cold_start',                  deferred: false, panel: 1 },
  { name: 'app_foregrounded',                deferred: false, panel: 1 },
  { name: 'app_backgrounded',                deferred: false, panel: 1 },

  // Panel 1: core engagement (LB-8). The activation + retention loop:
  // started a session, finished one, activated a plan. Payloads carry
  // counts/flags only, never training content.
  { name: 'workout_started',                 deferred: false, panel: 1 },
  { name: 'workout_completed',               deferred: false, panel: 1 },
  { name: 'plan_activated',                  deferred: false, panel: 1 },

  // Held-decision umbrella per spec but unused: the per-type events
  // (ed_pattern_flag_fired, ffm_floor_hold_fired,
  // rapid_loss_compression_triggered) already populate Panel 2
  // split-by-type. CURRENT_STATUS.md § 4 confirms the umbrella adds
  // no signal.
  { name: 'held_decision_created',           deferred: true, panel: 2,
    deferralReason: 'per-type events already cover Panel 2; umbrella duplicates without adding signal' },
  { name: 'held_decision_cleared',           deferred: true, panel: 2,
    deferralReason: 'same as held_decision_created' },

  // COMP-015: visible session autoregulation. coverage + trust metrics.
  // Payloads carry muscle keys + direction only, never training content.
  // Server allow-list: supabase/migrate_073_session_adjustment_telemetry.sql.
  { name: 'session_adjustment_shown',        deferred: false, panel: 2 },
  { name: 'session_adjustment_reverted',     deferred: false, panel: 2 },

  // COMP-006: methodology page open (trust formation). source param only
  // (why_block / held_decisions / you_tab / paywall); no PII.
  // Server allow-list: supabase/migrate_074_methodology_telemetry.sql.
  { name: 'methodology_opened',              deferred: false, panel: 2 },

  // COMP-005: recap story open. variant param only (month / block); no PII.
  // Server allow-list: supabase/migrate_075_recap_telemetry.sql.
  { name: 'recap_opened',                    deferred: false, panel: 2 },

  // COMP-013: first-session activation choice on the Home hero first-run
  // variant. choice param only (short / full); no PII.
  // Server allow-list: supabase/migrate_076_first_session_choice_telemetry.sql.
  // Deferred (founder 2026-06-30): the Home first-run hero variant was retired
  // — the full session is now the single primary action — so this event has no
  // emitter. Catalogue entry kept so the server allow-list/dashboard is intact.
  { name: 'first_session_choice',            deferred: true, panel: 1, deferralReason: 'Home first-run hero variant retired 2026-06-30; no emitter' },

  // COMP-019: chart window changed (interactive charts). chart_id + window
  // labels only (e.g. weight/e1rm/volume, 3M); no PII, no values.
  // Server allow-list: supabase/migrate_077_chart_window_telemetry.sql.
  { name: 'chart_window_changed',            deferred: false, panel: 1 },

  // COMP-018's weekly-consistency streak events (streak_week_resolved,
  // streak_milestone_reached, streak_paused) are RETIRED with the construct
  // itself (founder Today-truth-repair ruling: the user-facing weekly
  // run/streak is rejected product-wide). Nothing emits them any more, so
  // they leave the catalogue rather than linger as permanently-silent
  // entries. The server allow-list (supabase/migrate_078_streak_telemetry.sql)
  // is left in place: it is additive and harmless, and dropping a live
  // allow-list column is a migration decision, not a client one.

  // Share-card landmarks (audit S-011, Sentry VOLYUME-1P) are ALL retired
  // now. perfect_month_reached and longest_run_pb_reached went with the
  // weekly run/streak construct (COMP-018 note above);
  // tonnage_milestone_reached went with the lifetime-tonnage landmark
  // Moment on the Progress landing (founder device order 2026-08-17).
  // Nothing emits any of them, so they leave the catalogue rather than
  // linger as permanently-silent entries. The server allow-list
  // (supabase/migrate_093_landmark_telemetry.sql and later re-statements)
  // is left in place: additive and harmless, and dropping a live
  // allow-list entry is a migration decision, not a client one.

  // COMP-026 (B): step-trend TDEE modifier evaluated on a coach run. Counts and
  // flags only (active/direction/gain bucket, agreement, logged-day counts,
  // adjustment magnitudes at 0.50 vs the applied gain); no PII, no step counts,
  // no weight. Server allow-list: supabase/migrate_080_step_tdee_telemetry.sql.
  { name: 'step_tdee_modifier_evaluated',    deferred: true,  panel: 2,
    deferralReason: 'the only runWeeklyCoach call site supplies dailyStepsSeries: null (CoachOutputScreen.js:1696), so stepModifier.reason is always not_evaluated and the emit is unreachable' },

  // Partners was RETIRED on 2026-09-06 (SD-03), so its client event
  // names have been dropped from this catalogue: with no emitters left they
  // would fail the catalogue test, and a client that cannot send them needs
  // no entry. The SERVER allow-list keeps accepting them
  // (record_engine_telemetry, migrations 081 / 102 / 156): dropping a live
  // allow-list entry is a migration decision, not a client one, and the
  // historical rows stay readable.

  // COMP-030: one consolidated event emitted on account_created carrying the
  // pre-account quiz step timings + variant flag (pre-account events cannot
  // reach the server — the RPC requires auth.uid()). Deferred until quiz-first
  // is enabled (ONBOARDING_QUIZ_FIRST) and the emitter is wired at
  // account_created; a server allow-list migration lands with that wiring.
  { name: 'onboarding_quiz_completed',       deferred: true,  panel: 1,
    deferralReason: 'emitted at account_created only when ONBOARDING_QUIZ_FIRST is on; wiring + server allow-list land together' },

  // E7.2: the activation + conversion funnel baseline. The events not listed
  // here already ride existing rails (trial start = cascade_started, subscribe
  // = paid_converted, gate outcomes = churn_at_gate/cascade_skipped_ahead,
  // paywall = paywall_shown/paywall_tapped_cta), so only the genuinely new
  // ones are added. Counts/flags/small enums only; never food or training
  // content, weight or steps. first_* fire once per user via the durable
  // telemetry_firsts table (trackFirst). Server allow-list:
  // supabase/migrate_099_funnel_telemetry.sql.
  //   onboarding_step_completed  payload: { step } — a forward wizard advance
  //   first_plan_generated       first-ever plan generation (once)
  //   first_workout_logged       first-ever completed workout (once).
  //                              C8 (2026-07-11) payload: { first_touch_source }
  //                              — the coarse acquisition slug from
  //                              lib/attribution.js (sanitised [a-z0-9_-],
  //                              max 32 chars, or null; never a URL/click id)
  //   first_food_logged          first-ever food-diary entry (once)
  //   trial_lapse_day1_return    a cascade-expired user reopened the app
  { name: 'onboarding_step_completed',       deferred: false, panel: 1 },
  { name: 'first_plan_generated',            deferred: false, panel: 1 },
  { name: 'first_workout_logged',            deferred: false, panel: 1 },
  { name: 'first_food_logged',               deferred: false, panel: 1 },
  // D137 (fully-free product): the win-back scheduler that emitted this on a
  // cascade-expired user's return was removed with the billing surfaces.
  // Catalogue entry kept for history/dashboard mapping; no live emitter.
  { name: 'trial_lapse_day1_return',         deferred: true,  panel: 1,
    deferralReason: 'dormant billing surface (fully free product, D137)' },

  // Photos LOOP-3 (D4): the milestone-adjacent photo-capture invitation take
  // rate. Feature key only, no PII, no values — never a photo, a weight, a body
  // measurement or the milestone content. shown = the invitation was surfaced on
  // a competence win; accepted = the user tapped "Add a photo".
  // Server allow-list: supabase/migrate_104_photo_prompt_telemetry.sql.
  { name: 'photo_prompt_shown',              deferred: false, panel: 1 },
  { name: 'photo_prompt_accepted',           deferred: false, panel: 1 },

  // Activation-funnel elevation (lead activation ruling, 2026-09-03): the
  // business-visible drop-off between install and first coaching payoff.
  // Counts/flags/small enums only, per the standing rule -- never a weight,
  // a calorie value, or free text. first_* fire once per user (trackFirst,
  // durable via AsyncStorage) except where noted. Second workout is NOT a
  // new event: it is derived server-side as the second workout_completed row
  // per user. Server allow-list: supabase/migrate_156_activation_funnel_telemetry.sql.
  //   first_workout_started       first-ever workout session started
  //                                (alongside the existing workout_started,
  //                                database.js).
  //   first_weigh_in               first-ever morning/body weight saved
  //                                (BodyMetricsScreen new-entry save path).
  //   checkin_started              WeeklyCheckInScreen opened into the
  //                                'open' gate state (the form itself, not
  //                                the too_soon/need_weights gates).
  //                                { first } derived from whether any prior
  //                                coach output exists (hasPriorReview, the
  //                                same getLatestCoachOutput read the screen
  //                                already makes).
  //   first_checkin_completed      first successful weekly check-in submit
  //                                (anchored on the existing
  //                                audit('checkin.weekly.submit') site).
  //   coach_result_viewed          CoachOutputScreen renders a completed
  //                                coaching decision (isCompletedCoachDecision),
  //                                once per mount. { first, hold } -- hold is
  //                                true when the decision carried a data
  //                                hold (heldDecisions non-empty).
  //   coach_recommendation_accepted / _declined  a coach suggestion was
  //                                applied or declined. { kind } is a small
  //                                closed enum: 'calories' | 'volume' |
  //                                'deload' | 'other' (dietBreak). Never the
  //                                magnitude or the resulting number.
  //   notification_permission_requested  the OS permission prompt result,
  //                                { status: 'granted' | 'denied' |
  //                                'undetermined' | 'unknown' }, emitted
  //                                inside requestNotificationPermissions()
  //                                itself so every caller is covered.
  //   setup_started                first-ever mount of the account-setup
  //                                wizard's first visible step, for a
  //                                signed-in user (trackFirst, once).
  //   first_home_landed            first-ever landing on Home after setup
  //                                completes (trackFirst, once). Emitter
  //                                lives in HomeScreen.
  { name: 'first_workout_started',           deferred: false, panel: 1 },
  { name: 'first_weigh_in',                  deferred: false, panel: 1 },
  { name: 'checkin_started',                 deferred: false, panel: 1 },
  { name: 'first_checkin_completed',         deferred: false, panel: 1 },
  { name: 'coach_result_viewed',             deferred: false, panel: 1 },
  { name: 'coach_recommendation_accepted',   deferred: false, panel: 1 },
  { name: 'coach_recommendation_declined',   deferred: false, panel: 1 },
  { name: 'notification_permission_requested', deferred: false, panel: 6 },
  { name: 'setup_started',                   deferred: false, panel: 1 },
  { name: 'first_home_landed',               deferred: false, panel: 1 },

  // D139 (lead programme ruling, 2026-09-03): the plan-generation preview
  // funnel plus the manual-builder start/save funnel. Counts/flags/small
  // enums only, per the standing rule -- never training content. Server
  // allow-list: supabase/migrate_156_activation_funnel_telemetry.sql.
  //   plan_preview_shown/_confirmed/_dismissed  { source: 'home' | 'plans' |
  //                                'update' | 'goal' } -- which surface
  //                                triggered the plan-generation preview
  //                                sheet. Emitter lives in the new
  //                                PlanPreviewSheet, owned by another lane;
  //                                not wired yet, so deferred: true here.
  //   block_decision               { intent: 'repeat' | 'adjust' | 'change' }
  //                                -- the choice made at a finished block.
  //                                Emitter lands in PlansScreen, another
  //                                lane; deferred: true until it does.
  //   library_plan_previewed       {} -- a library plan's detail preview
  //                                opened before adopting it. Emitter lands
  //                                in PlanDetailScreen, another lane;
  //                                deferred: true until it does.
  //   manual_plan_started          {} -- Manual Builder's page 1 -> page 2
  //                                transition ("Create plan and add
  //                                workouts"). Wired in this build
  //                                (ManualBuilderScreen.js).
  //   manual_plan_saved            { activated: boolean } -- a manual
  //                                plan's first save; true for Save &
  //                                Activate, false for Save draft. Wired in
  //                                this build (ManualBuilderScreen.js).
  //   plan_replaced                 {} -- activatePlanWithBlock replaced an
  //                                already-active training block, rather
  //                                than a user's first-ever activation.
  //                                Wired in this build (database.js).
  { name: 'plan_preview_shown', deferred: false, panel: 1 },
  { name: 'plan_preview_confirmed', deferred: false, panel: 1 },
  { name: 'plan_preview_dismissed', deferred: false, panel: 1 },
  { name: 'block_decision', deferred: false, panel: 1 },
  { name: 'library_plan_previewed', deferred: false, panel: 1 },
  { name: 'manual_plan_started',             deferred: false, panel: 1 },
  { name: 'manual_plan_saved',               deferred: false, panel: 1 },
  { name: 'plan_replaced',                   deferred: false, panel: 1 },

  // No signup_started event: it would fire before an account exists, and
  // this pipeline attributes rows to auth.uid() only (no anonymous install
  // id, by the standing privacy posture). The pre-account gap is read as
  // store installs against account_created, the first attributable event.
]);

/**
 * Set of event names that are currently emittable (deferred=false).
 * Used by transport.js as the runtime allow-list.
 */
export const ALLOWED_EVENTS = new Set(
  TELEMETRY_EVENTS.filter(e => !e.deferred).map(e => e.name),
);

/**
 * Names a deferred event explicitly so the source-scan test knows
 * not to demand a track() call site.
 */
export function isDeferred(eventName) {
  const e = TELEMETRY_EVENTS.find(x => x.name === eventName);
  return e ? !!e.deferred : false;
}
