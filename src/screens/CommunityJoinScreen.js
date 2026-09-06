/**
 * CommunityJoinScreen (blueprint sections 2, 6; SD-04, SD-05)
 *
 * Nobody is in Community until they choose a handle and accept the
 * Community rules here. Creating the profile is what records the
 * `community_visibility` consent row, so the rules and the privacy
 * receipt are both on this screen, above the one committing action.
 *
 * The handle check is live: valid shape first (nothing is asked of the
 * server until the shape is right), then availability. A check that could
 * not RUN says so and leaves Create available, so joining offline ends in
 * a refusal that names the reason rather than a button that never lights
 * up. Under 18, the
 * server forces followers-only and keeps the profile out of search and
 * suggestions; the note says so before anyone commits.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import TextField from '../components/TextField';
import SectionLabel from '../components/SectionLabel';
import SegmentedControl from '../components/SegmentedControl';
import ProfileAvatarMark from '../components/ProfileAvatarMark';
import PrivacyReceipt from '../components/community/PrivacyReceipt';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { colors, spacing, type } from '../styles/theme';
import { AVATAR_PRESETS } from '../lib/profileAvatarPresets';
import {
  isValidHandle, checkHandle, upsertProfile, DISPLAY_NAME_MAX,
  COMMUNITY_RULES_VERSION,
} from '../lib/community';

// Same debounce the food search uses, for the same reason: a live check
// per keystroke is a request per keystroke.
const HANDLE_DEBOUNCE_MS = 250;

const RULES = [
  'Training talk only.',
  'Be decent to people.',
  'No body-shaming, no diet or calorie talk.',
  'Report what breaks this.',
];

const HANDLE_HINT = 'Use 3 to 20 letters, numbers or underscores.';
export const HANDLE_OFFLINE_HINT = 'Could not check that handle. You are offline.';
export const HANDLE_UNAVAILABLE_HINT = 'Could not check that handle just now. Try again.';

const REFUSALS = {
  offline: 'You are offline. Try again when you have a connection.',
  handle_taken: 'That handle is taken. Try another.',
  handle_invalid: HANDLE_HINT,
  content_not_allowed: 'That wording is not allowed here. Try different words.',
  rate_limited: 'That is a lot of changes for one day. Try again tomorrow.',
  invalid_input: 'Check the handle and name, then try again.',
};

export default function CommunityJoinScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const { me, refresh } = useCommunityMe();
  const next = route?.params?.next ?? null;

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preset, setPreset] = useState(AVATAR_PRESETS[0].key);
  const [visibility, setVisibility] = useState('public');
  // 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown'
  // 'unknown' is the check that could not RUN (offline, or a read that did
  // not answer). It is not a refusal: Create stays available so `create()`
  // can surface the real reason, rather than a screen that can never be
  // tapped and never says why (product review 2026-09-06, item 20).
  const [handleState, setHandleState] = useState('idle');
  const [checkFailure, setCheckFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const checkRef = useRef(0);

  const isMinor = !!me?.is_minor;

  useEffect(() => {
    const trimmed = handle.trim().toLowerCase();
    if (!trimmed) { setCheckFailure(null); setHandleState('idle'); return undefined; }
    if (!isValidHandle(trimmed)) { setCheckFailure(null); setHandleState('invalid'); return undefined; }
    setCheckFailure(null);
    setHandleState('checking');
    const seq = checkRef.current + 1;
    checkRef.current = seq;
    const timer = setTimeout(async () => {
      try {
        const free = await checkHandle(trimmed);
        // Request-id guard: a slower earlier check must not overwrite a
        // newer answer (the food search's own pattern).
        if (checkRef.current !== seq) return;
        setCheckFailure(null);
        setHandleState(free ? 'available' : 'taken');
      } catch (e) {
        if (checkRef.current !== seq) return;
        setCheckFailure(e?.code === 'offline' ? 'offline' : 'unavailable');
        setHandleState('unknown');
      }
    }, HANDLE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [handle]);

  const handleLine = {
    idle: HANDLE_HINT,
    invalid: HANDLE_HINT,
    checking: 'Checking',
    available: 'Available',
    taken: 'Taken',
    unknown: checkFailure === 'offline' ? HANDLE_OFFLINE_HINT : HANDLE_UNAVAILABLE_HINT,
  }[handleState];

  const handleTone = handleState === 'available'
    ? t.colors.success
    : (handleState === 'taken' || handleState === 'invalid' ? t.colors.error : t.colors.textMuted);

  // A check that could not run does not block the one committing action:
  // `create()` is what knows the truth, and its refusals (REFUSALS.offline,
  // handle_taken) say what actually happened.
  const canCreate = (handleState === 'available' || handleState === 'unknown')
    && displayName.trim().length > 0 && !busy;

  const create = useCallback(async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      await upsertProfile({
        handle: handle.trim().toLowerCase(),
        display_name: displayName.trim(),
        avatar_preset: preset,
        visibility,
        // Passed explicitly as well as by the client library: creating the
        // profile IS the consent record, so the version being accepted is
        // stated at the call site rather than only inside the transport.
        accept_rules_version: COMMUNITY_RULES_VERSION,
      });
      await refresh(true);
      toast.show('Your profile is live');
      if (next?.screen) navigation.replace(next.screen, next.params ?? {});
      else navigation.goBack();
    } catch (e) {
      toast.show(REFUSALS[e?.code] ?? 'Could not create your profile just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [canCreate, handle, displayName, preset, visibility, next, navigation, refresh, toast]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Join Community" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.block}>
          <Text style={[styles.blockTitle, { ...t.type.bodyStrong, color: t.colors.textPrimary }]}>
            Four rules
          </Text>
          {RULES.map((line) => (
            <Text key={line} style={[styles.rule, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
              {line}
            </Text>
          ))}
        </Card>

        <PrivacyReceipt />

        <View style={styles.field}>
          <TextField
            label="Handle"
            value={handle}
            onChangeText={(v) => setHandle(v.replace(/\s/g, '').toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Handle"
          />
          <Text style={[styles.hint, { ...t.type.caption, color: handleTone }]}>{handleLine}</Text>
        </View>

        <TextField
          label="Name"
          value={displayName}
          onChangeText={(v) => setDisplayName(v.slice(0, DISPLAY_NAME_MAX))}
          accessibilityLabel="Display name"
        />

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

        <View style={styles.field}>
          <SectionLabel>Who can follow you</SectionLabel>
          {/* An under-18 profile is followers-only, server-side. A control
              that cannot change anything is not offered: the note carries
              the reason instead (product review 2026-09-06). */}
          {isMinor ? null : (
            <SegmentedControl
              options={[
                { label: 'Anyone', value: 'public' },
                { label: 'People I approve', value: 'followers' },
              ]}
              value={visibility}
              onChange={setVisibility}
              accessibilityLabel="Who can follow you"
            />
          )}
          <Text style={[styles.hint, { ...t.type.caption, color: t.colors.textMuted }]}>
            {visibility === 'public' && !isMinor
              ? 'Anyone signed in can follow you and see what you post.'
              : 'You approve every follower before they see what you post.'}
          </Text>
          {isMinor ? (
            <Text style={[styles.hint, { ...t.type.caption, color: t.colors.textSecondary }]}>
              Under 18: your profile is followers-only and does not appear in search.
            </Text>
          ) : null}
        </View>

        <Button
          variant="emphatic"
          title="Create profile"
          disabled={!canCreate}
          loading={busy}
          onPress={create}
          accessibilityLabel="Create my Community profile"
        />

        <Button
          variant="tertiary"
          title="Community rules and contact"
          onPress={() => navigation.navigate('CommunityRules')}
          accessibilityLabel="Read the Community rules and contact"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  block: { gap: spacing.xs },
  blockTitle: { ...type.bodyStrong, color: colors.textPrimary },
  rule: { ...type.bodySm, color: colors.textSecondary },
  field: { gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
