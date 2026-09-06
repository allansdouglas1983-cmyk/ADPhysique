import * as Notifications from 'expo-notifications';

import { registerRestTimerCategory } from './categories';

const TRAINING_REMINDERS_CHANNEL = 'training-reminders';
const REST_TIMER_CHANNEL = 'rest-timer';
// A2: the end-of-rest alert. Separate from the silent live-countdown channel
// because this one MUST sound/vibrate on a locked phone — that is its entire
// job (UX audit CL-1). Users can still silence it independently in OS settings.
export const REST_ALERTS_CHANNEL = 'rest-alerts';
// Coaching reminders (morning weight, weekly check-in, weekly coach, trial
// gates). On Android 8+ every notification MUST target a channel or it is
// dropped/buried; these used to post with no channel and never appeared.
export const COACHING_REMINDERS_CHANNEL = 'coaching-reminders';

/**
 * Registers the Android notification channels Volyume uses.
 *
 * Per NOTIFICATIONS_LOCKED.md, all push respects a quiet-hours window
 * and OS-level channel grouping. Android requires channels to be
 * declared before any scheduled notification can target them; iOS
 * silently ignores. Call at app boot from App.js.
 *
 * Channels:
 *   training-reminders: HIGH importance, sound + vibrate, used by
 *     the weekly training-day push and the daily check-in reminder.
 *   rest-timer: LOW importance, silent, used by the live rest-timer
 *     countdown notification while the user is between sets. End-of-
 *     rest feedback comes from the in-app sound + haptic, not the
 *     notification itself.
 */
export async function ensureNotifChannels() {
  try {
    // C7 release audit F2: the send-push Edge Function targets
    // channelId 'default', which no client code created - those pushes
    // landed on expo's unbranded fallback channel. Creating the channel
    // the server already names is the repo-side half that needs no server
    // deploy: server-sent updates now appear under a named channel in the
    // OS settings. (The description named partner cheers until Partners
    // was retired on 2026-09-06, SD-03; the channel itself still carries
    // any old partner push that reaches a device.)
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Updates',
      description: 'Community follows and activity, and other Volyume updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync(TRAINING_REMINDERS_CHANNEL, {
      name: 'Training reminders',
      description: 'Reminders on your scheduled training days',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      showBadge: false,
    });
    await Notifications.setNotificationChannelAsync(COACHING_REMINDERS_CHANNEL, {
      name: 'Coaching reminders',
      description: 'Morning weight, weekly check-in and coaching updates',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL, {
      name: 'Rest timer',
      description: 'Live countdown shown while a rest timer is running',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    });
    await Notifications.setNotificationChannelAsync(REST_ALERTS_CHANNEL, {
      name: 'Rest finished',
      description: 'A single alert when your rest between sets ends',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      showBadge: false,
    });
    // Register the rest-timer notification CATEGORY + its action
    // buttons here too, so the live rest notification's Log set /
    // ±15s / Skip rest buttons are available. Requires a fresh native
    // build to take effect (categories are not OTA-updatable).
    await registerRestTimerCategory();
  } catch {}
}
