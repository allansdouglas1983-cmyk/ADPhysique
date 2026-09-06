/**
 * CommunityModerationScreen (blueprint sections 3, 6; SD-11)
 *
 * The moderator queue, in the app. Moderation ships with the feature,
 * not after it: reports land here, "Harmful body or eating content" is
 * flagged priority by the server so it is never queued behind spam, and
 * every action writes an audit row server-side.
 *
 * The screen is only reachable for a moderator. Anyone else who arrives
 * here (an old link, a shared device) sees a plain, calm note rather
 * than an error.
 *
 * The Actioned tab IS the audit view: reports that have been acted on,
 * with what was done and the note the moderator left. The note is
 * captured in the actions sheet and written to
 * `community_moderation_log.note` server-side.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// E8 (founder decision 2026-07-02): every list in the app renders
// through FlashList, never an unrecycled FlatList. The props are the
// blueprint's own list contract (keyExtractor, onEndReached paging,
// pull-to-refresh, an empty state); the list underneath recycles.
import { FlashList } from '@shopify/flash-list';
import BackHeader from '../components/BackHeader';
import BottomSheet from '../components/BottomSheet';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import SegmentedControl from '../components/SegmentedControl';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useCommunityMe from '../hooks/useCommunityMe';
import { colors, spacing, radius, type } from '../styles/theme';
import { calendarRelativeLabel } from '../lib/workoutDate';
import {
  moderationQueue, moderate, MODERATION_ACTIONS, REPORT_REASONS,
} from '../lib/community';

const PAGE = 30;

// The audit note a moderator may leave with an action. Optional, short,
// and written to `community_moderation_log.note` by `community_moderate`
// (migrate_160_community.sql), which is what makes the rules screen's
// "who did it and why" true (product review 2026-09-06, items 19 and 22).
export const MODERATION_NOTE_MAX = 300;

// The action list, in the order a moderator works through it: dismiss
// first (most reports are nothing), then content, then the account.
const ACTION_LABELS = {
  dismiss: 'Dismiss the report',
  hide_content: 'Hide the content',
  unhide_content: 'Unhide the content',
  delete_content: 'Delete the content',
  restrict_account: 'Restrict the account',
  unrestrict_account: 'Remove the restriction',
  suspend_account: 'Suspend the account',
  unsuspend_account: 'Remove the suspension',
};

// The queue is read by a person, so the target is named in words, not by
// the column's enum value.
const TARGET_LABELS = {
  profile: 'Profile',
  post: 'Story',
  comment: 'Comment',
  programme: 'Programme',
};

/** "1 report" / "4 reports". */
export function reportCountLabel(count) {
  const n = Number(count) || 0;
  return n === 1 ? '1 report' : `${n} reports`;
}

function whenLabel(createdAt) {
  const ms = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt);
  return Number.isFinite(ms) ? calendarRelativeLabel(ms) : '';
}

export default function CommunityModerationScreen() {
  const t = useTheme();
  const toast = useToast();
  const { me, loading: meLoading } = useCommunityMe();
  const isModerator = !!me?.is_moderator;

  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isModerator) { setLoading(false); return; }
    setLoading(true);
    try {
      const out = await moderationQueue(status, { limit: PAGE });
      setRows(Array.isArray(out) ? out : (out?.reports ?? []));
    } catch (_e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, isModerator]);

  useEffect(() => { load(); }, [load]);

  async function act(action) {
    if (!active || busy) return;
    setBusy(true);
    try {
      // The note is the "why" in the audit row. Optional: an empty one is
      // sent as null rather than as a blank string.
      await moderate(active.id, action, note.trim() || null);
      setRows((prev) => prev.filter((r) => r.id !== active.id));
      toast.show('Recorded');
      setActive(null);
      setNote('');
    } catch (_e) {
      toast.show('Could not do that just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!meLoading && !isModerator) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
        <BackHeader title="Moderation" />
        <View style={styles.content}>
          <EmptyState
            icon="shield-outline"
            title="Not available"
            text="The moderator queue is only open to moderators."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Moderation" />
      <View style={styles.controls}>
        <SegmentedControl
          options={[
            { label: 'Open', value: 'open' },
            // This tab IS the audit view the blueprint asks for: it is
            // what was done, by whom, with the note that was left.
            { label: 'Actioned (audit log)', value: 'actioned' },
          ]}
          value={status}
          onChange={setStatus}
          accessibilityLabel="Queue"
        />
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card
            style={styles.report}
            onPress={status === 'open' ? () => setActive(item) : undefined}
            accessibilityLabel={`Report: ${REPORT_REASONS[item.reason] ?? item.reason}`}
          >
              <View style={styles.reportTop}>
                <Chip label={REPORT_REASONS[item.reason] ?? item.reason} accessibilityRole="text" />
                {item.priority ? <Chip label="Priority" selected accessibilityRole="text" /> : null}
                <Chip label={TARGET_LABELS[item.target_kind] ?? 'Content'} accessibilityRole="text" />
              </View>
              {item.preview ? (
                <Text
                  style={[styles.preview, { ...t.type.bodySm, color: t.colors.textPrimary }]}
                  numberOfLines={4}
                >
                  {item.preview}
                </Text>
              ) : null}
              {item.detail ? (
                <Text style={[styles.detail, { ...t.type.caption, color: t.colors.textSecondary }]} numberOfLines={3}>
                  {item.detail}
                </Text>
              ) : null}
              <Text style={[styles.meta, { ...t.type.caption, color: t.colors.textMuted }]}>
                {[
                  item.report_count ? reportCountLabel(item.report_count) : null,
                  whenLabel(item.created_at),
                  item.resolution ? `Resolution: ${ACTION_LABELS[item.resolution] ?? item.resolution}` : null,
                  // The moderator and the note are rendered when the row
                  // carries them, under the column names the audit log
                  // itself uses (`community_moderation_log.moderator_id` /
                  // `.note`). `community_moderation_queue` does not return
                  // either today, so nothing is invented here: the tab
                  // shows them the moment the queue does.
                  item.moderator_handle ? `by @${item.moderator_handle}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
              {item.note ? (
                <Text style={[styles.detail, { ...t.type.caption, color: t.colors.textSecondary }]}>
                  {`Note: ${item.note}`}
                </Text>
              ) : null}
          </Card>
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.loading}><ActivityIndicator color={t.colors.primary} /></View>
        ) : (
          <EmptyState
            icon="checkmark-circle-outline"
            title={status === 'open' ? 'Nothing waiting' : 'Nothing actioned yet'}
            text={status === 'open'
              ? 'Reports appear here as soon as they are filed.'
              : 'Reports you have acted on appear here with what was done.'}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => { /* the queue is one page; act on it rather than paging past it */ }}
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

      <BottomSheet
        visible={!!active}
        onClose={() => { setActive(null); setNote(''); }}
        accessibilityLabel="Moderation actions"
      >
        <View style={styles.sheet}>
          <Text style={[styles.sheetTitle, { ...t.type.h3, color: t.colors.textPrimary }]}>
            {active ? (REPORT_REASONS[active.reason] ?? active.reason) : 'Actions'}
          </Text>
          <Text style={[styles.detail, { ...t.type.caption, color: t.colors.textSecondary }]}>
            Every action is recorded with who did it, when, and the note you leave here.
          </Text>
          <TextInput
            style={[styles.note, {
              backgroundColor: t.colors.inputBg,
              borderColor: t.colors.border,
              color: t.colors.textPrimary,
              ...t.type.bodySm,
            }]}
            value={note}
            onChangeText={setNote}
            maxLength={MODERATION_NOTE_MAX}
            multiline
            placeholder="Note for the record (optional)"
            placeholderTextColor={t.colors.textDisabled}
            accessibilityLabel="Note for the record"
          />
          {MODERATION_ACTIONS.map((action) => (
            <Button
              key={action}
              variant={action === 'dismiss' ? 'primary' : 'secondary'}
              title={ACTION_LABELS[action] ?? action}
              disabled={busy}
              onPress={() => act(action)}
              accessibilityLabel={ACTION_LABELS[action] ?? action}
            />
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  controls: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  report: { gap: spacing.sm },
  reportTop: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
  preview: { ...type.bodySm, color: colors.textPrimary },
  detail: { ...type.caption, color: colors.textSecondary },
  meta: { ...type.caption, color: colors.textMuted },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  note: {
    minHeight: 72, textAlignVertical: 'top', borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...type.bodySm,
  },
  sheet: { gap: spacing.sm, paddingBottom: spacing.md },
  sheetTitle: { ...type.h3, color: colors.textPrimary },
});
