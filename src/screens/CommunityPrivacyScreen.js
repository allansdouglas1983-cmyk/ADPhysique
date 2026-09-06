/**
 * CommunityPrivacyScreen (blueprint sections 2, 6)
 *
 * Everything about who can see you, in one place, reachable from
 * Community and from Settings: who can follow you, who you have blocked,
 * who you have muted, and leaving Community altogether.
 *
 * Someone who has never joined can open this from Settings, so the
 * screen also answers "what would Community share" with the same
 * receipt the Join screen carries, before there is anything to change.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import SectionLabel from '../components/SectionLabel';
import SegmentedControl from '../components/SegmentedControl';
import EmptyState from '../components/EmptyState';
import ProfileCard from '../components/community/ProfileCard';
import PrivacyReceipt from '../components/community/PrivacyReceipt';
import { appAlert } from '../components/AppAlert';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { colors, spacing, type } from '../styles/theme';
import {
  relationships, unblockUser, unmuteUser, upsertProfile, leaveCommunity,
  hasProfile,
} from '../lib/community';

export default function CommunityPrivacyScreen({ navigation }) {
  const t = useTheme();
  const toast = useToast();
  const { me, refresh } = useCommunityMe();
  const joined = hasProfile(me);
  const profile = me?.profile ?? null;

  const [visibility, setVisibility] = useState('public');
  const [lists, setLists] = useState({ blocked: [], muted: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile?.visibility) setVisibility(profile.visibility);
  }, [profile?.visibility]);

  const load = useCallback(async () => {
    if (!joined) { setLoading(false); return; }
    setLoading(true);
    try {
      const out = await relationships();
      setLists({ blocked: out?.blocked ?? [], muted: out?.muted ?? [] });
    } catch (_e) {
      setLists({ blocked: [], muted: [] });
    } finally {
      setLoading(false);
    }
  }, [joined]);

  useEffect(() => { load(); }, [load]);

  async function changeVisibility(next) {
    const previous = visibility;
    setVisibility(next);
    setBusy(true);
    try {
      await upsertProfile({ visibility: next });
      await refresh(true);
      toast.show(next === 'public' ? 'Anyone can follow you' : 'You approve every follower');
    } catch (_e) {
      setVisibility(previous);
      toast.show('Could not change that just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function undo(kind, card) {
    try {
      if (kind === 'blocked') await unblockUser(card.user_id);
      else await unmuteUser(card.user_id);
      setLists((prev) => ({ ...prev, [kind]: prev[kind].filter((c) => (c.card ?? c).user_id !== card.user_id) }));
      toast.show(kind === 'blocked' ? 'Unblocked' : 'Unmuted');
    } catch (_e) {
      toast.show('Could not do that just now.', { variant: 'error' });
    }
  }

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
              navigation.goBack();
            } catch (_e) {
              toast.show('Could not do that just now.', { variant: 'error' });
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Community" />
      <ScrollView contentContainerStyle={styles.content}>
        <PrivacyReceipt />

        {!joined ? (
          <EmptyState
            icon="people-outline"
            title="You are not in Community yet"
            text="Nothing about you is shared until you create a profile."
            actionLabel="Open Community"
            onAction={() => navigation.navigate('Community')}
            actionAccessibilityLabel="Open Community"
          />
        ) : (
          <>
            <View style={styles.section}>
              <SectionLabel>Who can follow you</SectionLabel>
              <SegmentedControl
                options={[
                  { label: 'Anyone', value: 'public' },
                  { label: 'People I approve', value: 'followers' },
                ]}
                value={visibility}
                onChange={busy ? () => {} : changeVisibility}
                accessibilityLabel="Who can follow you"
              />
              <Text style={[styles.hint, { ...t.type.caption, color: t.colors.textMuted }]}>
                {visibility === 'public'
                  ? 'Anyone signed in can follow you and see what you post.'
                  : 'You approve every follower before they see what you post.'}
              </Text>
            </View>

            <View style={styles.section}>
              <SectionLabel>Blocked</SectionLabel>
              {loading ? <ActivityIndicator color={t.colors.primary} /> : null}
              {!loading && !lists.blocked.length ? (
                <Text style={[styles.hint, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
                  You have not blocked anyone.
                </Text>
              ) : null}
              {lists.blocked.map((row) => {
                const card = row.card ?? row;
                return (
                  <View key={card.user_id} style={styles.row}>
                    <ProfileCard card={card} showFollow={false} compact />
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      title="Unblock"
                      onPress={() => undo('blocked', card)}
                      accessibilityLabel={`Unblock @${card.handle}`}
                    />
                  </View>
                );
              })}
            </View>

            <View style={styles.section}>
              <SectionLabel>Muted</SectionLabel>
              {!loading && !lists.muted.length ? (
                <Text style={[styles.hint, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
                  You have not muted anyone.
                </Text>
              ) : null}
              {lists.muted.map((row) => {
                const card = row.card ?? row;
                return (
                  <View key={card.user_id} style={styles.row}>
                    <ProfileCard card={card} showFollow={false} compact />
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      title="Unmute"
                      onPress={() => undo('muted', card)}
                      accessibilityLabel={`Unmute @${card.handle}`}
                    />
                  </View>
                );
              })}
            </View>

            <Button
              variant="secondary"
              title="Community rules"
              onPress={() => navigation.navigate('CommunityRules')}
              accessibilityLabel="Read the Community rules"
            />

            <Button
              variant="destructive"
              title="Leave Community"
              onPress={confirmLeave}
              accessibilityLabel="Leave Community"
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.sm },
  row: { gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
});
