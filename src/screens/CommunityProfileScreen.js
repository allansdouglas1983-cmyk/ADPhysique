/**
 * CommunityProfileScreen (blueprint sections 2, 6; SD-05)
 *
 * One person as a lifter: the facts they chose, what they have posted
 * and what they have published. Nothing else about them exists here.
 *
 * The three states that are not "a profile with content" are all real
 * destinations, not errors: a followers-only profile you do not follow
 * says so and offers the follow; a person you have blocked says so and
 * offers the unblock; your own profile swaps the follow control for
 * Edit and Share link.
 *
 * Followers and following open in a sheet rather than a pushed screen:
 * the list is transient content about the profile you are already on,
 * which is what the app's sheets are for.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ActivityIndicator, Pressable, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// E8 (founder decision 2026-07-02): every list in the app renders
// through FlashList, never an unrecycled FlatList. The props are the
// blueprint's own list contract (keyExtractor, onEndReached paging,
// pull-to-refresh, an empty state); the list underneath recycles.
import { FlashList } from '@shopify/flash-list';
import Ionicons from '@expo/vector-icons/Ionicons';
import BackHeader from '../components/BackHeader';
import BottomSheet from '../components/BottomSheet';
import Button from '../components/Button';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import SegmentedControl from '../components/SegmentedControl';
import ProfileAvatarMark from '../components/ProfileAvatarMark';
import PostCard from '../components/community/PostCard';
import ProfileCard from '../components/community/ProfileCard';
import ProgrammeTile from '../components/community/ProgrammeTile';
import FollowButton from '../components/community/FollowButton';
import ProfileMenuSheet from '../components/community/ProfileMenuSheet';
import ReportSheet from '../components/community/ReportSheet';
import { factLabels, placeLine } from '../components/community/ProfileCard';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { colors, spacing, type, circle } from '../styles/theme';
import {
  getProfile, listFollows, profileUrl, reactToPost, unblockUser,
} from '../lib/community';

/**
 * The same normalisation the hub does: the RPCs hand back
 * `{post, author, my_reaction}`, and a row read straight out of a list
 * may be the post itself. Kept local to each screen that renders posts
 * rather than reaching across into another screen's module.
 */
function normalisePostRow(row, fallbackAuthor) {
  if (!row) return null;
  const post = row.post ?? row;
  return {
    post,
    author: row.author ?? post.author ?? fallbackAuthor ?? null,
    myReaction: !!(row.my_reaction ?? post.my_reaction),
  };
}

export default function CommunityProfileScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const { me } = useCommunityMe();
  // The deep link carries `h` (volyume://u/?h=handle); the in-app routes
  // carry `handle` / `userId`. Both resolve to the same read.
  const handle = route?.params?.handle ?? route?.params?.h ?? null;
  const userId = route?.params?.userId ?? route?.params?.uid ?? null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState('posts');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [followsKind, setFollowsKind] = useState(null);
  const [follows, setFollows] = useState([]);
  const [error, setError] = useState(null);

  const card = data?.card ?? null;
  const isMe = !!card && card.user_id === me?.profile?.user_id;
  const viewable = !!data?.viewable;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await getProfile({ handle, userId });
      setData(out);
      setError(null);
    } catch (e) {
      setError(e?.code ?? 'unavailable');
    } finally {
      setLoading(false);
    }
  }, [handle, userId]);

  useEffect(() => { load(); }, [load]);

  const openFollows = useCallback(async (kind) => {
    if (!card?.user_id || !viewable) return;
    setFollowsKind(kind);
    setFollows([]);
    try {
      const rows = await listFollows(card.user_id, kind, { limit: 30 });
      setFollows(Array.isArray(rows) ? rows : []);
    } catch (_e) {
      setFollows([]);
    }
  }, [card, viewable]);

  async function react(item) {
    try {
      await reactToPost(item.post.id, !item.myReaction);
      setData((prev) => (prev ? {
        ...prev,
        posts: (prev.posts ?? []).map((row) => {
          const n = normalisePostRow(row, prev.card);
          if (n?.post?.id !== item.post.id) return row;
          const on = !item.myReaction;
          return {
            post: {
              ...n.post,
              reaction_count: Math.max(0, Number(n.post.reaction_count ?? 0) + (on ? 1 : -1)),
            },
            author: n.author,
            my_reaction: on,
          };
        }),
      } : prev));
    } catch (_e) {
      // Nothing to interrupt anyone with; the next load shows the truth.
    }
  }

  const posts = (data?.posts ?? []).map((r) => normalisePostRow(r, card)).filter(Boolean);
  const programmes = data?.programmes ?? [];
  const facts = card ? factLabels(card) : [];
  const place = card ? placeLine(card) : null;

  const headerRight = card && !isMe ? (
    <Pressable
      onPress={() => setMenuOpen(true)}
      style={[styles.headerBtn, { backgroundColor: t.colors.surface2, borderColor: t.colors.border }]}
      accessibilityRole="button"
      accessibilityLabel="Profile options"
    >
      <Ionicons name="ellipsis-horizontal" size={18} color={t.colors.textPrimary} />
    </Pressable>
  ) : null;

  const hero = card ? (
    <View style={styles.hero}>
      <View style={styles.heroRow}>
        <ProfileAvatarMark
          presetKey={card.avatar_preset}
          displayName={card.display_name || card.handle}
          size={64}
        />
        <View style={styles.heroBody}>
          <Text style={[styles.name, { ...t.type.h2, color: t.colors.textPrimary }]}>
            {card.display_name || card.handle}
          </Text>
          <Text style={[styles.handle, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {`@${card.handle}`}
          </Text>
        </View>
      </View>

      {card.bio ? (
        <Text style={[styles.bio, { ...t.type.body, color: t.colors.textPrimary }]}>{card.bio}</Text>
      ) : null}

      {facts.length ? (
        <View style={styles.chips}>
          {facts.map((label) => <Chip key={label} label={label} accessibilityRole="text" />)}
        </View>
      ) : null}

      {place ? (
        <Text style={[styles.place, { ...t.type.bodySm, color: t.colors.textSecondary }]}>{place}</Text>
      ) : null}

      <View style={styles.counts}>
        <Pressable
          onPress={() => openFollows('followers')}
          disabled={!viewable}
          accessibilityRole="button"
          accessibilityLabel={`${card.follower_count ?? 0} followers`}
        >
          <Text style={[styles.count, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {`${card.follower_count ?? 0} followers`}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => openFollows('following')}
          disabled={!viewable}
          accessibilityRole="button"
          accessibilityLabel={`${card.following_count ?? 0} following`}
        >
          <Text style={[styles.count, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {`${card.following_count ?? 0} following`}
          </Text>
        </Pressable>
      </View>

      {isMe ? (
        <View style={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            fullWidth={false}
            title="Edit profile"
            icon="create-outline"
            onPress={() => navigation.navigate('CommunityEditProfile')}
            accessibilityLabel="Edit my Community profile"
          />
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            title="Share link"
            onPress={async () => {
              try { await Share.share({ message: profileUrl(card.handle) }); }
              catch (_) { /* the user dismissed the share sheet */ }
            }}
            accessibilityLabel="Share my profile link"
          />
        </View>
      ) : card.relationship?.blocked ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            title="Unblock"
            onPress={async () => {
              try {
                await unblockUser(card.user_id);
                toast.show('Unblocked');
                load();
              } catch (_e) {
                toast.show('Could not do that just now.', { variant: 'error' });
              }
            }}
            accessibilityLabel={`Unblock @${card.handle}`}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <FollowButton
            card={card}
            size="md"
            onChange={(relationship) => setData((prev) => (prev
              ? { ...prev, card: { ...prev.card, relationship } }
              : prev))}
          />
        </View>
      )}

      {viewable ? (
        <SegmentedControl
          options={[{ label: 'Stories', value: 'posts' }, { label: 'Programmes', value: 'programmes' }]}
          value={segment}
          onChange={setSegment}
          accessibilityLabel="Profile view"
        />
      ) : null}
    </View>
  ) : null;

  const listData = !card || !viewable ? [] : (segment === 'posts' ? posts : programmes);

  const empty = loading ? (
    <View style={styles.loading}><ActivityIndicator color={t.colors.primary} /></View>
  ) : error ? (
    <EmptyState
      icon="cloud-offline-outline"
      title={error === 'offline' ? 'You are offline' : 'Could not open this profile'}
      text={error === 'offline'
        ? 'Community needs a connection. Your training is unaffected.'
        : 'This profile is not available right now.'}
      actionLabel="Try again"
      onAction={load}
      actionAccessibilityLabel="Try loading this profile again"
    />
  ) : card?.relationship?.blocked ? (
    <EmptyState
      icon="ban-outline"
      title="You have blocked this person"
      text="Neither of you can see the other in Community. You can unblock above."
    />
  ) : !viewable ? (
    <EmptyState
      icon="lock-closed-outline"
      title="This profile is private"
      text="Follow to see their training stories and programmes."
    />
  ) : segment === 'posts' ? (
    <EmptyState
      icon="chatbubble-outline"
      title="No training stories yet"
      text="When they post a session, a personal best or a finished block, it appears here."
    />
  ) : (
    <EmptyState
      icon="list-outline"
      title="No programmes yet"
      text="Programmes they publish appear here, structure only."
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title={card ? `@${card.handle}` : 'Profile'} right={headerRight} />
      <FlashList
        data={listData}
        keyExtractor={(item) => (segment === 'posts' ? item.post.id : (item.programme?.id ?? item.id))}
        renderItem={({ item }) => (segment === 'posts' ? (
          <PostCard
            post={item.post}
            author={item.author}
            myReaction={item.myReaction}
            onPress={() => navigation.navigate('CommunityPost', { id: item.post.id })}
            onReact={() => react(item)}
            onOpenAuthor={() => {}}
          />
        ) : (
          <ProgrammeTile
            programme={item.programme ?? item}
            creator={card}
            onPress={() => navigation.navigate('CommunityProgramme', { id: (item.programme ?? item).id })}
          />
        ))}
        ListHeaderComponent={hero}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => { /* the profile read returns the latest 20; there is no deeper page */ }}
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

      <ProfileMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        card={card}
        onChanged={(relationship) => setData((prev) => (prev
          ? { ...prev, card: { ...prev.card, relationship } }
          : prev))}
        onReport={() => setReportOpen(true)}
      />

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetKind="profile"
        targetId={card?.user_id}
      />

      <BottomSheet
        visible={!!followsKind}
        onClose={() => setFollowsKind(null)}
        accessibilityLabel={followsKind === 'following' ? 'Following' : 'Followers'}
      >
        <View style={styles.sheet}>
          <Text style={[styles.sheetTitle, { ...t.type.h3, color: t.colors.textPrimary }]}>
            {followsKind === 'following' ? 'Following' : 'Followers'}
          </Text>
          {follows.length ? follows.map((row) => (
            <ProfileCard
              key={(row.card ?? row).user_id}
              card={row.card ?? row}
              showFollow={false}
              compact
              onPress={() => {
                setFollowsKind(null);
                navigation.push('CommunityProfile', { handle: (row.card ?? row).handle });
              }}
            />
          )) : (
            <Text style={[styles.sheetEmpty, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
              Nobody yet.
            </Text>
          )}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { gap: spacing.md, marginBottom: spacing.lg },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroBody: { flex: 1, gap: spacing.xxs },
  name: { ...type.h2, color: colors.textPrimary },
  handle: { ...type.bodySm, color: colors.textSecondary },
  bio: { ...type.body, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
  place: { ...type.bodySm, color: colors.textSecondary },
  counts: { flexDirection: 'row', gap: spacing.lg },
  count: { ...type.bodySm, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: circle(34),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  sheet: { gap: spacing.md, paddingBottom: spacing.md },
  sheetTitle: { ...type.h3, color: colors.textPrimary },
  sheetEmpty: { ...type.bodySm, color: colors.textSecondary },
});
