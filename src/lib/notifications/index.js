/**
 * notifications/index.js
 *
 * Public API for the notifications module. Re-exports the surface
 * the rest of the app uses; consumers should import from
 * '../lib/notifications' (or '../../lib/notifications') and never
 * reach into the submodules directly.
 *
 * Internal layout (per NOTIFICATIONS_LOCKED.md):
 *   categories.js   the category enum + channel routing
 *   quietHours.js   the 22:00 -> 07:00 default time-shift rule
 *   permissions.js  request / status helpers
 *   handler.js      foreground delivery handler with smart suppression
 *   scheduler.js    cron-like schedule + cancel helpers
 *   pushToken.js    remote-push token register / unregister (Expo Push)
 *   telemetry.js    notification_sent / _tapped / _failed firers
 *
 * Remote-push surfaces (NOTIFICATIONS_LOCKED.md), being built on the
 * device_push_tokens pipeline (migration 053) + the send-push Edge
 * Function:
 *   - Subscription payment failure  server-driven, fired by the Play
 *                                   Billing RTDN webhook via send-push
 *   - Cascade gate (day 19, 21)     local scheduled at fixed times
 *   - Weekly coach output ready     local scheduled (Monday 09:00)
 * The categories for all three already exist in categories.js.
 */

export {
  requestNotificationPermissions,
  getNotificationPermissionStatus,
} from './permissions';

export { configureNotificationHandler } from './handler';

export { installNotificationListeners } from './listeners';

// D34: native rest-timer chronometer action bridge (Skip / +15s on the FGS
// notification), routed into the same handleRestTimerAction seam.
export { installRestActionBridge } from './restTimerActions';

export { routeForNotificationType } from './notificationRoute';

export {
  scheduleMorningWeightNotification,
  scheduleEveningWeightReminder,
  cancelEveningWeightReminder,
  scheduleCheckinReminder,
  scheduleNextCheckinReminder,
  scheduleCascadeGateNotifications,
  cancelCascadeGateNotifications,
  scheduleTrialDay3Notification,
  cancelTrialDay3Notification,
  scheduleWeeklyCoachReady,
  cancelWeeklyCoachReady,
  scheduleMissedCheckinFollowups,
  cancelMissedCheckinFollowups,
  schedulePlannedMealConfirm,
  cancelPlannedMealConfirm,
  cancelMorningNotification,
  cancelCheckinNotification,
  cancelAllNotifications,
  restoreNotifications,
  rescheduleForTimezoneIfChanged,
  refreshWeighInHorizonIfStale,
  scheduleReturnNudge,
  cancelReturnNudge,
  checkYearOfLiftsUnlock,
  checkMonthlyRecapReady,
} from './scheduler';

export {
  CATEGORY,
  CHANNEL,
  CATEGORY_CHANNELS,
  isPushCategory,
  categoryForDataType,
} from './categories';

export {
  getQuietHours,
  setQuietHours,
  isInsideQuietHours,
  shiftHourMinuteOutOfQuietHours,
  shiftDateOutOfQuietHours,
  DEFAULT_QUIET_HOURS,
  QUIET_HOURS_KEY,
} from './quietHours';

export {
  trackNotificationSent,
  trackNotificationTapped,
  trackNotificationFailed,
} from './telemetry';

export {
  registerPushToken,
  unregisterPushToken,
  getExpoPushToken,
  PUSH_TOKEN_KEY,
} from './pushToken';
