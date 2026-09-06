/**
 * CommunityProgrammeScreen — one published programme, read by someone else
 * (blueprint section 6, `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`).
 *
 * What is on this screen is STRUCTURE: days, exercises, sets, reps, rest and
 * the creator's own exercise notes. No weight of the creator's is published
 * with a programme, and nothing here reads one.
 *
 * Two choices, and the lead visual review (2026-09-06, ruling 2) settled
 * which leads: "Adapt for me" is the `primary` with the `options-outline`
 * glyph, "Use as-is" is the `secondary`. Neither is emphatic; the emphatic
 * fill belongs to "Save to my plans" on the adapt screen, one step later,
 * where the plan is actually written.
 *
 * "Use as-is" copies the programme into the reader's plans and activates
 * nothing. The confirmation says so in those words, because a reader who
 * expects a copy and gets their live plan replaced has lost real work.
 */

import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Share,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import { appAlert } from '../components/AppAlert';
import { useToast } from '../components/Toast';
import ProfileCard from '../components/community/ProfileCard';
import ProgrammeStructure from '../components/community/ProgrammeStructure';
import CommentRow, { CommentComposer } from '../components/community/CommentRow';
import ReportSheet from '../components/community/ReportSheet';
import useTheme from '../hooks/useTheme';
import useAppStore from '../store/useAppStore';
import { spacing, type, hitSlop, iconSize } from '../styles/theme';
import { touchTarget } from '../styles/layout';
import * as haptics from '../lib/haptics';
import { logError } from '../lib/errorLog';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import {
  getCommunityProgramme, recordProgrammeUse, listComments, addComment, deleteComment,
  importSnapshotAsPlan, snapshotStats, notifyCommunityEvent,
  COMMUNITY_STYLE_KEYS, programmeUrl,
} from '../lib/community';

export const OFFLINE_LINE = 'Volyume could not reach Community just now. Check your connection and try again.';

/** The calm line for a refusal code. Never a raw message, never a stack. */
export function programmeErrorLine(code) {
  if (code === 'offline') return OFFLINE_LINE;
  if (code === 'not_found') return 'This programme is no longer shared.';
  if (code === 'not_allowed') return "This programme is only shared with the creator's followers.";
  return 'Volyume could not open this programme just now. Try again in a moment.';
}

export default function CommunityProgrammeScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const id = route?.params?.id ?? null;
  const user = useAppStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [comments, setComments] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setErrorCode('not_found'); return; }
    setLoading(true);
    try {
      const payload = await getCommunityProgramme(id);
      setData(payload ?? null);
      setErrorCode(null);
    } catch (e) {
      setErrorCode(e?.code ?? 'unavailable');
    } finally {
      setLoading(false);
    }
    try {
      const page = await listComments('programme', id);
      setComments(Array.isArray(page?.comments) ? page.comments : []);
      setCursor(page?.cursor ?? null);
    } catch (_e) {
      // The programme is the content. A comment page that will not load is
      // never the reason to fail the screen.
      setComments([]);
      setCursor(null);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMoreComments = useCallback(async () => {
    if (!cursor || !id) return;
    try {
      const page = await listComments('programme', id, { cursor });
      setComments((prev) => [...prev, ...(Array.isArray(page?.comments) ? page.comments : [])]);
      setCursor(page?.cursor ?? null);
    } catch (_e) { /* best effort: the page the reader already has stays */ }
  }, [cursor, id]);

  const programme = data?.programme ?? null;
  const creator = data?.creator ?? null;
  const snapshot = programme?.snapshot ?? null;
  const stats = snapshot ? snapshotStats(snapshot) : null;

  function handleUseAsIs() {
    if (!programme || !user?.id || busyRef.current) return;
    haptics.selection();
    appAlert(
      'Copy this programme?',
      'It goes to your plans as a new programme. Nothing is activated and your current plan is untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy to my plans',
          onPress: async () => {
            busyRef.current = true;
            setBusy(true);
            try {
              const result = await importSnapshotAsPlan(user.id, snapshot, {
                communityId: programme.id, mode: 'use',
              });
              if (!result?.plan?.id) throw new Error('Import failed.');
              recordProgrammeUse(programme.id, 'use').catch(() => {
                // Best effort: the copy belongs to this user either way, and
                // the creator's counter is never worth failing it for.
              });
              notifyCommunityEvent('programme_used', programme.owner_id, programme.id);
              toast.show('Added to your plans', { variant: 'success' });
              navigateCrossTab(navigation, 'PlansTab', 'PlanDetail', { planId: result.plan.id });
            } catch (e) {
              logError('CommunityProgrammeScreen.handleUseAsIs', e, { programmeId: programme.id });
              toast.show('That did not copy. Please try again.', { variant: 'error' });
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function handleShareLink() {
    if (!programme?.id) return;
    haptics.selection();
    try {
      await Share.share({ message: programmeUrl(programme.id) });
    } catch (_e) { /* the user dismissed the share sheet */ }
  }

  async function handleAddComment(body) {
    if (!programme?.id) return false;
    try {
      await addComment('programme', programme.id, body);
      const page = await listComments('programme', programme.id);
      setComments(Array.isArray(page?.comments) ? page.comments : []);
      setCursor(page?.cursor ?? null);
      return true;
    } catch (e) {
      toast.show(
        e?.code === 'offline' ? OFFLINE_LINE : 'That comment did not send. Please try again.',
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

  // Deduplicated: the "Circuits" STYLE and a programme that actually contains
  // circuits are two different facts that share one word, and a chip row that
  // said "Circuits · Circuits" would read as a rendering fault.
  const chipSet = [];
  const addChip = (label) => { if (label && !chipSet.includes(label)) chipSet.push(label); };
  if (programme?.style_key) addChip(COMMUNITY_STYLE_KEYS[programme.style_key]);
  if (programme?.days_per_week) addChip(`${programme.days_per_week} days`);
  if (programme?.exercise_count) addChip(`${programme.exercise_count} exercises`);
  if (programme?.has_circuits || stats?.hasCircuits) addChip('Circuits');
  const chips = chipSet;

  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, { color: t.colors.textPrimary }]}>{programme?.title ?? 'Programme'}</Text>
      {creator ? (
        <ProfileCard
          card={creator}
          compact
          onPress={() => navigation.navigate('CommunityProfile', {
            userId: creator.user_id, handle: creator.handle,
          })}
        />
      ) : null}
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((label) => <Chip key={label} label={label} />)}
        </View>
      ) : null}
      {programme?.description ? (
        <Text style={[styles.description, { color: t.colors.textSecondary }]}>{programme.description}</Text>
      ) : null}
      {Number(programme?.use_count) > 0 ? (
        <Text style={[styles.useCount, { color: t.colors.textMuted }]}>
          {`Used by ${Number(programme.use_count)}`}
        </Text>
      ) : null}
      <ProgrammeStructure snapshot={snapshot} />
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
        title="Programme"
        right={programme ? (
          <TouchableOpacity
            onPress={() => { haptics.selection(); setReportVisible(true); }}
            hitSlop={hitSlop}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Report this programme"
          >
            <Ionicons name="ellipsis-horizontal" size={iconSize.md} color={t.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      />
      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={t.colors.primary} /></View>
      ) : !programme ? (
        <View style={styles.centre}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Not available"
            text={programmeErrorLine(errorCode)}
            actionLabel="Try again"
            onAction={load}
          />
        </View>
      ) : (
        <>
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
                canDelete={!!item.mine || programme.owner_id === user?.id}
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
          <View style={[styles.actionBar, {
            backgroundColor: t.colors.surface, borderTopColor: t.colors.borderSubtle,
          }]}
          >
            <View style={styles.actionRow}>
              <Button
                title="Adapt for me"
                icon="options-outline"
                onPress={() => {
                  haptics.selection();
                  navigation.navigate('CommunityAdapt', { id: programme.id });
                }}
                fullWidth={false}
                style={styles.actionButton}
              />
              <Button
                title="Use as-is"
                variant="secondary"
                onPress={handleUseAsIs}
                loading={busy}
                disabled={busy}
                fullWidth={false}
                style={styles.actionButton}
              />
            </View>
            <Button
              title="Share link"
              variant="tertiary"
              size="sm"
              icon="share-social-outline"
              onPress={handleShareLink}
            />
          </View>
        </>
      )}
      <ReportSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetKind="programme"
        targetId={programme?.id ?? null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  title: { ...type.h2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
  description: { ...type.bodySm },
  useCount: { ...type.caption },
  commentsLabel: { marginTop: spacing.lg },
  noComments: { ...type.caption },
  headerAction: {
    width: touchTarget.minimum, height: touchTarget.minimum,
    alignItems: 'flex-end', justifyContent: 'center',
  },
  actionBar: { borderTopWidth: 1, padding: spacing.lg, gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
});
