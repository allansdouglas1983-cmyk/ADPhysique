import { useState, useEffect, useMemo } from 'react';
import { appAlert } from '../components/AppAlert';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, fontWeight, spacing, radius, withAlpha, alpha, type, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import BackHeader from '../components/BackHeader';
import { requestNotificationPermissions, getNotificationPermissionStatus } from '../lib/notifications';
import {
  scheduleTrainingReminders,
  cancelTrainingReminders,
  REMINDER_PREF_KEY,
  REMINDER_TIME_KEY,
  SCHEDULE_KEY,
} from '../lib/notifications/trainingReminders';
import {
  setPreference as setPrefRow,
  migrateFromLegacyBlob,
} from '../lib/notifications/preferences';
import { setCategoryEnabled, isCategoryEnabled, pushCategoryPrefsNow } from '../lib/notifications/categoryPrefs';
import { CATEGORY } from '../lib/notifications/categories';
import { scheduleMealReminders, scheduleActivationNudge, cancelActivationNudge, scheduleReturnNudge, cancelReturnNudge, MEAL_REMINDERS_KEY } from '../lib/notifications/scheduler';
import { restoreNotifications } from '../lib/notifications';
import {
  getQuietHours,
  setQuietHours,
  DEFAULT_QUIET_HOURS,
} from '../lib/notifications/quietHours';
import useAppStore from '../store/useAppStore';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import { useToast } from '../components/Toast';

const NOTIF_PREFS_KEY = '@volyume_notification_prefs';

const TRAINING_PRESET_TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'];

// Opt-in meal-log reminders (gap #4). Default OFF, convenience-only. Times are
// chosen from a preset list (same lightweight picker as training reminders).
// Campaign 1 P0-5: the key constant now lives in the scheduler (its restore
// path reads it to re-lay reminders after the launch wipe); imported below.
const MEAL_PRESET_TIMES = ['07:00', '08:00', '09:00', '12:00', '12:30', '13:00', '17:00', '18:00', '18:30', '19:00', '20:00', '21:00'];
const DEFAULT_MEAL_REMINDERS = [
  { id: 'breakfast', label: 'Breakfast', hour: 8, minute: 0, enabled: false },
  { id: 'lunch', label: 'Lunch', hour: 12, minute: 30, enabled: false },
  { id: 'dinner', label: 'Dinner', hour: 18, minute: 30, enabled: false },
];

// E2.2 (dossier C18): quiet hours had a setter but no settings UI. Same
// lightweight preset picker as the reminder times above; the window itself is
// enforced by every scheduler helper via quietHours.js.
const QUIET_START_PRESETS = ['20:00', '21:00', '21:30', '22:00', '22:30', '23:00', '00:00'];
const QUIET_END_PRESETS = ['05:00', '06:00', '06:30', '07:00', '07:30', '08:00', '09:00'];





// applyNotifications and its debounced scheduleApply wrapper lived here,
// unreachable since a half-finished refactor removed their handlers. Every
// responsibility they held has a live owner (D94-1, SETTINGS-OWNERSHIP.md
// ruling #3): CoachingRemindersScreen.applyScheduled re-lays the morning
// weight, evening backstop and weekly check-in reminders and writes both the
// blob and the SQLite rows, and persistTrainingPreference below owns the
// training_reminder mirror. Deleted under D95 (AUDIT-DEFERRED-TELEMETRY P3-1);
// the dead path also wrote the prefs blob WHOLESALE, so re-wiring it would
// have silently dropped every key it did not know about.

export default function NotificationSettingsScreen({ navigation }) {
  // Volyume is fully free (founder ruling): morning weight, weekly check-in
  // and meal reminders are coaching inputs available to everyone, same as
  // the general-utility training reminders. No tier read on this screen.
  // CP-10 batch G lane 1 (2026-07-11): live theme (src/hooks/useTheme.js).
  // Memoised: this screen renders mapped meal-reminder rows.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const toast = useToast();
  const [morningEnabled, setMorningEnabled] = useState(false);
  const [morningHour, setMorningHour] = useState(7);
  const [morningMinute, setMorningMinute] = useState(0);
  const [checkinEnabled, setCheckinEnabled] = useState(false);
  const [checkinDay, setCheckinDay] = useState(0);
  const [checkinHour, setCheckinHour] = useState(18);
  const [checkinMinute, setCheckinMinute] = useState(0);
  // Last check-in timestamp in ms, used to enforce the 7-day minimum gap
  // when the user switches their check-in day, so the next reminder
  // doesn't fire only 2-3 days after the previous check-in.
  const [lastCheckinMs, setLastCheckinMs] = useState(0);
  const [trainingEnabled, setTrainingEnabled] = useState(false);
  // S6: the early-activation nudge is tier-blind with its own one-tap disable.
  // Blob-backed (the source the scheduler reads); default on.
  const [activationNudgeEnabled, setActivationNudgeEnabled] = useState(true);
  // D142: the return nudge's own one-tap switch, blob-backed, default on.
  const [returnNudgeEnabled, setReturnNudgeEnabled] = useState(true);
  // SD-15: Community's two toggles, blob-backed, default on -- same shape as
  // the getting-started nudges above.
  const [communityFollowEnabled, setCommunityFollowEnabled] = useState(true);
  const [communityActivityEnabled, setCommunityActivityEnabled] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
        const blob = raw ? (JSON.parse(raw) ?? {}) : {};
        setActivationNudgeEnabled(blob.activationNudgeEnabled !== false);
        setReturnNudgeEnabled(blob.returnNudgeEnabled !== false);
        setCommunityFollowEnabled(blob.communityFollowEnabled !== false);
        setCommunityActivityEnabled(blob.communityActivityEnabled !== false);
      } catch (_) { /* default on */ }
    })();
  }, []);
  const [trainingHour, setTrainingHour] = useState(8);
  const [trainingMinute, setTrainingMinute] = useState(0);
  // FM-02 / C5-P18-05 (D96): null while unread, false when no habit-derived
  // schedule exists yet (so nothing can fire), true once one does. Read-only:
  // this decides one sentence of copy, never what is scheduled.
  const [trainingScheduleReady, setTrainingScheduleReady] = useState(null);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SCHEDULE_KEY)
      .then((raw) => {
        if (cancelled) return;
        let days = [];
        try { days = JSON.parse(raw)?.days ?? []; } catch (_) { days = []; }
        setTrainingScheduleReady(Array.isArray(days) && days.length > 0);
      })
      .catch(() => { if (!cancelled) setTrainingScheduleReady(null); });
    return () => { cancelled = true; };
  }, []);
  const [mealReminders, setMealReminders] = useState(DEFAULT_MEAL_REMINDERS);
  const [permissionStatus, setPermissionStatus] = useState(null);

  // Load saved prefs on mount and request permissions.
  //
  // Read order: SQLite mirror first (synced cross-device via
  // notification_preferences migration 044), then fall back to the
  // legacy AsyncStorage blob if SQLite is empty (fresh install or
  // install that pre-dates migration 044). When the legacy blob is
  // the source, migrateFromLegacyBlob seeds the SQLite mirror so the
  // next sync push has rows to ship. Codex re-audit 2026-05-26
  // finding #2: fresh devices that pulled cloud prefs into SQLite
  // were still rendering AsyncStorage defaults.
  useEffect(() => {
    async function init() {
      const userId = useAppStore.getState().user?.id;
      // Try SQLite mirror first
      const sqliteCategories = new Set();
      let fallbackTrainingEnabled = null;
      let fallbackTrainingHour = 8;
      let fallbackTrainingMinute = 0;
      let hasFallbackTraining = false;
      if (userId) {
        try {
          // eslint-disable-next-line global-require
          const { getAllPreferences } = require('../lib/notifications/preferences');
          const rows = await getAllPreferences(userId);
          if (rows.length > 0) {
            for (const r of rows) {
              sqliteCategories.add(r.category);
              if (r.category === 'morning_weight') {
                setMorningEnabled(!!r.enabled);
                if (typeof r.time_pref === 'string' && r.time_pref.includes(':')) {
                  const [h, m] = r.time_pref.split(':').map(n => parseInt(n, 10));
                  if (Number.isFinite(h)) setMorningHour(h);
                  if (Number.isFinite(m)) setMorningMinute(m);
                }
              } else if (r.category === 'weekly_checkin_reminder') {
                setCheckinEnabled(!!r.enabled);
                if (typeof r.time_pref === 'string' && r.time_pref.includes('_')) {
                  const [dow, hm] = r.time_pref.split('_');
                  const dowIdx = ['sun','mon','tue','wed','thu','fri','sat'].indexOf(dow);
                  if (dowIdx >= 0) setCheckinDay(dowIdx);
                  if (hm && hm.includes(':')) {
                    const [h, m] = hm.split(':').map(n => parseInt(n, 10));
                    if (Number.isFinite(h)) setCheckinHour(h);
                    if (Number.isFinite(m)) setCheckinMinute(m);
                  }
                }
              } else if (r.category === 'training_reminder') {
                setTrainingEnabled(!!r.enabled);
                if (typeof r.time_pref === 'string' && r.time_pref.includes(':')) {
                  const [h, m] = r.time_pref.split(':').map(n => parseInt(n, 10));
                  if (Number.isFinite(h)) setTrainingHour(h);
                  if (Number.isFinite(m)) setTrainingMinute(m);
                }
              }
            }
          }
        } catch (_) { /* fall through to AsyncStorage */ }
      }

      try {
        const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
        if (raw) {
          const prefs = JSON.parse(raw);
          // Apply legacy AsyncStorage values only when SQLite was
          // missing that category. Otherwise SQLite wins (it is the
          // synced source).
          if (!sqliteCategories.has('morning_weight')) {
            if (prefs.morningEnabled !== undefined) setMorningEnabled(prefs.morningEnabled);
            if (prefs.morningHour !== undefined) setMorningHour(prefs.morningHour);
            if (prefs.morningMinute !== undefined) setMorningMinute(prefs.morningMinute);
          }
          if (!sqliteCategories.has('weekly_checkin_reminder')) {
            if (prefs.checkinEnabled !== undefined) setCheckinEnabled(prefs.checkinEnabled);
            if (prefs.checkinDay !== undefined) setCheckinDay(prefs.checkinDay);
            if (prefs.checkinHour !== undefined) setCheckinHour(prefs.checkinHour);
            if (prefs.checkinMinute !== undefined) setCheckinMinute(prefs.checkinMinute);
          }
          if (!sqliteCategories.has('training_reminder')) {
            if (prefs.trainingEnabled !== undefined) {
              fallbackTrainingEnabled = !!prefs.trainingEnabled;
              hasFallbackTraining = true;
              setTrainingEnabled(prefs.trainingEnabled);
            }
            if (prefs.trainingHour !== undefined) {
              fallbackTrainingHour = prefs.trainingHour;
              hasFallbackTraining = true;
              setTrainingHour(prefs.trainingHour);
            }
            if (prefs.trainingMinute !== undefined) {
              fallbackTrainingMinute = prefs.trainingMinute;
              hasFallbackTraining = true;
              setTrainingMinute(prefs.trainingMinute);
            }
          }
          // One-shot back-fill into the SQLite mirror so existing
          // installs that pre-date migration 044 get their prefs
          // into the per-category rows the sync push expects. Safe
          // to call on every mount: setPreference is an UPSERT and
          // migrateFromLegacyBlob skips rows that already exist in
          // SQLite, so a more-recent SQLite write is never stamped
          // with the older AsyncStorage value. Codex re-audit
          // 2026-05-26 F6.
          try {
            const userId = useAppStore.getState().user?.id;
            if (userId) await migrateFromLegacyBlob(userId, prefs);
          } catch (_) { /* tolerate; AsyncStorage read still succeeded */ }
        }
      } catch (_) {}

      if (!sqliteCategories.has('training_reminder')) {
        let legacyTrainingEnabled = fallbackTrainingEnabled;
        let legacyTrainingHour = fallbackTrainingHour;
        let legacyTrainingMinute = fallbackTrainingMinute;
        let hasLegacyTraining = hasFallbackTraining;

        try {
          const trainingEnabledRaw = await AsyncStorage.getItem(REMINDER_PREF_KEY);
          if (trainingEnabledRaw !== null) {
            legacyTrainingEnabled = trainingEnabledRaw === 'true';
            hasLegacyTraining = true;
            setTrainingEnabled(legacyTrainingEnabled);
          }
        } catch (_) {}

        try {
          const trainingTimeRaw = await AsyncStorage.getItem(REMINDER_TIME_KEY);
          if (trainingTimeRaw) {
            const { hour, minute } = JSON.parse(trainingTimeRaw);
            if (typeof hour === 'number') {
              legacyTrainingHour = hour;
              hasLegacyTraining = true;
              setTrainingHour(hour);
            }
            if (typeof minute === 'number') {
              legacyTrainingMinute = minute;
              hasLegacyTraining = true;
              setTrainingMinute(minute);
            }
          }
        } catch (_) {}

        if (userId && hasLegacyTraining) {
          try {
            await setPrefRow(userId, 'training_reminder', {
              enabled: legacyTrainingEnabled ?? false,
              time_pref: `${String(legacyTrainingHour).padStart(2, '0')}:${String(legacyTrainingMinute).padStart(2, '0')}`,
            });
          } catch (_) {}
        }
      }

      // Load the user's last check-in so we can enforce the 7-day minimum
      // gap when they change their check-in day, and so the UI can show
      // an honest "next reminder fires on ..." preview.
      try {
        // eslint-disable-next-line global-require
        const { getLatestCheckin } = require('../lib/database');
        // eslint-disable-next-line global-require
        const { default: store } = require('../store/useAppStore');
        const userId = store.getState().user?.id;
        if (userId) {
          const latest = await getLatestCheckin(userId);
          if (latest?.weekStart) setLastCheckinMs(latest.weekStart);
        }
      } catch (_) {}

      // C5-P27-01 (D96): a mount-time STATUS read, never a prompt.
      // requestNotificationPermissions() returns early only when the status is
      // already granted and otherwise shows the OS dialog, so a Free user who
      // opened this screen just to look met "Allow Volyume to send you
      // notifications?" before touching a control, with nothing on screen
      // explaining why. permissions.js exports the non-prompting sibling for
      // exactly this (ProSetupCompleteScreen already uses it). Every
      // user-action path below still prompts as it did: the meal toggle
      // requests on switch-on, and the training toggle still refuses politely
      // when permission is absent.
      // C14 job 3: last word on the training toggle goes to the ONE
      // authority, after the legacy reads above have had their chance to
      // seed the time. This screen used to let the per-category SQLite row
      // decide, while the scheduler decided from a different key, so the
      // switch could read OFF while reminders kept arriving. Whatever this
      // shows is now exactly what scheduleTrainingReminders will do.
      try {
        setTrainingEnabled(await isCategoryEnabled(CATEGORY.TRAINING_REMINDER));
      } catch (_) { /* leave the value the reads above produced */ }

      try {
        const status = await getNotificationPermissionStatus();
        setPermissionStatus(status);
      } catch (_) {
        setPermissionStatus('denied');
      }
    }
    init();
  }, []);

  function getPrefs({
    me = morningEnabled,
    mh = morningHour,
    mm = morningMinute,
    ce = checkinEnabled,
    cd = checkinDay,
    ch = checkinHour,
    cmin = checkinMinute,
    te = trainingEnabled,
    th = trainingHour,
    tm = trainingMinute,
  } = {}) {
    return {
      morningEnabled: me,
      morningHour: mh,
      morningMinute: mm,
      checkinEnabled: ce,
      checkinDay: cd,
      checkinHour: ch,
      checkinMinute: cmin,
      trainingEnabled: te,
      trainingHour: th,
      trainingMinute: tm,
      lastCheckinMs,
    };
  }

  // C14 job 3: ONE write path. setCategoryEnabled owns the authority (the
  // prefs blob), the legacy '@volyume_reminder_enabled_v1' mirror and the
  // per-category projection row, so a save can no longer land in two of
  // the three and leave them disagreeing. It merges over the existing
  // blob, so keys this screen does not own (missedCheckinEnabled from
  // Coaching reminders, coachReady) still survive a training save.
  async function persistTrainingPreference(nextPrefs) {
    try {
      const userId = useAppStore.getState().user?.id;
      const trainingTime =
        (nextPrefs.trainingHour ?? 8).toString().padStart(2, '0')
        + ':' + (nextPrefs.trainingMinute ?? 0).toString().padStart(2, '0');
      await setCategoryEnabled(userId, CATEGORY.TRAINING_REMINDER, !!nextPrefs.trainingEnabled, {
        timePref: trainingTime,
        extraBlob: nextPrefs,
      });
    } catch (_) {}
  }

  async function handleTrainingToggle(value) {
    if (value && permissionStatus !== 'granted') {
      appAlert(
        'Notifications disabled',
        'You\'ll need to enable notifications in your device settings first.',
      );
      return;
    }
    const nextPrefs = getPrefs({ te: value });
    setTrainingEnabled(value);
    try {
      // C14 job 3: the legacy key is written by persistTrainingPreference
      // now, alongside the authority and the projection, so this no longer
      // writes it separately and cannot half-apply the change.
      await persistTrainingPreference(nextPrefs);
      if (value) {
        await scheduleTrainingReminders();
      } else {
        await cancelTrainingReminders();
      }
    } catch (_) {}
  }

  // D142: same shape as the activation-nudge toggle below.
  async function handleReturnNudgeToggle(value) {
    setReturnNudgeEnabled(value);
    try {
      const userId = useAppStore.getState().user?.id;
      await setCategoryEnabled(userId, CATEGORY.RETURN_NUDGE, value);
      if (value) {
        await scheduleReturnNudge(userId ?? null, { force: true });
      } else {
        await cancelReturnNudge();
      }
    } catch (e) {
      // eslint-disable-next-line global-require
      try { require('../lib/errorLog').logError('NotificationSettings.returnNudgeToggle', e, { value }); } catch (_) {}
      setReturnNudgeEnabled(!value);
    }
  }

  async function handleActivationNudgeToggle(value) {
    setActivationNudgeEnabled(value);
    try {
      // C14 job 3: setCategoryEnabled merges over the existing blob, so
      // the other schedule keys survive the toggle without this screen
      // doing its own read-modify-write. The scheduler still reads
      // activationNudgeEnabled from that blob.
      const userId = useAppStore.getState().user?.id;
      await setCategoryEnabled(userId, CATEGORY.ACTIVATION_NUDGE, value);
      if (value) {
        await scheduleActivationNudge(userId ?? null);
      } else {
        await cancelActivationNudge();
      }
    } catch (_) {}
  }

  // SD-15: Community follows/activity have no local schedule to lay or
  // cancel -- the community-notify Edge Function sends them off a live
  // follow/reaction/comment/programme-use event and reads the projection
  // row at that moment. So there is no schedule/cancel call here, only
  // the one authority write plus an immediate projection push so an
  // opt-out takes effect before the next ordinary sync.
  async function handleCommunityFollowToggle(value) {
    setCommunityFollowEnabled(value);
    try {
      const userId = useAppStore.getState().user?.id;
      await setCategoryEnabled(userId, CATEGORY.COMMUNITY_FOLLOW, value);
      await pushCategoryPrefsNow(userId);
      toast.show(value ? 'Community follows on' : 'Community follows off', { variant: 'success' });
    } catch (_) {
      toast.show('Could not save that change', { variant: 'error' });
    }
  }

  async function handleCommunityActivityToggle(value) {
    setCommunityActivityEnabled(value);
    try {
      const userId = useAppStore.getState().user?.id;
      await setCategoryEnabled(userId, CATEGORY.COMMUNITY_ACTIVITY, value);
      await pushCategoryPrefsNow(userId);
      toast.show(value ? 'Community activity on' : 'Community activity off', { variant: 'success' });
    } catch (_) {
      toast.show('Could not save that change', { variant: 'error' });
    }
  }

  function handleTrainingTimePick() {
    const currentLabel = `${String(trainingHour).padStart(2, '0')}:${String(trainingMinute).padStart(2, '0')}`;
    appAlert(
      'Reminder time',
      `Current: ${currentLabel}`,
      TRAINING_PRESET_TIMES.map((label) => ({
        text: label,
        onPress: async () => {
          const [h, m] = label.split(':').map(Number);
          const nextPrefs = getPrefs({ th: h, tm: m });
          setTrainingHour(h);
          setTrainingMinute(m);
          try {
            await AsyncStorage.setItem(REMINDER_TIME_KEY, JSON.stringify({ hour: h, minute: m }));
            await persistTrainingPreference(nextPrefs);
            if (trainingEnabled) {
              await scheduleTrainingReminders();
            }
          } catch (_) {}
        },
      })),
    );
  }

  // Load saved meal reminders on mount (default OFF).
  useEffect(() => {
    AsyncStorage.getItem(MEAL_REMINDERS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setMealReminders(parsed);
      } catch (_) { /* keep defaults */ }
    }).catch(() => {});
  }, []);

  // Quiet hours (E2.2).
  const [quietHours, setQuietHoursState] = useState(DEFAULT_QUIET_HOURS);
  useEffect(() => {
    getQuietHours().then(setQuietHoursState).catch(() => {});
  }, []);

  // Persist the window, then re-lay everything already scheduled so existing
  // reminders are recomputed against the NEW window rather than the one they
  // were laid under. restoreNotifications covers the scheduler-owned prompts
  // (tier-gated inside, E10-F4); training and meal reminders re-lay through
  // their own helpers. All best-effort: the saved window itself governs every
  // future schedule regardless.
  async function persistQuietHours(patch) {
    const next = { ...quietHours, ...patch };
    setQuietHoursState(next);
    try { await setQuietHours(next); } catch (_) { return; }
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) {
        const userId = useAppStore.getState().user?.id ?? null;
        await restoreNotifications(JSON.parse(raw), userId);
      }
      if (trainingEnabled) await scheduleTrainingReminders();
      if (mealReminders.some((r) => r.enabled)) await scheduleMealReminders(mealReminders);
    } catch (_) { /* window applies to all future schedules regardless */ }
  }

  function pickQuietTime(edge) {
    const isStart = edge === 'start';
    const h = isStart ? quietHours.startHour : quietHours.endHour;
    const m = isStart ? quietHours.startMinute : quietHours.endMinute;
    const currentLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    appAlert(
      isStart ? 'Quiet hours start' : 'Quiet hours end',
      `Current: ${currentLabel}`,
      (isStart ? QUIET_START_PRESETS : QUIET_END_PRESETS).map((label) => ({
        text: label,
        onPress: () => {
          const [nh, nm] = label.split(':').map(Number);
          persistQuietHours(isStart
            ? { startHour: nh, startMinute: nm }
            : { endHour: nh, endMinute: nm });
        },
      })),
    );
  }

  async function persistMealReminders(next) {
    setMealReminders(next);
    try { await AsyncStorage.setItem(MEAL_REMINDERS_KEY, JSON.stringify(next)); } catch (_) {}
    if (permissionStatus === 'granted') {
      try { await scheduleMealReminders(next); } catch (_) {}
    }
  }

  function toggleMealReminder(id, value) {
    const next = mealReminders.map((r) => (r.id === id ? { ...r, enabled: value } : r));
    if (value && permissionStatus !== 'granted') {
      requestNotificationPermissions().then((status) => {
        setPermissionStatus(status);
        persistMealReminders(next);
      }).catch(() => persistMealReminders(next));
      return;
    }
    persistMealReminders(next);
  }

  function pickMealReminderTime(id) {
    const r = mealReminders.find((x) => x.id === id);
    const currentLabel = r ? `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}` : '';
    appAlert('Reminder time', `Current: ${currentLabel}`, MEAL_PRESET_TIMES.map((label) => ({
      text: label,
      onPress: () => {
        const [h, m] = label.split(':').map(Number);
        persistMealReminders(mealReminders.map((x) => (x.id === id ? { ...x, hour: h, minute: m } : x)));
      },
    })));
  }

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <BackHeader title="Notifications" />
      <View style={styles.subtitleWrap}>
        <Text style={[styles.subtitle, live.subtitle]}>
          Volyume uses local notifications only, never marketing.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission banner. F8 (discoverability audit 2026-08-10): "enable
            them in your device settings" had no way to get there. Mirrors the
            camera-flow pattern already shipped (ScanBarcodeScreen.js,
            ScanLabelScreen.js) -- Linking.openSettings() as an explicit
            tap-through, not just an instruction. */}
        {permissionStatus === 'denied' && (
          <View style={[styles.permissionBanner, live.permissionBanner]}>
            <View style={styles.bannerRow}>
              <Ionicons name="alert-circle-outline" size={20} color={t.colors.warning} style={styles.bannerIcon} />
              <Text style={[styles.bannerText, live.bannerText]}>
                Notifications are currently disabled. Enable them in your device settings to use these features.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              style={styles.bannerAction}
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
            >
              <Text style={[styles.bannerActionText, live.bannerActionText]}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Morning weight + weekly check-in reminders moved to a dedicated
            screen (Settings > Coaching reminders). The toggles here
            were misleading. Those reminders are non-optional inputs to
            the Coach, so flipping them off broke the coaching
            loop. CoachingRemindersScreen exposes the day + hour pickers
            without toggles; both reminders are always scheduled. This
            screen now only handles training reminders. */}
        <TouchableOpacity
          style={[styles.crossLink, live.crossLink]}
          onPress={() => navigation.navigate('CoachingReminders')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Coaching reminders"
        >
          <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
            <Ionicons name="pulse-outline" size={18} color={t.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.crossLinkTitle, live.crossLinkTitle]}>Coaching reminders</Text>
            <Text style={[styles.crossLinkSub, live.crossLinkSub]}>
              Weigh-in and check-in times, check-in follow-ups and meal-plan reminders.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>


        {/* Section 3, Training reminders */}
        <SectionLabel style={styles.sectionLabel}>Training reminders</SectionLabel>
        <Card style={styles.card}>
          {/* Toggle row */}
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
              <Ionicons name="barbell-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.toggleLabel, live.toggleLabel]}>Remind me to train</Text>
            <Switch
              value={trainingEnabled}
              onValueChange={handleTrainingToggle}
              trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface2}
              accessibilityLabel="Training reminder toggle"
            />
          </View>

          {/* Time picker row */}
          {trainingEnabled && (
            <View style={styles.expandedSection}>
              <View style={[styles.divider, live.divider]} />
              <TouchableOpacity
                style={styles.timePickerRow}
                onPress={handleTrainingTimePick}
                accessibilityRole="button"
                accessibilityLabel="Set reminder time"
              >
                <Text style={[styles.timePickerLabel, live.timePickerLabel]}>Reminder time</Text>
                <Text style={[styles.timePickerValue, live.timePickerValue]}>
                  {`${String(trainingHour).padStart(2, '0')}:${String(trainingMinute).padStart(2, '0')}`}
                </Text>
                <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Helper text. FM-02 / C5-P18-05 (D96): the schedule is derived
              from at least two FULL weeks of logged sessions
              (trainingHabitSchedule.MIN_HISTORY_WEEKS), so a week-1 user could
              switch this on, pick a time, see a persistent "Reminder time"
              row and receive nothing for a fortnight with nothing on screen
              saying why. The warm-up is stated, in the same shape as the
              denied-permission line the meal reminders already carry. No
              behaviour change and no new state: the honest "nothing is
              scheduled yet" signal is the absence of a derived schedule. */}
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              Pick the time. Volyume learns the days you usually train from your recent workouts, and reminds you then.
              {trainingScheduleReady === false ? ' It needs a couple of weeks of logged sessions before it can tell which days those are, so these start once it can.' : ''}
            </Text>
          </View>
        </Card>

        {/* S6: the early-activation nudge (tier-blind). Its own one-tap disable. */}
        <SectionLabel style={styles.sectionLabel}>Getting started</SectionLabel>
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
              <Ionicons name="rocket-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.toggleLabel, live.toggleLabel]}>Getting-started nudges</Text>
            <Switch
              value={activationNudgeEnabled}
              onValueChange={handleActivationNudgeToggle}
              trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface2}
              accessibilityLabel="Getting-started nudge toggle"
            />
          </View>
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              A gentle reminder in your first couple of weeks if you have not logged a session yet. It stops on its own once you are into a routine.
            </Text>
          </View>
          {/* D142: the return nudge. One calm note after three weeks without
              opening the app; never repeated, never under calm mode or an
              open wellbeing flag. */}
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
              <Ionicons name="leaf-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.toggleLabel, live.toggleLabel]}>Welcome-back note</Text>
            <Switch
              value={returnNudgeEnabled}
              onValueChange={handleReturnNudgeToggle}
              trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface2}
              accessibilityLabel="Welcome-back note toggle"
            />
          </View>
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              One calm note if three weeks pass without you opening Volyume, so you know your plan is still here. Never more than one.
            </Text>
          </View>
        </Card>

        {/* SD-15: Community's two notification categories, blob-backed,
            default on -- same row/toggle components and persistence calls
            as the sections above. */}
        <SectionLabel style={styles.sectionLabel}>Community</SectionLabel>
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
              <Ionicons name="people-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.toggleLabel, live.toggleLabel]}>New followers</Text>
            <Switch
              value={communityFollowEnabled}
              onValueChange={handleCommunityFollowToggle}
              trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface2}
              accessibilityLabel="New followers toggle"
            />
          </View>
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              Follow requests and new followers.
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
              <Ionicons name="chatbubble-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.toggleLabel, live.toggleLabel]}>Reactions and comments</Text>
            <Switch
              value={communityActivityEnabled}
              onValueChange={handleCommunityActivityToggle}
              trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface2}
              accessibilityLabel="Reactions and comments toggle"
            />
          </View>
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              When someone reacts to or comments on your posts, or uses your programme.
            </Text>
          </View>
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              These arrive when something happens, and never while a wellbeing check is open.
            </Text>
          </View>
        </Card>

        {/* Meal-log reminders (opt-in, gap #4): convenience-only, never a
            streak. Volyume is fully free (founder ruling), so this is
            available to everyone; the diary it points at carries no tier
            gate either. */}
        <SectionLabel style={styles.sectionLabel}>Meal reminders</SectionLabel>
        <Card style={styles.card}>
          {mealReminders.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <View style={[styles.divider, live.divider]} /> : null}
              <View style={styles.toggleRow}>
                <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
                  <Ionicons name="restaurant-outline" size={18} color={t.colors.primary} />
                </View>
                <Text style={[styles.toggleLabel, live.toggleLabel]}>{r.label}</Text>
                <Switch
                  value={r.enabled}
                  onValueChange={(v) => toggleMealReminder(r.id, v)}
                  trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
                  thumbColor={t.colors.primary}
                  ios_backgroundColor={t.colors.surface2}
                  accessibilityLabel={`${r.label} reminder toggle`}
                />
              </View>
              {r.enabled && (
                <TouchableOpacity
                  style={styles.timePickerRow}
                  onPress={() => pickMealReminderTime(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${r.label} reminder time`}
                >
                  <Text style={[styles.timePickerLabel, live.timePickerLabel]}>Reminder time</Text>
                  <Text style={[styles.timePickerValue, live.timePickerValue]}>
                    {`${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`}
                  </Text>
                  <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              Optional reminders to log meals. No streaks and no pressure. Turn any of them off whenever you like.
              {/* F9 (discoverability audit 2026-08-10): toggleMealReminder
                  persists a switch as on even when permission is denied, but
                  never actually schedules anything -- so the switch looked
                  live with no explanation nearby. One honest line, no
                  behaviour change. */}
              {permissionStatus === 'denied' ? ' Notifications are disabled in your device settings, so a reminder switched on here will not fire yet.' : ''}
            </Text>
          </View>
        </Card>

        {/* Quiet hours (E2.2): the window every reminder respects. */}
        <SectionLabel style={styles.sectionLabel}>Quiet hours</SectionLabel>
        <Card style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIconWrap, live.toggleIconWrap]}>
              <Ionicons name="moon-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.toggleLabel, live.toggleLabel]}>Quiet hours</Text>
            <Switch
              value={quietHours.enabled !== false}
              onValueChange={(v) => persistQuietHours({ enabled: v })}
              trackColor={{ false: t.colors.surface3, true: withAlpha(t.colors.primary, alpha.half) }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface2}
              accessibilityLabel="Quiet hours toggle"
            />
          </View>
          {quietHours.enabled !== false && (
            <>
              <TouchableOpacity
                style={styles.timePickerRow}
                onPress={() => pickQuietTime('start')}
                accessibilityRole="button"
                accessibilityLabel="Set quiet hours start time"
              >
                <Text style={[styles.timePickerLabel, live.timePickerLabel]}>Starts</Text>
                <Text style={[styles.timePickerValue, live.timePickerValue]}>
                  {`${String(quietHours.startHour).padStart(2, '0')}:${String(quietHours.startMinute).padStart(2, '0')}`}
                </Text>
                <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timePickerRow}
                onPress={() => pickQuietTime('end')}
                accessibilityRole="button"
                accessibilityLabel="Set quiet hours end time"
              >
                <Text style={[styles.timePickerLabel, live.timePickerLabel]}>Ends</Text>
                <Text style={[styles.timePickerValue, live.timePickerValue]}>
                  {`${String(quietHours.endHour).padStart(2, '0')}:${String(quietHours.endMinute).padStart(2, '0')}`}
                </Text>
                <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
              </TouchableOpacity>
            </>
          )}
          <View style={[styles.helperRow, live.helperRow]}>
            <Text style={[styles.helperText, live.helperText]}>
              A reminder that would land inside this window waits until it ends. Applies to every reminder Volyume schedules.{permissionStatus === 'denied' ? ' Notifications are disabled in your device settings, so nothing will fire until they are enabled.' : ''}
            </Text>
          </View>
        </Card>

        {/* Bottom note */}
        <View style={styles.bottomNote}>
          <Text style={[styles.bottomNoteText, live.bottomNoteText]}>
            {`Volyume never sends marketing notifications. These are local reminders with no server involved. You can disable them any time from your device settings. To stay unobtrusive, Volyume also caps how many nudges it sends in a week, so an expected one can occasionally be skipped.${Platform.OS === 'android' ? ' Your device groups these into notification channels you can tune in system settings.' : ''}`}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  subtitleWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textSecondary,
  },

  // Scroll content
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },

  // Permission banner
  permissionBanner: {
    backgroundColor: withAlpha(colors.warning, alpha.tint),
    borderWidth: 1,
    borderColor: withAlpha(colors.warning, 0.35),
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  bannerIcon: {
    marginTop: spacing.hair,
    flexShrink: 0,
  },
  bannerText: {
    ...type.bodySm,
    flex: 1,
    color: colors.warning,
  },
  bannerAction: {
    alignSelf: 'flex-start',
  },
  bannerActionText: {
    ...type.bodySm,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
    textDecorationLine: 'underline',
  },

  // Section label
  sectionLabel: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  // Card: the shared Card supplies surface, radius.lg and the 1px border.
  // This card's rows own their own padding, so cancel Card's default padding
  // and keep overflow hidden (the divider + rounded corners depend on it).
  card: {
    overflow: 'hidden',
    padding: 0,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  toggleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },

  // Expanded section
  expandedSection: {
    paddingBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },

  // Helper text
  helperRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.xs,
  },
  helperText: {
    ...type.bodySm,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  // Time picker row (training reminders)
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  timePickerLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
  },
  timePickerValue: {
    ...type.num('bodyStrong'),
    color: colors.primary,
  },

  // Bottom note
  bottomNote: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  bottomNoteText: {
    ...type.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
  },

  crossLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  crossLinkTitle: {
    ...type.bodyStrong,
    color: colors.textPrimary,
  },
  crossLinkSub: {
    ...type.captionTight,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
});

// CP-10 batch G lane 1 (2026-07-11): the frozen `styles` block above stays
// byte-identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/padding/gap/margin/borderRadius/borderWidth, no token) and
// fontWeight (not part of useTheme()'s shape) are correctly omitted. No
// notification-scheduling logic touched -- colours only.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    subtitle: { ...t.type.bodySm, color: t.colors.textSecondary },
    permissionBanner: { backgroundColor: withAlpha(t.colors.warning, alpha.tint), borderColor: withAlpha(t.colors.warning, 0.35) },
    bannerText: { ...t.type.bodySm, color: t.colors.warning },
    bannerActionText: { ...t.type.bodySm, fontWeight: fontWeight.semibold, color: t.colors.warning },
    toggleIconWrap: { backgroundColor: t.colors.primaryBg },
    toggleLabel: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
    divider: { backgroundColor: t.colors.border },
    helperRow: { borderTopColor: t.colors.borderSubtle },
    helperText: { ...t.type.bodySm, color: t.colors.textMuted },
    timePickerLabel: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
    timePickerValue: { ...t.type.num('bodyStrong'), color: t.colors.primary },
    bottomNoteText: { ...t.type.bodySm, color: t.colors.textMuted },
    crossLink: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    crossLinkTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    crossLinkSub: { ...t.type.captionTight, color: t.colors.textMuted },
  };
}
