/**
 * CommunityPostScreen — one training story and its thread (blueprint
 * section 6, `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`).
 *
 * The card, the comments, a field to add one, and the two things a reader
 * may need: report someone else's story, delete their own. The reaction is
 * a single "Respect" tap with a count (lead visual review 2026-09-06,
 * ruling 3); there is no other engagement surface, and no ranking anywhere.
 *
 * The story renders through `PostCard`, which reads only the allow-listed
 * payload keys for the kind, so nothing about a person's body, food or
 * coaching can appear here.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import BackHeader from '../components/BackHeader';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import { appAlert } from '../components/AppAlert';
import { useToast } from '../components/Toast';
import PostCard from '../components/community/PostCard';
import CommentRow, { CommentComposer } from '../components/community/CommentRow';
import ReportSheet from '../components/community/ReportSheet';
import useTheme from '../hooks/useTheme';
import useAppStore from '../store/useAppStore';
import { spacing, type, hitSlop, iconSize } from '../styles/theme';
import { touchTarget } from '../styles/layout';
import * as haptics from '../lib/haptics';
import { logError } from '../lib/errorLog';
import {
  getPost, reactToPost, deletePost, listComments, addComment, deleteComment,
  notifyCommunityEvent,
} from '../lib/community';

export const POST_OFFLINE_LINE = 'Volyume could not reach Community just now. Check your connection and try again.';

export function postErrorLine(code) {
  if (code === 'offline') return POST_OFFLINE_LINE;
  if (code === 'not_found') return 'This story is no longer here.';
  if (code === 'not_allowed') return "This story is only shared with the author's followers.";
  return 'Volyume could not open this story just now. Try again in a moment.';
}

export default function CommunityPostScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const id = route?.params?.id ?? null;
  const user = useAppStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [myReaction, setMyReaction] = useState(false);
  const [comments, setComments] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [reportVisible, setReportVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setErrorCode('not_found'); return; }
    setLoading(true);
    try {
      const payload = await getPost(id);
      setData(payload ?? null);
      setMyReaction(!!payload?.my_reaction);
      setErrorCode(null);
    } catch (e) {
      setErrorCode(e?.code ?? 'unavailable');
    } finally {
      setLoading(false);
    }
    try {
      const page = await listComments('post', id);
      setComments(Array.isArray(page?.comments) ? page.comments : []);
      setCursor(page?.cursor ?? null);
    } catch (_e) {
      setComments([]);
      setCursor(null);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMoreComments = useCallback(async () => {
    if (!cursor || !id) return;
    try {
      const page = await listComments('post', id, { cursor });
      setComments((prev) => [...prev, ...(Array.isArray(page?.comments) ? page.comments : [])]);
      setCursor(page?.cursor ?? null);
    } catch (_e) { /* best effort: the page the reader already has stays */ }
  }, [cursor, id]);

  const post = data?.post ?? null;
  const author = data?.author ?? null;
  const mine = !!post && post.author_id === user?.id;

  async function handleReact(next) {
    if (!post) return;
    haptics.selection();
    // Optimistic: a Respect is a single tap and the count is the only thing
    // that moves. A failure puts it straight back rather than leaving the
    // reader looking at a state the server never accepted.
    const previous = myReaction;
    setMyReaction(next);
    setData((prev) => (prev ? {
      ...prev,
      post: {
        ...prev.post,
        reaction_count: Math.max(0, Number(prev.post.reaction_count ?? 0) + (next ? 1 : -1)),
      },
    } : prev));
    try {
      await reactToPost(post.id, next);
      if (next) notifyCommunityEvent('reaction', post.author_id, post.id);
    } catch (_e) {
      setMyReaction(previous);
      setData((prev) => (prev ? {
        ...prev,
        post: {
          ...prev.post,
          reaction_count: Math.max(0, Number(prev.post.reaction_count ?? 0) + (next ? -1 : 1)),
        },
      } : prev));
      toast.show('That did not save. Please try again.', { variant: 'error' });
    }
  }

  async function handleAddComment(body) {
    if (!post) return false;
    try {
      await addComment('post', post.id, body);
      notifyCommunityEvent('comment', post.author_id, post.id);
      const page = await listComments('post', post.id);
      setComments(Array.isArray(page?.comments) ? page.comments : []);
      setCursor(page?.cursor ?? null);
      return true;
    } catch (e) {
      toast.show(
        e?.code === 'offline' ? POST_OFFLINE_LINE : 'That comment did not send. Please try again.',
        { variant: 'error' },
      );
      return false;
    }
  }

  function handleDeleteComment(comment) {
    appAlert('Delete this comment?', 'It is removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(comment.id);
            setComments((prev) => prev.filter((c) => c.id !== comment.id));
          } catch (_e) {
            toast.show('That did not delete. Please try again.', { variant: 'error' });
          }
        },
      },
    ]);
  }

  function handleDeletePost() {
    if (!post) return;
    appAlert('Delete this story?', 'It is removed for everyone. Your training is untouched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            toast.show('Story deleted', { variant: 'success' });
            navigation.goBack();
          } catch (e) {
            logError('CommunityPostScreen.handleDeletePost', e, { postId: post.id });
            toast.show('That did not delete. Please try again.', { variant: 'error' });
          }
        },
      },
    ]);
  }

  const openAuthor = author?.user_id
    ? () => navigation.navigate('CommunityProfile', { userId: author.user_id, handle: author.handle })
    : undefined;

  const header = (
    <View style={styles.header}>
      <PostCard
        post={post}
        author={author}
        myReaction={myReaction}
        onReact={handleReact}
        onOpenAuthor={openAuthor}
      />
      <SectionLabel style={styles.commentsLabel}>Comments</SectionLabel>
      {comments.length === 0 ? (
        <Text style={[styles.noComments, { color: t.colors.textMuted }]}>
          No comments yet. Say something useful about the training.
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader
        title="Story"
        right={post ? (
          <TouchableOpacity
            onPress={() => { haptics.selection(); if (mine) handleDeletePost(); else setReportVisible(true); }}
            hitSlop={hitSlop}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel={mine ? 'Delete this story' : 'Report this story'}
          >
            <Ionicons
              name={mine ? 'trash-outline' : 'ellipsis-horizontal'}
              size={iconSize.md}
              color={t.colors.textSecondary}
            />
          </TouchableOpacity>
        ) : null}
      />
      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={t.colors.primary} /></View>
      ) : !post ? (
        <View style={styles.centre}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Not available"
            text={postErrorLine(errorCode)}
            actionLabel="Try again"
            onAction={load}
          />
        </View>
      ) : (
        <FlashList
          data={comments}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={88}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          onEndReachedThreshold={0.4}
          onEndReached={loadMoreComments}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              author={item.author}
              canDelete={!!item.mine || mine}
              onDelete={() => handleDeleteComment(item)}
              onOpenAuthor={item.author?.user_id
                ? () => navigation.navigate('CommunityProfile', {
                  userId: item.author.user_id, handle: item.author.handle,
                })
                : undefined}
              onReport={item.mine ? undefined : () => setReportVisible(true)}
            />
          )}
          ListFooterComponent={<CommentComposer onSubmit={handleAddComment} />}
        />
      )}
      <ReportSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetKind="post"
        targetId={post?.id ?? null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  commentsLabel: { marginTop: spacing.lg },
  noComments: { ...type.caption },
  headerAction: {
    width: touchTarget.minimum, height: touchTarget.minimum,
    alignItems: 'flex-end', justifyContent: 'center',
  },
});
