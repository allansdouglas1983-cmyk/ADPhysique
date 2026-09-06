/**
 * CommunityDimensionScreen (blueprint section 6; SD-10)
 *
 * A dimension is a page, not a room: the people who chose the same
 * style, gym, area or programme, and the programmes published in it.
 * There is no feed of its own, no admin, no leaderboard and no join
 * button, because there is nothing to join.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// E8 (founder decision 2026-07-02): every list in the app renders
// through FlashList, never an unrecycled FlatList. The props are the
// blueprint's own list contract (keyExtractor, onEndReached paging,
// pull-to-refresh, an empty state); the list underneath recycles.
import { FlashList } from '@shopify/flash-list';
import BackHeader from '../components/BackHeader';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import ProfileCard from '../components/community/ProfileCard';
import ProgrammeTile from '../components/community/ProgrammeTile';
import useTheme from '../hooks/useTheme';
import { colors, spacing, type } from '../styles/theme';
import { loadDimension } from '../lib/community';
import { peopleLine } from '../components/community/DimensionRow';

const PAGE = 20;

export default function CommunityDimensionScreen({ navigation, route }) {
  const t = useTheme();
  const kind = route?.params?.kind ?? null;
  const key = route?.params?.key ?? null;
  const paramLabel = route?.params?.label ?? '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await loadDimension(kind, key, { limit: PAGE });
      setData(out);
      setError(null);
    } catch (e) {
      setError(e?.code ?? 'unavailable');
    } finally {
      setLoading(false);
    }
  }, [kind, key]);

  useEffect(() => { load(); }, [load]);

  const label = data?.label || paramLabel;
  const people = data?.people ?? [];
  const programmes = data?.programmes ?? [];

  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, { ...t.type.h2, color: t.colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.sub, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
        {peopleLine(data?.count ?? people.length)}
      </Text>
      {people.length ? <SectionLabel>People</SectionLabel> : null}
    </View>
  );

  const footer = programmes.length ? (
    <View style={styles.footerBlock}>
      <SectionLabel>Programmes</SectionLabel>
      {programmes.map((row) => (
        <ProgrammeTile
          key={(row.programme ?? row).id}
          programme={row.programme ?? row}
          creator={row.creator ?? null}
          onPress={() => navigation.navigate('CommunityProgramme', { id: (row.programme ?? row).id })}
        />
      ))}
    </View>
  ) : null;

  const empty = loading ? (
    <View style={styles.loading}><ActivityIndicator color={t.colors.primary} /></View>
  ) : error ? (
    <EmptyState
      icon="cloud-offline-outline"
      title={error === 'offline' ? 'You are offline' : 'Could not load this'}
      text={error === 'offline'
        ? 'Community needs a connection. Your training is unaffected.'
        : 'Try that again in a moment.'}
      actionLabel="Try again"
      onAction={load}
      actionAccessibilityLabel="Try loading this again"
    />
  ) : programmes.length ? null : (
    <EmptyState
      icon="people-outline"
      title="Nobody here yet"
      text="When other people choose this, they appear here."
      actionLabel="Find people"
      onAction={() => navigation.navigate('CommunitySearch')}
      actionAccessibilityLabel="Find people to follow"
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title={label || 'Community'} />
      <FlashList
        data={people}
        keyExtractor={(item) => (item.card ?? item).user_id}
        renderItem={({ item }) => (
          <ProfileCard
            card={item.card ?? item}
            onPress={() => navigation.navigate('CommunityProfile', { handle: (item.card ?? item).handle })}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => { /* one page per dimension; the list is small by design */ }}
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
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { ...type.h2, color: colors.textPrimary },
  sub: { ...type.bodySm, color: colors.textSecondary },
  footerBlock: { gap: spacing.md, marginTop: spacing.lg },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
});
