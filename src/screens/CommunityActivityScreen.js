/**
 * CommunityActivityScreen (blueprint sections 6, 7; SD-15)
 *
 * The in-app record of everything that happened to you in Community.
 * A push is an extra, never the record: a follow, reaction, comment or
 * programme use lands here whether or not the server was allowed to send
 * a notification (an open wellbeing check, a disabled category, quiet
 * hours).
 *
 * Follow requests sit above the list with Accept and Decline, because
 * deciding on them is the reason to open this screen.
 *
 * Opening the screen marks everything seen, which clears the amber dot
 * on the Today header.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// E8 (founder decision 2026-07-02): every list in the app renders
// through FlashList, never an unrecycled FlatList. The props are the
// blueprint's own list contract (keyExtractor, onEndReached paging,
// pull-to-refresh, an empty state); the list underneath recycles.
import { FlashList } from '@shopify/flash-list';
import BackHeader from '../components/BackHeader';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import ActivityRow from '../components/community/ActivityRow';
import ProfileCard from '../components/community/ProfileCard';
import Button from '../components/Button';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { colors, spacing } from '../styles/theme';
import {
  loadActivity, markActivitySeen, pendingFollowRequests, respondToFollow,
} from '../lib/community';

const PAGE = 30;

export default function CommunityActivityScreen({ navigation }) {
  const t = useTheme();
  const toast = useToast();
  const { refresh: refreshMe } = useCommunityMe();

  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, pending] = await Promise.all([
        loadActivity({ limit: PAGE }),
        pendingFollowRequests({ limit: PAGE }).catch(() => ({ people: [] })),
      ]);
      setRows(page.activity);
      setRequests(pending?.people ?? []);
      // The server mints the cursor (`ts|uuid`); a client-built one is
      // refused as `invalid_input`.
      setCursor(page.cursor);
      setError(null);
    } catch (e) {
      setError(e?.code ?? 'unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Seen is a side effect of arriving, not of reading each row.
  useEffect(() => {
    markActivitySeen()
      .then(() => refreshMe(true))
      .catch(() => { /* the dot clears on the next load */ });
  }, [refreshMe]);

  const onEndReached = useCallback(async () => {
    if (paging || !cursor || !rows.length) return;
    setPaging(true);
    try {
      const page = await loadActivity({ cursor, limit: PAGE });
      if (page.activity.length) {
        setRows((prev) => [...prev, ...page.activity]);
        setCursor(page.cursor);
      } else {
        setCursor(null);
      }
    } catch (_e) {
      setCursor(null);
    } finally {
      setPaging(false);
    }
  }, [cursor, paging, rows.length]);

  async function respond(card, accept) {
    if (busyId) return;
    setBusyId(card.user_id);
    try {
      await respondToFollow(card.user_id, accept);
      setRequests((prev) => prev.filter((r) => (r.card ?? r).user_id !== card.user_id));
      toast.show(accept ? `@${card.handle} is now following you` : 'Request declined');
      refreshMe(true).catch(() => { /* best effort */ });
    } catch (_e) {
      toast.show('Could not do that just now.', { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const header = requests.length ? (
    <View style={styles.requests}>
      <SectionLabel>Follow requests</SectionLabel>
      {requests.map((row) => {
        const card = row.card ?? row;
        return (
          <View key={card.user_id} style={styles.request}>
            <ProfileCard
              card={card}
              showFollow={false}
              compact
              onPress={() => navigation.navigate('CommunityProfile', { handle: card.handle })}
            />
            <View style={styles.requestActions}>
              <Button
                variant="primary"
                size="sm"
                fullWidth={false}
                title="Accept"
                loading={busyId === card.user_id}
                onPress={() => respond(card, true)}
                accessibilityLabel={`Accept the follow request from @${card.handle}`}
              />
              <Button
                variant="secondary"
                size="sm"
                fullWidth={false}
                title="Decline"
                disabled={busyId === card.user_id}
                onPress={() => respond(card, false)}
                accessibilityLabel={`Decline the follow request from @${card.handle}`}
              />
            </View>
          </View>
        );
      })}
      <SectionLabel>Activity</SectionLabel>
    </View>
  ) : null;

  const empty = loading ? (
    <View style={styles.loading}><ActivityIndicator color={t.colors.primary} /></View>
  ) : error ? (
    <EmptyState
      icon="cloud-offline-outline"
      title={error === 'offline' ? 'You are offline' : 'Could not load activity'}
      text={error === 'offline'
        ? 'Community needs a connection. Your training is unaffected.'
        : 'Try that again in a moment.'}
      actionLabel="Try again"
      onAction={load}
      actionAccessibilityLabel="Try loading activity again"
    />
  ) : (
    <EmptyState
      icon="notifications-outline"
      title="Quiet for now"
      text="Follows, reactions and comments on your posts appear here."
      actionLabel="Find people"
      onAction={() => navigation.navigate('CommunitySearch')}
      actionAccessibilityLabel="Find people to follow"
    />
  );

  function open(item) {
    if (item.kind === 'comment' || item.kind === 'reaction') {
      if (item.target_id) navigation.navigate('CommunityPost', { id: item.target_id });
      return;
    }
    if (item.kind === 'programme_used' && item.target_id) {
      navigation.navigate('CommunityProgramme', { id: item.target_id });
      return;
    }
    if (item.actor?.handle) navigation.navigate('CommunityProfile', { handle: item.actor.handle });
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Activity" />
      <FlashList
        data={rows.filter((r) => r.kind !== 'follow_request')}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ActivityRow item={item} onPress={() => open(item)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={paging ? (
          <ActivityIndicator color={t.colors.primary} style={styles.footer} />
        ) : null}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={onEndReached}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try { await load(); } finally { setRefreshing(false); }
            }}
            tintColor={t.colors.textMuted}
            colors={[t.colors.primary]}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  requests: { gap: spacing.md, marginBottom: spacing.md },
  request: { gap: spacing.sm },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  footer: { paddingVertical: spacing.lg },
});
