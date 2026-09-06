/**
 * CommunitySearchScreen (blueprint sections 1, 6; SD-09)
 *
 * Two searches behind one field: people by handle or display name, and
 * programmes by title. Both are plain matches over public content;
 * nothing here ranks by popularity, and blocked people are invisible in
 * both directions server-side.
 *
 * The query is debounced and request-id guarded, the same shape the food
 * search uses, so a slow earlier answer can never overwrite a newer one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// E8 (founder decision 2026-07-02): every list in the app renders
// through FlashList, never an unrecycled FlatList. The props are the
// blueprint's own list contract (keyExtractor, onEndReached paging,
// pull-to-refresh, an empty state); the list underneath recycles.
import { FlashList } from '@shopify/flash-list';
import BackHeader from '../components/BackHeader';
import SearchBar from '../components/SearchBar';
import SegmentedControl from '../components/SegmentedControl';
import EmptyState from '../components/EmptyState';
import ProfileCard from '../components/community/ProfileCard';
import ProgrammeTile from '../components/community/ProgrammeTile';
import useTheme from '../hooks/useTheme';
import { colors, spacing } from '../styles/theme';
import { searchPeople, searchProgrammes } from '../lib/community';

const DEBOUNCE_MS = 250;
const PAGE = 20;

export default function CommunitySearchScreen({ navigation, route }) {
  const t = useTheme();
  const [query, setQuery] = useState(route?.params?.q ?? '');
  const [tab, setTab] = useState(route?.params?.tab === 'programmes' ? 'programmes' : 'people');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const seqRef = useRef(0);

  const run = useCallback(async (q, which) => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    if (!q.trim()) { setResults([]); setLoading(false); setError(null); return; }
    setLoading(true);
    try {
      const page = which === 'programmes'
        ? await searchProgrammes(q, { limit: PAGE })
        : await searchPeople(q, { limit: PAGE });
      if (seqRef.current !== seq) return;
      setResults(which === 'programmes' ? page.programmes : page.people);
      setError(null);
    } catch (e) {
      if (seqRef.current !== seq) return;
      setResults([]);
      setError(e?.code ?? 'unavailable');
    } finally {
      if (seqRef.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { run(query, tab); }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, tab, run]);

  const empty = !query.trim() ? (
    <EmptyState
      icon="search-outline"
      title="Search by @handle or name"
      text="Find someone you train with, or a programme by its title."
    />
  ) : loading ? null : error ? (
    <EmptyState
      icon="cloud-offline-outline"
      title={error === 'offline' ? 'You are offline' : 'Could not search just now'}
      text={error === 'offline'
        ? 'Community needs a connection. Your training is unaffected.'
        : 'Try that again in a moment.'}
      actionLabel="Try again"
      onAction={() => run(query, tab)}
      actionAccessibilityLabel="Try the search again"
    />
  ) : tab === 'people' ? (
    <EmptyState
      icon="people-outline"
      title="No one by that name yet"
      text="Try the start of their handle, or their display name."
    />
  ) : (
    <EmptyState
      icon="list-outline"
      title="Nothing with that title yet"
      text="Try a shorter word from the programme name."
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Search" />
      <View style={styles.controls}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search people and programmes"
          autoFocus
          loading={loading}
          accessibilityLabel="Search Community"
        />
        <SegmentedControl
          options={[{ label: 'People', value: 'people' }, { label: 'Programmes', value: 'programmes' }]}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Search in"
        />
      </View>
      <FlashList
        data={results}
        keyExtractor={(item) => (tab === 'people'
          ? (item.card ?? item).user_id
          : (item.programme ?? item).id)}
        renderItem={({ item }) => (tab === 'people' ? (
          <ProfileCard
            card={item.card ?? item}
            onPress={() => navigation.navigate('CommunityProfile', { handle: (item.card ?? item).handle })}
          />
        ) : (
          <ProgrammeTile
            programme={item.programme ?? item}
            creator={item.creator ?? null}
            onPress={() => navigation.navigate('CommunityProgramme', { id: (item.programme ?? item).id })}
          />
        ))}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => { /* search returns one page; refine the query rather than paging */ }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try { await run(query, tab); } finally { setRefreshing(false); }
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
  controls: { padding: spacing.lg, gap: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
});
