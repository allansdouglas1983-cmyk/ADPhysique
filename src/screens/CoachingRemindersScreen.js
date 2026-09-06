// Pro coaching reminders, morning weight + weekly check-in.
//
// These reminders feed the Precision Coaching loop, but they are the
// NUDGE, not the input: turning a reminder off does not stop the user
// logging a weight or filling in a check-in, it only stops the
// notification. C14 job 4 (reconciled Campaign 24, WAVE-F-FINDINGS.md
// STALE_DOC finding, CoachingRemindersScreen.js:1-13) restored a genuine
// on/off switch for both reminders after finding the earlier "always on,
// no toggle" design confused the coaching input with the reminder prompt
// -- Volyume must not send a recurring optional notification a user has
// no way to stop.
//
// This screen exposes day + hour pickers AND a real on/off switch per
// reminder (`morningEnabled`/`checkinEnabled`, default on so nothing
// changes for an existing user who never touches the switch). Lives in
// Settings > Coaching reminders (Pro-only row).

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, fontWeight, spacing, radius, type, fontFamily, iconSize } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import {
  scheduleMorningWeightNotification,
  scheduleEveningWeightReminder,
  scheduleCheckinReminder,
  scheduleMissedCheckinFollowups,
  cancelMissedCheckinFollowups,
  schedulePlannedMealConfirm,
  cancelPlannedMealConfirm,
  cancelMorningNotification,
  cancelCheckinNotification,
  cancelEveningWeightReminder,
  requestNotificationPermissions,
} from '../lib/notifications';
import Card from '../components/Card';
import BackHeader from '../components/BackHeader';
import SectionLabel from '../components/SectionLabel';
import Chip from '../components/Chip';
import { setPreference as setPrefRow } from '../lib/notifications/preferences';
import { setCategoryEnabled } from '../lib/notifications/categoryPrefs';
import { CATEGORY } from '../lib/notifications/categories';
import { getQuietHours, shiftHourMinuteOutOfQuietHours } from '../lib/notifications/quietHours';
import useAppStore from '../store/useAppStore';
import { useToast } from '../components/Toast';
import { computeNextCheckinFireDate } from '../lib/notifications/nextCheckinDate';

const NOTIF_PREFS_KEY = '@volyume_notification_prefs';

const HOURS_MORNING = [5, 6, 7, 8, 9, 10, 11, 12];
const HOURS_EVENING = [14, 15, 16, 17, 18, 19, 20, 21];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatDayHour(dayIndex, hour) {
  return `${DAYS[dayIndex]} at ${formatHour(hour)}`;
}

function formatNextFire(date) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${dayNames[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} at ${formatHour(h)}${m === '00' ? '' : ':' + m}`;
}

async function applyScheduled(prefs, permissionStatus, { userInitiated = false } = {}) {
  // Cancels and re-lays each coaching reminder ACCORDING TO THE USER'S
  // CHOICE. C14 job 4: both were previously forced on with no way off,
  // on the reasoning that the coach needs the inputs. That confused the
  // input with the prompt. Turning the reminder off does not stop the
  // user logging a weight or filling in a check-in, and Volyume must not
  // send a recurring optional notification a user has no way to stop.
  // The data the coach needs is unchanged; only the nudge is optional.
  //
  // Training reminders are independent and managed by NotificationSettings.
  //
  // Cancel ONLY the two notifications this screen owns (morning weight +
  // weekly check-in). Previously this called cancelAllNotifications(), which
  // wiped every scheduled notification laid elsewhere (cascade gates, trial
  // day-3, win-back, weekly coach-ready) until the next launch re-laid them,
  // the historic wipe-bug class NotificationSettingsScreen already fixed.
  // Each schedule* helper self-cancels its own ID too, so the explicit
  // cancels here only matter for the permission-not-granted case.
  const morningOn = prefs.morningEnabled !== false;
  const checkinOn = prefs.checkinEnabled !== false;
  await cancelMorningNotification();
  await cancelCheckinNotification();
  if (permissionStatus === 'granted') {
    if (morningOn) {
      // C14 lead ruling (D33): switching the reminder ON here is an
      // explicit, present-tense request, so it is honoured immediately
      // rather than held by the three-week inactivity stand-down. Every
      // other gate (ED flag, tier, quiet hours, permission) still applies.
      await scheduleMorningWeightNotification(
        prefs.morningHour, prefs.morningMinute, { userInitiated },
      );
      // Q1: evening weigh-in backstop rides the same toggle (self-gates on ED flag).
      await scheduleEveningWeightReminder(prefs.eveningHour ?? 19, prefs.eveningMinute ?? 30, { userInitiated });
    } else {
      // The backstop rides the same switch, as the screen copy says it does.
      await cancelEveningWeightReminder();
    }
    if (checkinOn) {
      await scheduleCheckinReminder(
        prefs.checkinDay, prefs.checkinHour, prefs.checkinMinute,
        { lastCheckinMs: prefs.lastCheckinMs ?? 0, minGapDays: 7 },
      );
    }
  }
  // Merge over the existing blob so keys this screen doesn't own
  // (missedCheckinEnabled, coachReady, training) survive a save here.
  let existing = {};
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    if (raw) existing = JSON.parse(raw) ?? {};
  } catch (_) {}
  // eslint-disable-next-line global-require
  try { require('../lib/sync').notePrefWrite(NOTIF_PREFS_KEY); } catch (_) {} // C6 S-2 (D97-23)
  await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({
    ...existing,
    ...prefs,
    morningEnabled: morningOn,
    checkinEnabled: checkinOn,
  }));
  // Mirror into the per-category SQLite rows so the registry-driven sync
  // push (src/lib/sync/tables/notificationPreferences.js) has a fresh
  // row to ship to the cloud notification_preferences table (migration
  // 044). This is the LIVE and only writer for morning_weight /
  // weekly_checkin_reminder. NotificationSettingsScreen.applyNotifications
  // used to do this mirroring, but it was unreachable and left the cloud rows
  // frozen at whatever migrateFromLegacyBlob first back-filled; the mirror
  // moved here under D94-1 and the dead path was deleted under D95. Same
  // shape that path wrote.
  try {
    const userId = useAppStore.getState().user?.id;
    if (userId) {
      const morningTime =
        (prefs.morningHour ?? 8).toString().padStart(2, '0')
        + ':' + (prefs.morningMinute ?? 0).toString().padStart(2, '0');
      const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][prefs.checkinDay ?? 0];
      const checkinTime =
        (prefs.checkinHour ?? 18).toString().padStart(2, '0')
        + ':' + (prefs.checkinMinute ?? 0).toString().padStart(2, '0');
      await setPrefRow(userId, 'morning_weight', { enabled: morningOn, time_pref: morningTime });
      await setPrefRow(userId, 'weekly_checkin_reminder', {
        enabled: checkinOn,
        time_pref: `${dow}_${checkinTime}`,
      });
    }
  } catch (_) { /* tolerate; AsyncStorage write already succeeded */ }
  // OPP-C03: the check-in day/time may have changed, so re-lay the
  // missed-check-in follow-up pair against the freshly saved schedule
  // (the helper self-cancels its own pair and self-guards on tier,
  // toggle and ED flag).
  if (permissionStatus === 'granted') {
    try {
      await scheduleMissedCheckinFollowups(useAppStore.getState().user?.id ?? null);
    } catch (_) {}
  }
}

function ChipRow({ items, selected, onSelect, formatter = (v) => String(v), accessibilityName = 'option' }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {items.map(item => {
        const value = typeof item === 'object' ? item.value : item;
        const label = typeof item === 'object' ? item.label : formatter(item);
        const isSelected = value === selected;
        return (
          <Chip
            key={value}
            label={label}
            selected={isSelected}
            onPress={() => onSelect(value)}
            accessibilityRole="radio"
            accessibilityLabel={`${accessibilityName} ${label}`}
            style={styles.chip}
          />
        );
      })}
    </ScrollView>
  );
}

export default function CoachingRemindersScreen({ navigation }) {
  const toast = useToast();
  // CP-10 batch G lane 1 (2026-07-11): live theme (src/hooks/useTheme.js).
  // Memoised: this screen renders mapped ChipRow options.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  // C14 job 4: both coaching reminders are optional now. Default ON, so
  // nothing changes for an existing user who never touches the switch.
  const [morningEnabled, setMorningEnabled] = useState(true);
  const [checkinEnabled, setCheckinEnabled] = useState(true);
  const [morningHour, setMorningHour] = useState(7);
  const [morningMinute, setMorningMinute] = useState(0);
  // PM-05 (D96): Sunday, matching the eight other readers of this preference
  // (WeeklyCheckInScreen's gate, scheduler.js, coachLedger, HomeScreen,
  // YouScreen). This screen alone defaulted to Monday, so a user whose prefs
  // blob has no checkinDay was told two different check-in days by two
  // screens, and touching any control here silently moved their check-in day
  // to Monday.
  const [checkinDay, setCheckinDay] = useState(0); // Sun
  const [checkinHour, setCheckinHour] = useState(18);
  const [checkinMinute, setCheckinMinute] = useState(0);
  const [lastCheckinMs, setLastCheckinMs] = useState(0);
  // OPP-C03: the missed-check-in follow-up pair. Optional (default on),
  // unlike the two coaching reminders above.
  const [missedEnabled, setMissedEnabled] = useState(true);
  const [plannedConfirmEnabled, setPlannedConfirmEnabled] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState(null);
  // C5-P28-01 (D96): quiet hours (default 22:00 -> 07:00) silently shift a 5 AM
  // or 6 AM weigh-in reminder to 07:00 at schedule time, while this screen kept
  // rendering "Notification at 5 AM". The rule is locked and unchanged; what
  // changes is that the screen states the time the reminder actually arrives.
  const [quietHours, setQuietHoursState] = useState(null);
  const [saved, setSaved] = useState(false);
  const debounceTimer = useRef(null);
  const savedTimer = useRef(null);

  useEffect(() => {
    async function init() {
      try {
        const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
        if (raw) {
          const prefs = JSON.parse(raw);
          if (prefs.morningHour !== undefined) setMorningHour(prefs.morningHour);
          if (prefs.morningMinute !== undefined) setMorningMinute(prefs.morningMinute);
          if (prefs.checkinDay !== undefined) setCheckinDay(prefs.checkinDay);
          if (prefs.checkinHour !== undefined) setCheckinHour(prefs.checkinHour);
          if (prefs.checkinMinute !== undefined) setCheckinMinute(prefs.checkinMinute);
          if (prefs.missedCheckinEnabled !== undefined) {
            setMissedEnabled(prefs.missedCheckinEnabled !== false);
          }
          if (prefs.plannedMealConfirmEnabled !== undefined) {
            setPlannedConfirmEnabled(prefs.plannedMealConfirmEnabled !== false);
          }
          if (prefs.morningEnabled !== undefined) {
            setMorningEnabled(prefs.morningEnabled !== false);
          }
          if (prefs.checkinEnabled !== undefined) {
            setCheckinEnabled(prefs.checkinEnabled !== false);
          }
        }
      } catch (_) {}

      try {
        const { getLatestCheckin } = require('../lib/database');
        const userId = useAppStore.getState().user?.id;
        if (userId) {
          const latest = await getLatestCheckin(userId);
          if (latest?.weekStart) setLastCheckinMs(latest.weekStart);
        }
      } catch (_) {}

      // C5-P27-01 (D96) considered and deliberately NOT changed here: the
      // ruling covers Settings > Notifications, which prompts a user who
      // arrived only to look. This screen is reached by choosing "Coaching
      // reminders", so the intent is present, and it is the ONLY place a Pro
      // user with an undetermined status can grant permission for the two
      // reminders it owns. Removing the prompt would leave them no way in.
      try {
        const q = await getQuietHours();
        setQuietHoursState(q);
      } catch (_) { /* the effective-time note simply does not render */ }

      try {
        const status = await requestNotificationPermissions();
        setPermissionStatus(status);
      } catch (_) {
        setPermissionStatus('denied');
      }
    }
    init();
  }, []);

  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  function scheduleApply(next, { userInitiated = false } = {}) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await applyScheduled({
          morningEnabled: next.morningEnabled ?? morningEnabled,
          checkinEnabled: next.checkinEnabled ?? checkinEnabled,
          morningHour: next.morningHour ?? morningHour,
          morningMinute: next.morningMinute ?? morningMinute,
          checkinDay: next.checkinDay ?? checkinDay,
          checkinHour: next.checkinHour ?? checkinHour,
          checkinMinute: next.checkinMinute ?? checkinMinute,
          lastCheckinMs,
        }, permissionStatus, { userInitiated });
        // Existing inline "Saved" indicator stays for users who prefer
        // explicit on-screen confirmation; toast is the modern overlay
        // for users scrolling away from the section.
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 2000);
        toast.show('Reminder schedule saved', { variant: 'success' });
      } catch (_e) {
        toast.show('Could not save reminder', { variant: 'error' });
      }
    }, 400);
  }

  // C14 job 4: the real off switches. They go through the same debounced
  // apply as the time pickers, so the schedule and the stored choice can
  // never disagree, and applyScheduled cancels what it must.
  function handleMorningToggle(value) {
    setMorningEnabled(value);
    // Switching it ON is an explicit request, so it is not held back by the
    // three-week inactivity stand-down (C14 lead ruling under D33).
    scheduleApply({ morningEnabled: value }, { userInitiated: value });
  }

  function handleCheckinToggle(value) {
    setCheckinEnabled(value);
    scheduleApply({ checkinEnabled: value });
  }

  async function handleMissedToggle(value) {
    setMissedEnabled(value);
    try {
      // C14 job 3: ONE write path. setCategoryEnabled merges over the
      // existing blob (so the schedule keys applyScheduled saved survive)
      // and writes the per-category projection row in the same call, so a
      // toggle can no longer land in one and not the other.
      const userId = useAppStore.getState().user?.id;
      await setCategoryEnabled(userId, CATEGORY.CHECKIN_MISSED, value);
      if (value) {
        await scheduleMissedCheckinFollowups(userId ?? null);
      } else {
        await cancelMissedCheckinFollowups();
      }
      toast.show(value ? 'Check-in follow-up on' : 'Check-in follow-up off', { variant: 'success' });
    } catch (_) {
      toast.show('Could not save that change', { variant: 'error' });
    }
  }

  async function handlePlannedConfirmToggle(value) {
    setPlannedConfirmEnabled(value);
    try {
      const userId = useAppStore.getState().user?.id;
      await setCategoryEnabled(userId, CATEGORY.PLANNED_MEAL_CONFIRM, value);
      if (value) {
        await schedulePlannedMealConfirm(userId ?? null);
      } else {
        await cancelPlannedMealConfirm();
      }
      toast.show(value ? 'Meal-plan reminder on' : 'Meal-plan reminder off', { variant: 'success' });
    } catch (_) {
      toast.show('Could not save that change', { variant: 'error' });
    }
  }

  const morningShift = quietHours
    ? shiftHourMinuteOutOfQuietHours(morningHour, morningMinute, quietHours)
    : { shifted: false };
  const nextFire = computeNextCheckinFireDate(checkinDay, checkinHour, checkinMinute, lastCheckinMs, 7);
  const lastFire = lastCheckinMs > 0 ? new Date(lastCheckinMs) : null;
  const gapDays = lastFire ? Math.round((nextFire.getTime() - lastFire.getTime()) / (24 * 60 * 60 * 1000)) : 0;
  const bumped = lastCheckinMs > 0 && gapDays > 7;

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <BackHeader title="Coaching reminders" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, live.intro]}>
          These reminders keep the weekly coaching loop accurate. Pick times that fit your normal routine.
        </Text>

        {/* C5-P27-04 (D96): the Campaign 3 Open Settings pattern. This banner
            stated the instruction with no way to get there, one tap from the
            NotificationSettings banner that does carry the control. */}
        {permissionStatus === 'denied' && (
          <View style={[styles.warningBox, live.warningBox]}>
            <View style={styles.warningRow}>
              <Ionicons name="warning" size={18} color={t.colors.warning} />
              <Text style={[styles.warningText, live.warningText]}>
                Notifications are disabled at the system level. Enable them in your device settings for these reminders to fire.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              style={styles.warningAction}
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
            >
              <Text style={[styles.warningActionText, live.warningActionText]}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Item 9(b) (D141): the reciprocal of NotificationSettingsScreen's
            own cross-link row (that screen already links forward to this
            one). Same visual component/pattern, styles copied verbatim from
            NotificationSettingsScreen's crossLink/crossLinkTitle/crossLinkSub
            rather than invented. Training reminders are independent and
            managed by NotificationSettings (see the comment on that screen's
            own cross-link), so it is genuinely the other half of the
            reminder settings, not owned here. */}
        <TouchableOpacity
          style={[styles.crossLink, live.crossLink]}
          onPress={() => navigation.navigate('NotificationSettings')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Notifications and reminders"
        >
          <View style={[styles.iconWrap, live.iconWrap]}>
            <Ionicons name="notifications-outline" size={18} color={t.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.crossLinkTitle, live.crossLinkTitle]}>Notifications and reminders</Text>
            <Text style={[styles.crossLinkSub, live.crossLinkSub]}>
              Training reminder, meal reminders and quiet hours.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>

        {/* Morning weight */}
        <SectionLabel style={styles.sectionLabelSpacing}>Morning weight</SectionLabel>
        <Card style={[styles.card, live.card]} padding="md">
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, live.iconWrap]}>
              <Ionicons name="scale-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.cardTitle, styles.toggleTitle]}>Morning weight reminder</Text>
            <Switch
              value={morningEnabled}
              onValueChange={handleMorningToggle}
              trackColor={{ false: t.colors.surface3, true: t.colors.primaryBg }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface3}
              accessibilityLabel="Morning weight reminder toggle"
            />
          </View>
          {morningEnabled && (
            <>
              <Text style={[styles.pickerLabel, live.pickerLabel]}>Hour</Text>
              <ChipRow
                items={HOURS_MORNING}
                selected={morningHour}
                onSelect={(h) => { setMorningHour(h); scheduleApply({ morningHour: h }); }}
                formatter={formatHour}
                accessibilityName="Morning weight hour"
              />
              <Text style={[styles.scheduleText, live.scheduleText]}>
                {morningShift.shifted
                  ? `Notification at ${formatHour(morningShift.hour)}`
                  : `Notification at ${formatHour(morningHour)}`}
              </Text>
              {morningShift.shifted ? (
                <Text style={[styles.scheduleSubText, live.scheduleSubText]}>
                  Quiet hours currently run to {formatHour(morningShift.hour)}, so a {formatHour(morningHour)} reminder waits until then. You can change quiet hours in Settings, Notifications.
                </Text>
              ) : null}
            </>
          )}
          <View style={[styles.helperBlock, live.helperBlock]}>
            <Text style={[styles.helperText, live.helperText]}>
              Body weight shifts naturally each day with fluid, food, and hormones. Logging every other day at minimum gives Volyume enough readings to see the trend. Three or more readings per week opens up the weekly check-in.
            </Text>
            {/* C5-P28-03 (D96): the 19:30 backstop rides this same reminder
                and was named on no screen the user could reach. Disclosure
                only; what is scheduled, and its ED gates, are unchanged. */}
            <Text style={[styles.helperText, live.helperText]}>
              If the morning gets away from you, a quiet backstop at 7.30 pm offers one more chance that day. It goes quiet as soon as the weight is logged, and it turns off with this reminder.
            </Text>
          </View>
        </Card>

        {/* Weekly check-in */}
        <SectionLabel style={styles.sectionLabelSpacing}>Weekly check-in</SectionLabel>
        <Card style={[styles.card, live.card]} padding="md">
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, live.iconWrap]}>
              <Ionicons name="pulse-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.cardTitle, styles.toggleTitle]}>Weekly check-in reminder</Text>
            <Switch
              value={checkinEnabled}
              onValueChange={handleCheckinToggle}
              trackColor={{ false: t.colors.surface3, true: t.colors.primaryBg }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface3}
              accessibilityLabel="Weekly check-in reminder toggle"
            />
          </View>
          {checkinEnabled && (
            <>
              <Text style={[styles.pickerLabel, live.pickerLabel]}>Day</Text>
              <ChipRow
                items={DAYS.map((d, i) => ({ value: i, label: d }))}
                selected={checkinDay}
                onSelect={(d) => { setCheckinDay(d); scheduleApply({ checkinDay: d }); }}
                accessibilityName="Check-in day"
              />
              <Text style={[styles.pickerLabel, live.pickerLabel]}>Hour</Text>
              <ChipRow
                items={HOURS_EVENING}
                selected={checkinHour}
                onSelect={(h) => { setCheckinHour(h); scheduleApply({ checkinHour: h }); }}
                formatter={formatHour}
                accessibilityName="Check-in hour"
              />
              <Text style={[styles.scheduleText, live.scheduleText]}>Reminder every {formatDayHour(checkinDay, checkinHour)}</Text>
              {lastCheckinMs > 0 && (
                <Text style={[styles.scheduleSubText, live.scheduleSubText]}>
                  Your next check-in will be {formatNextFire(nextFire)}{bumped ? ', so the coach has a full week of fresh data to act on' : ''}.
                </Text>
              )}
            </>
          )}
          <View style={[styles.helperBlock, live.helperBlock]}>
            <Text style={[styles.helperText, live.helperText]}>
              You can change the day any time. The next reminder will be at least 7 days after your last check-in so the trend has enough data to be useful.
            </Text>
          </View>
        </Card>

        {/* Missed check-in follow-up (OPP-C03). Optional, default on. */}
        <SectionLabel style={styles.sectionLabelSpacing}>Check-in follow-up</SectionLabel>
        <Card style={[styles.card, live.card]} padding="md">
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, live.iconWrap]}>
              <Ionicons name="hand-left-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.cardTitle, styles.toggleTitle]}>Follow up if a check-in slips by</Text>
            <Switch
              value={missedEnabled}
              onValueChange={handleMissedToggle}
              trackColor={{ false: t.colors.surface3, true: t.colors.primaryBg }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface3}
              accessibilityLabel="Check-in follow-up toggle"
            />
          </View>
          <View style={[styles.helperBlock, live.helperBlock]}>
            <Text style={[styles.helperText, live.helperText]}>
              If a check-in day passes without one, you'll get a gentle nudge that evening and a look at your weekly trend two days later. Never more than that, and never a guilt trip.
            </Text>
          </View>
        </Card>

        {/* F3: planned-meal confirm reminder. Optional, default on, Pro. */}
        <SectionLabel style={styles.sectionLabelSpacing}>Meal-plan reminder</SectionLabel>
        <Card style={[styles.card, live.card]} padding="md">
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, live.iconWrap]}>
              <Ionicons name="restaurant-outline" size={18} color={t.colors.primary} />
            </View>
            <Text style={[styles.cardTitle, styles.toggleTitle]}>Remind me to confirm planned meals</Text>
            <Switch
              value={plannedConfirmEnabled}
              onValueChange={handlePlannedConfirmToggle}
              trackColor={{ false: t.colors.surface3, true: t.colors.primaryBg }}
              thumbColor={t.colors.primary}
              ios_backgroundColor={t.colors.surface3}
              accessibilityLabel="Meal-plan reminder toggle"
            />
          </View>
          <View style={[styles.helperBlock, live.helperBlock]}>
            <Text style={[styles.helperText, live.helperText]}>
              If you have planned meals you've not marked as eaten, we'll send one gentle nudge in the evening so you can confirm them and keep your coach accurate.
            </Text>
          </View>
        </Card>

        {saved && <Text style={[styles.savedText, live.savedText]}>Saved</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  intro: { ...type.bodySm, color: colors.textSecondary },
  warningBox: {
    gap: spacing.sm,
    backgroundColor: colors.warningBg, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.warning,
  },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  warningText: { ...type.captionTight, flex: 1, color: colors.warning },
  // Mirrors NotificationSettingsScreen's bannerAction pair (the Campaign 3
  // Open Settings affordance), so the two banners read as one pattern.
  warningAction: { alignSelf: 'flex-start' },
  warningActionText: {
    ...type.bodySm, fontWeight: fontWeight.semibold,
    color: colors.warning, textDecorationLine: 'underline',
  },
  sectionLabelSpacing: { marginTop: spacing.md, marginBottom: -spacing.xs },
  // Intentional settings/list-style card: secondary surface (surface2),
  // vertical-only padding (children own their horizontal padding) and the
  // tighter radius.md corner. Card supplies the surface base, border and
  // vertical padding (padding="md"); these props keep the list-style look.
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 0,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { ...type.bodyStrong, color: colors.textPrimary },
  toggleTitle: { flex: 1 },
  pickerLabel: {
    fontSize: fontSize.xs, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: 'row' },
  chip: {
    minWidth: 40,
    marginBottom: spacing.md,
  },
  scheduleText: {
    ...type.label, color: colors.primary,
    paddingHorizontal: spacing.lg, marginTop: -spacing.sm, marginBottom: spacing.sm,
  },
  scheduleSubText: {
    ...type.captionTight, color: colors.textSecondary,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  helperBlock: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle, marginTop: spacing.xs,
  },
  helperText: { ...type.bodySm, color: colors.textMuted },
  savedText: {
    fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    textAlign: 'center', marginTop: spacing.sm,
  },
  // Item 9(b) (D141): copied verbatim from NotificationSettingsScreen's own
  // crossLink/crossLinkTitle/crossLinkSub, its reciprocal cross-link row.
  crossLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
// keys (flex/padding/gap/margin/borderRadius/minWidth, no token) and
// fontWeight (not part of useTheme()'s shape) are correctly omitted. Both
// coaching reminders stay always-scheduled (no toggle) -- colours only.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    intro: { ...t.type.bodySm, color: t.colors.textSecondary },
    warningBox: { backgroundColor: t.colors.warningBg, borderColor: t.colors.warning },
    warningText: { ...t.type.captionTight, color: t.colors.warning },
    warningActionText: { ...t.type.bodySm, fontWeight: fontWeight.semibold, color: t.colors.warning },
    card: { backgroundColor: t.colors.surface2 },
    iconWrap: { backgroundColor: t.colors.primaryBg },
    cardTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    pickerLabel: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    scheduleText: { ...t.type.label, color: t.colors.primary },
    scheduleSubText: { ...t.type.captionTight, color: t.colors.textSecondary },
    helperBlock: { borderTopColor: t.colors.borderSubtle },
    helperText: { ...t.type.bodySm, color: t.colors.textMuted },
    savedText: { fontSize: t.fontSize.xs, color: t.colors.primary },
    crossLink: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    crossLinkTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    crossLinkSub: { ...t.type.captionTight, color: t.colors.textMuted },
  };
}
