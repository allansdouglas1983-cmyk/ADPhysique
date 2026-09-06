/**
 * categoryPrefs.js — C14 job 3: one authority per notification category.
 *
 * THE PROBLEM THIS SOLVES
 *
 * A user-controlled notification category had up to three independent
 * representations of the same choice:
 *
 *   1. the '@volyume_notification_prefs' AsyncStorage blob (guarded and
 *      synced as a preference, restored on reinstall),
 *   2. a dedicated AsyncStorage key for some categories
 *      ('@volyume_reminder_enabled_v1' for training reminders),
 *   3. a per-category row in the local notification_preferences table,
 *      pushed to the cloud table of the same name by the sync registry.
 *
 * Each has its OWN sync path with its OWN conflict rule: the blob is a
 * guarded pref resolved by edit stamps, the dedicated key was an
 * unguarded cloud-wins pref, and the per-category row is registry
 * last-write-wins on its own timestamp. After any cross-device conflict
 * they can disagree, and nothing decided which one was right. The
 * training reminder showed the failure plainly: the Settings screen read
 * the SQLite row first, while the scheduler read the dedicated key, so
 * the switch could read OFF while reminders kept arriving.
 *
 * THE OWNERSHIP RULE
 *
 *   AUTHORITY   the '@volyume_notification_prefs' blob. It is what every
 *               on-device scheduler already gates on, it is guarded and
 *               stamped, and it restores on reinstall. One place decides
 *               the user's choice.
 *
 *   PROJECTION  the per-category notification_preferences row. Written on
 *               every change, never consulted as the on-device answer.
 *               It exists so the SERVER can read the user's choice before
 *               a remote send (C14 job 4): a device-local value is
 *               invisible to an Edge Function, and inferring one there
 *               would be a lie.
 *
 *   MIRROR      the legacy dedicated key, kept in step for older readers
 *               and for a build that rolls back. Derived, never decisive.
 *
 * Legacy structures are deliberately NOT deleted. They are subordinated:
 * writes go through setCategoryEnabled so every representation moves
 * together, and reads go through isCategoryEnabled so only one of them
 * can answer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORY } from './categories';

export const NOTIF_PREFS_KEY = '@volyume_notification_prefs';

/**
 * The live matrix. Each entry names the ONE blob field that decides a
 * category, the projection row category, and the legacy mirror key if
 * one exists. A category absent from here has no user-facing switch, and
 * adding a switch means adding it here rather than inventing a fourth
 * place to keep the answer.
 *
 * `defaultEnabled` is what an untouched install means, which differs per
 * category: the opt-outs default on, the opt-ins default off.
 */
export const CATEGORY_PREFS = Object.freeze({
  [CATEGORY.TRAINING_REMINDER]: {
    blobField: 'trainingEnabled',
    legacyKey: '@volyume_reminder_enabled_v1',
    defaultEnabled: false,
  },
  // These two default OFF, and that is not the same as "opted out". The
  // field is seeded to true by Pro onboarding (ProOnboardingScreen), so
  // every set-up Pro user carries a real value; absent means the user has
  // not been through that yet. Every live gate already reads it this way
  // (restoreNotifications lays the weigh-in family only when the field is
  // truthy), and the authority must say what the app actually does - a
  // registry that answered "on" while the schedulers answered "off" would
  // be the second disagreeing authority this module exists to remove.
  [CATEGORY.MORNING_WEIGHT]: {
    blobField: 'morningEnabled',
    legacyKey: null,
    defaultEnabled: false,
  },
  [CATEGORY.WEEKLY_CHECKIN_REMINDER]: {
    blobField: 'checkinEnabled',
    legacyKey: null,
    defaultEnabled: false,
  },
  [CATEGORY.CHECKIN_MISSED]: {
    blobField: 'missedCheckinEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
  [CATEGORY.PLANNED_MEAL_CONFIRM]: {
    blobField: 'plannedMealConfirmEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
  // Retired feature (Partners, SD-03 2026-09-06); the pref stays so an old
  // server-sent partner push still respects a user's stored choice.
  [CATEGORY.PARTNER_CHEER]: {
    blobField: 'partnerCheerEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
  [CATEGORY.ACTIVATION_NUDGE]: {
    blobField: 'activationNudgeEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
  // D142: the return nudge's one-tap switch, default on.
  [CATEGORY.RETURN_NUDGE]: {
    blobField: 'returnNudgeEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
  // SD-15: Community's two categories. Like PARTNER_CHEER above, these are
  // server-sendable -- the community-notify Edge Function reads the
  // projection row before delivering, so a toggle-off should push the
  // projection immediately (pushCategoryPrefsNow) rather than waiting for
  // the next ordinary sync.
  [CATEGORY.COMMUNITY_FOLLOW]: {
    blobField: 'communityFollowEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
  [CATEGORY.COMMUNITY_ACTIVITY]: {
    blobField: 'communityActivityEnabled',
    legacyKey: null,
    defaultEnabled: true,
  },
});

async function readBlob() {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * The one answer to "may this category be delivered?".
 *
 * Reads the authority. The legacy key is consulted ONLY when the blob
 * has never recorded the field, which is the pre-migration install, and
 * the per-category row is never consulted at all: it is the outbound
 * projection, so treating it as an input would recreate the two
 * disagreeing authorities this module exists to remove.
 *
 * Never throws. On any read failure it returns the category's default,
 * which is the same answer the schedulers gave before this module.
 */
export async function isCategoryEnabled(category) {
  const spec = CATEGORY_PREFS[category];
  if (!spec) return true;
  const blob = await readBlob();
  if (blob[spec.blobField] !== undefined) return blob[spec.blobField] !== false;
  if (spec.legacyKey) {
    try {
      const raw = await AsyncStorage.getItem(spec.legacyKey);
      if (raw !== null) return raw === 'true';
    } catch (_) { /* fall through to the default */ }
  }
  return spec.defaultEnabled;
}

/**
 * Record the user's choice for a category, everywhere it has to appear,
 * in one call.
 *
 * Order matters. The authority is written first, so a failure further
 * down leaves the device honouring the user's choice rather than a
 * half-applied one. The projection and the immediate push are
 * best-effort: without them the choice still governs this device, and
 * the next ordinary sync ships the row anyway.
 *
 * `extraBlob` carries the sibling fields a screen saves in the same
 * action (a reminder time alongside its toggle) so the caller never has
 * to do its own read-modify-write of the blob and risk dropping a field
 * another screen owns.
 */
export async function setCategoryEnabled(userId, category, enabled, {
  timePref = null, extraBlob = null,
} = {}) {
  const spec = CATEGORY_PREFS[category];
  if (!spec) return;

  const blob = await readBlob();
  const next = { ...blob, ...(extraBlob || {}), [spec.blobField]: !!enabled };
  try {
    // C6 S-2 (D97-23): stamp the edit so the guarded pull cannot let a
    // stale device revert this choice on both devices.
    // eslint-disable-next-line global-require
    require('../sync').notePrefWrite(NOTIF_PREFS_KEY);
  } catch (_) { /* best-effort: the guard falls back to its other rules */ }
  await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));

  if (spec.legacyKey) {
    try { await AsyncStorage.setItem(spec.legacyKey, enabled ? 'true' : 'false'); } catch (_) {}
  }

  if (userId) {
    try {
      // eslint-disable-next-line global-require
      const { setPreference } = require('./preferences');
      await setPreference(userId, category, { enabled: !!enabled, time_pref: timePref });
    } catch (_) { /* projection only: the device already honours the choice */ }
  }
}

/**
 * Push the per-category projection to the cloud now, rather than at the
 * next ordinary sync round.
 *
 * C14 job 4: for a category the SERVER can send (partner cheers), the
 * projection is what the Edge Function reads before delivering. An
 * unsubscribe that waits for the next background sync keeps delivering
 * in the meantime, which is not what the user just asked for. Entirely
 * best-effort - the ordinary sync still carries it if this fails.
 */
export async function pushCategoryPrefsNow(userId) {
  if (!userId) return;
  try {
    // eslint-disable-next-line global-require
    const { getSupabaseClient } = require('../supabase');
    // eslint-disable-next-line global-require
    const { pushNotificationPreferences } = require('../sync/tables/notificationPreferences');
    const sb = getSupabaseClient();
    if (!sb) return;
    await pushNotificationPreferences(sb, { userId, localUserId: userId });
  } catch (_) { /* the next sync round ships it */ }
}
