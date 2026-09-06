import { View, Platform } from 'react-native';
import { appAlert } from '../components/AppAlert';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { SettingsPage, SettingRow, settingsStyles as styles, useSettingsStyles } from '../components/SettingsPrimitives';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import * as haptics from '../lib/haptics';
import { isHealthAvailable, getHealthProviderLabel } from '../lib/health';

// Settings landing. A short list of categories, each opening its own
// focused sub-page. The old single 1,500-line screen put every toggle on
// one wall; this is the tidy entry point into them.
//
// CP-6 (2026-07-09 UX audit): "Workout & units" used to render inline here
// (Hevy teardown 2026-06-29, R1/R2), breaking this screen's own "tap for a
// sub-page" contract. Moved wholesale into SettingsWorkoutScreen.js; this
// screen now just links to it like every other row.
export default function SettingsScreen({ navigation }) {
  // Volyume is fully free (founder ruling): no tier, no Pro rows to gate.
  const { user } = useAppStore(useShallow(s => ({
    user: s.user,
  })));
  const healthOn = isHealthAvailable();
  // CP-10 stage 3: live theme override appended after the frozen static
  // base, so this row-list card follows a theme change (SettingsPrimitives.js).
  const live = useSettingsStyles();

  return (
    <SettingsPage title="Settings">
      <View style={[styles.section, live.section]}>
        {/* CC33 close-out: the subtitle front-loads the recognisable
            words. Banked research (S1-RESEARCH-EVIDENCE-BANKED.md, the
            naming/entry section): the DfE teacher-training design history
            moved disclosure from 4% to 15% across ~8,000 applications by
            replacing a gatekeeping question with one ungated list of
            recognisable words, and ONS shows an identity-first door
            ("are you disabled?") misroutes under half the intended
            audience - pain, fatigue and breathing limits are the commonly
            missed ones. So the label keeps naming the EFFECT on training
            (one door, no self-classification) and the subtitle carries the
            words a person actually searches for. */}
        <SettingRow
          icon="body"
          label="Injuries & limitations"
          sub="Injuries, pain, long-term conditions or disabilities that affect your training."
          accessibilityLabel="Injuries & limitations. Injuries, pain, long-term conditions or disabilities that affect your training."
          onPress={() => { haptics.selection(); navigation.navigate('HowYouTrain'); }}
        />
        <SettingRow
          icon="person-circle-outline"
          label="Account"
          sub={user?.email || ''}
          onPress={() => { haptics.selection(); navigation.navigate('SettingsAccount'); }}
        />
        <SettingRow
          icon="person-outline"
          label="Profile"
          sub="Name, sex, height, date of birth and diet preference"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsProfile'); }}
        />
        <SettingRow
          icon="barbell-outline"
          label="Coaching"
          sub="Calmer coaching, session readiness and coaching preferences"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsCoaching'); }}
        />
        {/* CP-6 (2026-07-09 UX audit): this used to render inline on this
            screen (Hevy teardown 2026-06-29, R1/R2), breaking Settings' own
            "tap for a sub-page" contract. Moved wholesale into its own
            sub-page, SettingsWorkoutScreen.js; this is now just a row like
            every sibling above and below it. */}
        <SettingRow
          icon="body-outline"
          label="Workout & units"
          sub="Body weight unit, default rest timer and rest alerts"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsWorkout'); }}
        />
        <SettingRow
          icon="nutrition-outline"
          label="Nutrition targets"
          sub="Your calorie and macro targets"
          onPress={() => { haptics.selection(); navigation.navigate('NutritionTargets'); }}
        />
        {/* Founder order (2026-07-13): the "Meal names" settings row is
            REMOVED - not needed. The MealNames screen and its route stay
            registered (harmless, unreachable from Settings) in case meal
            renaming ever returns by founder decision. */}
        <SettingRow
          icon="leaf-outline"
          label="Dietary needs"
          sub="Diet, allergies and foods to avoid"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsDietary'); }}
        />
        {/* Item 9(a) (D141): both subtitles used to say "check-ins", but only
            CoachingRemindersScreen owns check-in reminders -- this screen's
            own check-in toggles were removed and now live there (see
            NotificationSettingsScreen's "Morning weight + weekly check-in
            reminders moved to a dedicated screen" comment). Rewritten to
            name only what each destination screen actually owns, so the two
            rows no longer overlap. */}
        <SettingRow
          icon="notifications-outline"
          label="Notifications and reminders"
          sub="Training reminder, meal reminders and quiet hours"
          onPress={() => { haptics.selection(); navigation.navigate('NotificationSettings'); }}
        />
        <SettingRow
          icon="pulse-outline"
          label="Coaching reminders"
          sub="Weigh-in and weekly check-in schedule"
          onPress={() => { haptics.selection(); navigation.navigate('CoachingReminders'); }}
        />
        <SettingRow
          icon="contrast-outline"
          label="Display and accessibility"
          sub="Appearance, energy units, text size, contrast, motion"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsDisplay'); }}
        />
        <SettingRow
          icon="apps-outline"
          label="Home screen widget"
          sub="Your next session, right on your home screen"
          onPress={() => { haptics.selection(); appAlert(
            'Home screen widget',
            Platform.OS === 'android'
              ? 'Volyume has two home screen widgets: your next session, and this week\'s consistency. Long-press an empty spot on your home screen, choose Widgets, then find Volyume to add one.'
              : 'Volyume has home screen widgets for your next session and this week\'s consistency, plus a lock screen widget for your consistency. Long-press your home screen, tap the + in the corner, then find Volyume to add a widget. For the lock screen widget, long-press your lock screen, tap Customise, then add Volyume from the widget gallery.',
            [{ text: 'Got it' }],
          ); }}
        />
        {healthOn && (
          <SettingRow
            icon="heart-outline"
            label={getHealthProviderLabel()}
            sub="Weight and workouts"
            onPress={() => { haptics.selection(); navigation.navigate('SettingsHealth'); }}
          />
        )}
        <SettingRow
          icon="cloud-outline"
          label="Your data"
          sub="Sync, backup, import, export"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsData'); }}
        />
        {/* Community (blueprint section 6): the privacy half of Community
            is reachable from Settings as well as from Community itself, so
            "who can see me" is answerable from where people look for it.
            Community lives in the Home stack, so this is a cross-tab jump
            like the volume-targets row on Coach. */}
        <SettingRow
          icon="people-outline"
          label="Community"
          sub="Who can follow you, blocked and muted people"
          onPress={() => { haptics.selection(); navigateCrossTab(navigation, 'HomeTab', 'CommunityPrivacy'); }}
        />
        <SettingRow
          icon="shield-checkmark-outline"
          label="Privacy and legal"
          sub="Consent, data sharing and policy"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsPrivacy'); }}
        />
        <SettingRow
          icon="information-circle-outline"
          label="Help and about"
          sub="Feedback, rating, version"
          onPress={() => { haptics.selection(); navigation.navigate('SettingsAbout'); }}
        />
      </View>
    </SettingsPage>
  );
}
