/**
 * CommunityHubScreen (blueprint sections 1, 6; SD-01, SD-04, SD-06,
 * SD-09, SD-10)
 *
 * The one Community destination. Two halves: Following (the people you
 * chose, newest first, never ranked) and Discover (programmes, people
 * you may want to follow, the dimensions you share with others, and
 * recent training stories).
 *
 * Nobody is in Community until they create a profile, but the value is
 * visible before that: with no profile the hero explains what this is,
 * carries the privacy receipt, and Discover renders read-only beneath
 * it (SD-04).
 *
 * Offline is a first-class state, not an error: the hub payload is
 * cached per user, so an offline open shows the last thing the user saw
 * with one quiet line.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// E8 (founder decision 2026-07-02): every list in the app renders
// through FlashList, never an unrecycled FlatList. The props are the
// blueprint's own list contract (keyExtractor, onEndReached paging,
// pull-to-refresh, an empty state); the list underneath recycles.
import { FlashList } from '@shopify/flash-list';
import Ionicons from '@expo/vector-icons/Ionicons';
import BackHeader from '../components/BackHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import SegmentedControl from '../components/SegmentedControl';
import PostCard from '../components/community/PostCard';
import ProfileCard from '../components/community/ProfileCard';
import ProgrammeTile from '../components/community/ProgrammeTile';
import DimensionRow from '../components/community/DimensionRow';
import PrivacyReceipt from '../components/community/PrivacyReceipt';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { colors, spacing, type, circle } from '../styles/theme';
import { logError } from '../lib/errorLog';
import { getLibraryPlans, getPlanWorkoutCounts } from '../lib/database';
import { styleKeyFromTags } from '../lib/exercise/stylePools';
import {
  loadHub, hasProfile, hasUnseen, reactToPost,
  COMMUNITY_DIMENSION_MIN_FOR_HUB,
} from '../lib/community';

const PAGE = 20;
// How many Volyume library plans the Discover "By Volyume" strip carries.
// Enough to answer "there is something here" on an empty community, few
// enough that it never buries what people published.
const VOLYUME_TILES = 4;

/**
 * The feed rows arrive as `{post, author, my_reaction}` from the RPCs.
 * Older cached payloads (and a row read straight from a list) may be the
 * post itself with the author alongside, so both shapes are accepted and
 * one shape leaves this function.
 */
export function normalisePostRow(row) {
  if (!row) return null;
  const post = row.post ?? row;
  return {
    post,
    author: row.author ?? post.author ?? null,
    myReaction: !!(row.my_reaction ?? post.my_reaction),
  };
}

/** The Volyume library plans, in ProgrammeTile shape. Local reads only. */
export async function loadVolyumeTiles() {
  const [plans, counts] = await Promise.all([getLibraryPlans(), getPlanWorkoutCounts()]);
  const rows = Array.isArray(plans) ? plans : [];
  const featured = rows.filter((p) => String(p.tags ?? '').includes('featured'));
  const pick = (featured.length ? featured : rows).slice(0, VOLYUME_TILES);
  return pick.map((p) => ({
    id: p.id,
    title: p.name,
    style_key: styleKeyFromTags(p.tags ?? null),
    days_per_week: counts?.[p.id] ?? 0,
    exercise_count: 0,
    has_circuits: false,
    use_count: 0,
  }));
}

export default function CommunityHubScreen({ navigation, route }) {
  const t = useTheme();
  const { me, loading: meLoading, refresh: refreshMe } = useCommunityMe();
  const joined = hasProfile(me);
  const legacyPartnerCode = route?.params?.legacyPartnerCode ?? null;

  const [segment, setSegment] = useState(route?.params?.segment === 'discover' ? 'discover' : 'following');
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState(false);
  const [volyume, setVolyume] = useState([]);
  const [legacyCardShown, setLegacyCardShown] = useState(!!legacyPartnerCode);
  const [browsing, setBrowsing] = useState(false);

  // Someone without a profile only ever sees Discover (SD-04), so the
  // segment follows the profile rather than the other way round.
  const shown = joined && !browsing ? segment : 'discover';

  const load = useCallback(async (opts = {}) => {
    if (!opts.quiet) setLoading(true);
    const out = await loadHub(shown, { limit: PAGE });
    setHub(out);
    setLoading(false);
  }, [shown]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    loadVolyumeTiles()
      .then((tiles) => { if (alive) setVolyume(tiles); })
      .catch((e) => logError('CommunityHub.loadVolyumeTiles', e, {}));
    return () => { alive = false; };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load({ quiet: true }), refreshMe(true)]);
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshMe]);

  const onEndReached = useCallback(async () => {
    if (paging || !hub?.cursor) return;
    setPaging(true);
    try {
      const next = await loadHub(shown, { cursor: hub.cursor, limit: PAGE });
      setHub((prev) => (prev ? {
        ...prev,
        posts: [...(prev.posts ?? []), ...(next.posts ?? [])],
        cursor: next.cursor,
      } : next));
    } finally {
      setPaging(false);
    }
  }, [hub, paging, shown]);

  const posts = useMemo(
    () => (hub?.posts ?? []).map(normalisePostRow).filter(Boolean),
    [hub],
  );
  const people = hub?.people ?? [];
  const programmes = hub?.programmes ?? [];
  const dimensions = (hub?.dimensions ?? [])
    .filter((d) => Number(d?.count ?? 0) >= COMMUNITY_DIMENSION_MIN_FOR_HUB);

  const offline = hub?.error === 'offline' || (hub?.fromCache && hub?.error);

  function openProfile(card) {
    if (card?.handle) navigation.navigate('CommunityProfile', { handle: card.handle });
  }

  function openLibraryPlan(id) {
    navigateCrossTab(navigation, 'PlansTab', 'PlanDetail', { planId: id, isLibrary: true });
  }

  async function react(item) {
    try {
      await reactToPost(item.post.id, !item.myReaction);
      setHub((prev) => (prev ? {
        ...prev,
        posts: (prev.posts ?? []).map((row) => {
          const n = normalisePostRow(row);
          if (n?.post?.id !== item.post.id) return row;
          const on = !item.myReaction;
          const post = {
            ...n.post,
            reaction_count: Math.max(0, Number(n.post.reaction_count ?? 0) + (on ? 1 : -1)),
          };
          return { post, author: n.author, my_reaction: on };
        }),
      } : prev));
    } catch (_e) {
      // A reaction that did not land is not worth interrupting anyone for;
      // the next refresh shows the truth.
    }
  }

  const headerRight = (
    <View style={styles.headerActions}>
      <Pressable
        onPress={() => navigation.navigate('CommunitySearch')}
        style={[styles.headerBtn, { backgroundColor: t.colors.surface2, borderColor: t.colors.border }]}
        accessibilityRole="button"
        accessibilityLabel="Search Community"
      >
        <Ionicons name="search-outline" size={18} color={t.colors.primary} />
      </Pressable>
      {joined ? (
        <Pressable
          onPress={() => navigation.navigate('CommunityActivity')}
          style={[styles.headerBtn, { backgroundColor: t.colors.surface2, borderColor: t.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={hasUnseen(me) ? 'Activity, new activity' : 'Activity'}
        >
          <Ionicons name="notifications-outline" size={18} color={t.colors.primary} />
          {hasUnseen(me) ? (
            <View style={[styles.dot, { backgroundColor: t.colors.primary, borderColor: t.colors.background }]} />
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );

  const header = (
    <View style={styles.header}>
      {legacyCardShown ? (
        <Card style={styles.block}>
          <Text style={[styles.blockTitle, { ...t.type.bodyStrong, color: t.colors.textPrimary }]}>
            Partner invites have moved
          </Text>
          <Text style={[styles.blockBody, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            Training partners are now part of Community. Search for the person who sent this and follow each other.
          </Text>
          <View style={styles.blockActions}>
            <Button
              variant="primary"
              size="sm"
              fullWidth={false}
              title="Find people"
              onPress={() => navigation.navigate('CommunitySearch')}
              accessibilityLabel="Find people in Community"
            />
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              title="Dismiss"
              onPress={() => setLegacyCardShown(false)}
              accessibilityLabel="Dismiss the partner invite notice"
            />
          </View>
        </Card>
      ) : null}

      {!joined ? (
        <Card elevated style={styles.block}>
          <Text style={[styles.heroTitle, { ...t.type.h2, color: t.colors.textPrimary }]}>
            Programmes, training stories and people
          </Text>
          <Text style={[styles.heroBody, { ...t.type.body, color: t.colors.textSecondary }]}>
            Follow lifters you rate, share what you build, and use or adapt other people&apos;s programmes. Nothing about your body, food or coaching is ever shared.
          </Text>
          <PrivacyReceipt />
          <Button
            variant="emphatic"
            title="Create my profile"
            onPress={() => navigation.navigate('CommunityJoin')}
            accessibilityLabel="Create my Community profile"
          />
          <Button
            variant="secondary"
            title="Browse first"
            onPress={() => setBrowsing(true)}
            accessibilityLabel="Browse Community first"
          />
        </Card>
      ) : (
        <SegmentedControl
          options={[{ label: 'Following', value: 'following' }, { label: 'Discover', value: 'discover' }]}
          value={shown}
          onChange={setSegment}
          accessibilityLabel="Community view"
        />
      )}

      {offline ? (
        <Text style={[styles.offline, { ...t.type.caption, color: t.colors.textMuted }]}>
          Showing what you last saw. You are offline.
        </Text>
      ) : null}

      {shown === 'discover' ? (
        <>
          {programmes.length || volyume.length ? (
            <View style={styles.section}>
              <SectionLabel>Programmes</SectionLabel>
              {programmes.map((row) => (
                <ProgrammeTile
                  key={row.id ?? row.programme?.id}
                  programme={row.programme ?? row}
                  creator={row.creator ?? null}
                  onPress={() => navigation.navigate('CommunityProgramme', { id: (row.programme ?? row).id })}
                />
              ))}
              {volyume.map((p) => (
                <ProgrammeTile
                  key={`volyume-${p.id}`}
                  programme={p}
                  creator={null}
                  volyume
                  onPress={() => openLibraryPlan(p.id)}
                />
              ))}
            </View>
          ) : null}

          {people.length ? (
            <View style={styles.section}>
              <SectionLabel>People you may want to follow</SectionLabel>
              {people.map((row) => (
                <ProfileCard
                  key={(row.card ?? row).user_id}
                  card={row.card ?? row}
                  reasons={row.reasons ?? []}
                  onPress={() => openProfile(row.card ?? row)}
                  showFollow={joined}
                />
              ))}
            </View>
          ) : null}

          {dimensions.length ? (
            <View style={styles.section}>
              <SectionLabel>Around you</SectionLabel>
              {dimensions.map((d) => (
                <DimensionRow
                  key={`${d.kind}:${d.key}`}
                  dimension={d}
                  onPress={() => navigation.navigate('CommunityDimension', {
                    kind: d.kind, key: d.key, label: d.label,
                  })}
                />
              ))}
            </View>
          ) : null}

          {posts.length ? <SectionLabel>Recent training stories</SectionLabel> : null}
        </>
      ) : null}

      {shown === 'following' && people.length ? (
        <View style={styles.section}>
          <SectionLabel>People you may want to follow</SectionLabel>
          {people.slice(0, 5).map((row) => (
            <ProfileCard
              key={(row.card ?? row).user_id}
              card={row.card ?? row}
              reasons={row.reasons ?? []}
              onPress={() => openProfile(row.card ?? row)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );

  const empty = loading || meLoading ? (
    <View style={styles.loading}>
      <ActivityIndicator color={t.colors.primary} />
    </View>
  ) : shown === 'following' ? (
    <EmptyState
      icon="people-outline"
      title="Nothing here yet"
      text="Follow a few people and their training stories will appear here."
      actionLabel="Find people"
      onAction={() => navigation.navigate('CommunitySearch')}
      actionAccessibilityLabel="Find people to follow"
    />
  ) : programmes.length || people.length || dimensions.length ? null : (
    <EmptyState
      icon="sparkles-outline"
      title="You are early"
      text="Be the first to publish a programme or post a training story. Volyume's own programmes are below."
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Community" right={headerRight} />
      <FlashList
        data={posts}
        keyExtractor={(item) => item.post.id}
        renderItem={({ item }) => (
          <PostCard
            post={item.post}
            author={item.author}
            myReaction={item.myReaction}
            onPress={() => navigation.navigate('CommunityPost', { id: item.post.id })}
            onReact={() => react(item)}
            onOpenAuthor={() => openProfile(item.author)}
          />
        )}
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
            onRefresh={onRefresh}
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { gap: spacing.lg, marginBottom: spacing.md },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: circle(34),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: circle(8),
    borderWidth: 1,
  },
  block: { gap: spacing.md },
  blockTitle: { ...type.bodyStrong, color: colors.textPrimary },
  blockBody: { ...type.bodySm, color: colors.textSecondary },
  blockActions: { flexDirection: 'row', gap: spacing.sm },
  heroTitle: { ...type.h2, color: colors.textPrimary },
  heroBody: { ...type.body, color: colors.textSecondary },
  section: { gap: spacing.md },
  offline: { ...type.caption, color: colors.textMuted },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  footer: { paddingVertical: spacing.lg },
});
