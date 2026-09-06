/**
 * ReportSheet (blueprint sections 2, 6; SD-11)
 *
 * Report a profile, post, comment or programme. The six reasons are the
 * server's own list (`REPORT_REASONS`), rendered as radio chips, with an
 * optional detail field.
 *
 * "Harmful body or eating content" is one of the six and is flagged
 * priority server-side, so an ED-adjacent report is never queued behind
 * spam. Nothing about that is decided here; the reason list is simply
 * never edited down.
 *
 * Props:
 *   visible      controlled, like every sheet in the app
 *   onClose      close without reporting
 *   targetKind   'profile' | 'post' | 'comment' | 'programme'
 *   targetId     the row being reported
 *   onReported   called after the report is filed
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet from '../BottomSheet';
import Button from '../Button';
import Chip from '../Chip';
import TextField from '../TextField';
import { useToast } from '../Toast';
import { spacing, type, colors } from '../../styles/theme';
import useTheme from '../../hooks/useTheme';
import { REPORT_REASONS, REPORT_DETAIL_MAX, reportContent } from '../../lib/community';

const REFUSALS = {
  offline: 'You are offline. Try again when you have a connection.',
  already_reported: 'You have already reported this. A moderator is looking at it.',
  rate_limited: 'That is a lot of reports for one day. Try again tomorrow.',
  no_profile: 'Create your Community profile first.',
  not_found: 'This is no longer available.',
};

export default function ReportSheet({ visible, onClose, targetKind, targetId, onReported }) {
  const t = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  // A fresh sheet every time: a reason left selected from a previous
  // report is the wrong default for a different piece of content.
  useEffect(() => {
    if (visible) { setReason(null); setDetail(''); setBusy(false); }
  }, [visible]);

  async function send() {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await reportContent({ targetKind, targetId, reason, detail: detail.trim() || null });
      toast.show('Thank you. A moderator will look at this.');
      onReported?.();
      onClose?.();
    } catch (e) {
      toast.show(REFUSALS[e?.code] ?? 'Could not send that report just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="Report">
      <View style={styles.body}>
        <Text style={[styles.title, { ...t.type.h3, color: t.colors.textPrimary }]}>Report this</Text>
        <Text style={[styles.intro, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
          Pick the closest reason. Reports go straight to a moderator queue.
        </Text>
        <View style={styles.chips}>
          {Object.entries(REPORT_REASONS).map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              selected={reason === key}
              accessibilityRole="radio"
              onPress={() => setReason(key)}
            />
          ))}
        </View>
        <TextField
          label="Anything else we should know (optional)"
          value={detail}
          onChangeText={(v) => setDetail(v.slice(0, REPORT_DETAIL_MAX))}
          multiline
          accessibilityLabel="Report detail"
        />
        <Button
          variant="primary"
          title="Send report"
          disabled={!reason}
          loading={busy}
          onPress={send}
          accessibilityLabel="Send report"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.md },
  title: { ...type.h3, color: colors.textPrimary },
  intro: { ...type.bodySm, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
});
