/**
 * CommunityEditProfileScreen (blueprint section 6; SD-05)
 *
 * Every fact on a Community profile is typed here. Nothing is read from
 * onboarding, the body profile or the engine: the styles, goal, setting,
 * area and gym are choices the user makes for Community and nowhere
 * else.
 *
 * The gym and area fields are honest labels, not places: "only the name
 * you type, never your location". There is no map, no radius and no
 * verification behind them (SD-10).
 *
 * Leaving Community is here too, as the destructive action it is: it
 * withdraws the consent and deletes everything the user authored.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import Chip from '../components/Chip';
import TextField from '../components/TextField';
import SectionLabel from '../components/SectionLabel';
import SegmentedControl from '../components/SegmentedControl';
import ProfileAvatarMark from '../components/ProfileAvatarMark';
import { appAlert } from '../components/AppAlert';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { colors, spacing, type } from '../styles/theme';
import { AVATAR_PRESETS } from '../lib/profileAvatarPresets';
import {
  upsertProfile, leaveCommunity, COMMUNITY_STYLE_KEYS, COMMUNITY_GOALS,
  COMMUNITY_SETTINGS, MAX_STYLES_PER_PROFILE, DISPLAY_NAME_MAX, BIO_MAX,
  AREA_LABEL_MAX, GYM_LABEL_MAX,
} from '../lib/community';

const REFUSALS = {
  offline: 'You are offline. Try again when you have a connection.',
  handle_taken: 'That handle is taken. Try another.',
  handle_invalid: 'Use 3 to 20 letters, numbers or underscores.',
  content_not_allowed: 'That wording is not allowed here. Try different words.',
  rate_limited: 'That is a lot of changes for one day. Try again tomorrow.',
  invalid_input: 'Check what you have typed, then try again.',
};

export default function CommunityEditProfileScreen({ navigation }) {
  const t = useTheme();
  const toast = useToast();
  const { me, refresh } = useCommunityMe();
  const profile = me?.profile ?? null;

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [preset, setPreset] = useState(AVATAR_PRESETS[0].key);
  const [styleKeys, setStyleKeys] = useState([]);
  const [goal, setGoal] = useState(null);
  const [setting, setSetting] = useState(null);
  const [area, setArea] = useState('');
  const [gym, setGym] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Prefill once the cached profile arrives, and only once: re-running it
  // on every payload refresh would overwrite what the user is typing.
  useEffect(() => {
    if (ready || !profile) return;
    setDisplayName(profile.display_name ?? '');
    setBio(profile.bio ?? '');
    setPreset(profile.avatar_preset ?? AVATAR_PRESETS[0].key);
    setStyleKeys(Array.isArray(profile.styles) ? profile.styles : []);
    setGoal(profile.goal ?? null);
    setSetting(profile.setting ?? null);
    setArea(profile.area_label ?? '');
    setGym(profile.gym_label ?? '');
    setVisibility(profile.visibility ?? 'public');
    setReady(true);
  }, [profile, ready]);

  function toggleStyle(key) {
    setStyleKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_STYLES_PER_PROFILE) return prev;
      return [...prev, key];
    });
  }

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await upsertProfile({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_preset: preset,
        styles: styleKeys,
        goal,
        setting,
        area_label: area.trim() || null,
        gym_label: gym.trim() || null,
        visibility,
      });
      await refresh(true);
      toast.show('Profile saved');
      navigation.goBack();
    } catch (e) {
      toast.show(REFUSALS[e?.code] ?? 'Could not save your profile just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [busy, displayName, bio, preset, styleKeys, goal, setting, area, gym, visibility, refresh, toast, navigation]);

  function confirmLeave() {
    appAlert(
      'Leave Community?',
      'Your profile, posts, published programmes and follows are deleted. Your training, plans and food diary are not touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveCommunity();
              await refresh(true);
              toast.show('You have left Community');
              navigation.popToTop?.();
            } catch (e) {
              toast.show(REFUSALS[e?.code] ?? 'Could not do that just now.', { variant: 'error' });
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Edit profile" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <SectionLabel>Avatar</SectionLabel>
          <View style={styles.presets}>
            {AVATAR_PRESETS.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => setPreset(p.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: preset === p.key }}
                accessibilityLabel={p.label}
              >
                <ProfileAvatarMark
                  presetKey={p.key}
                  displayName={displayName || 'Athlete'}
                  size={48}
                  selected={preset === p.key}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <TextField
          label="Name"
          value={displayName}
          onChangeText={(v) => setDisplayName(v.slice(0, DISPLAY_NAME_MAX))}
          accessibilityLabel="Display name"
        />

        <TextField
          label="Bio"
          value={bio}
          onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
          multiline
          accessibilityLabel="Bio"
        />

        <View style={styles.field}>
          <SectionLabel>Training styles</SectionLabel>
          <Text style={[styles.hint, { ...t.type.caption, color: t.colors.textMuted }]}>
            {`Up to ${MAX_STYLES_PER_PROFILE}.`}
          </Text>
          <View style={styles.chips}>
            {Object.entries(COMMUNITY_STYLE_KEYS).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={styleKeys.includes(key)}
                onPress={() => toggleStyle(key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <SectionLabel>Goal</SectionLabel>
          <View style={styles.chips}>
            {Object.entries(COMMUNITY_GOALS).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={goal === key}
                accessibilityRole="radio"
                onPress={() => setGoal(goal === key ? null : key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <SectionLabel>Where you train</SectionLabel>
          <View style={styles.chips}>
            {Object.entries(COMMUNITY_SETTINGS).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={setting === key}
                accessibilityRole="radio"
                onPress={() => setSetting(setting === key ? null : key)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Area"
          value={area}
          onChangeText={(v) => setArea(v.slice(0, AREA_LABEL_MAX))}
          accessibilityLabel="Area"
        />

        <View style={styles.field}>
          <TextField
            label="Trains at"
            value={gym}
            onChangeText={(v) => setGym(v.slice(0, GYM_LABEL_MAX))}
            accessibilityLabel="Gym you train at"
          />
          <Text style={[styles.hint, { ...t.type.caption, color: t.colors.textMuted }]}>
            Only the name you type. Never your location.
          </Text>
        </View>

        <View style={styles.field}>
          <SectionLabel>Who can follow you</SectionLabel>
          <SegmentedControl
            options={[
              { label: 'Anyone', value: 'public' },
              { label: 'People I approve', value: 'followers' },
            ]}
            value={visibility}
            onChange={setVisibility}
            accessibilityLabel="Who can follow you"
          />
        </View>

        <Button
          variant="primary"
          title="Save"
          loading={busy}
          onPress={save}
          accessibilityLabel="Save profile"
        />

        <Button
          variant="destructive"
          title="Leave Community"
          onPress={confirmLeave}
          accessibilityLabel="Leave Community"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  field: { gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
