/**
 * ProfileMenuSheet (blueprint sections 2, 6; SD-11)
 *
 * The `...` menu on a profile: Share link, Mute or Unmute, Block or
 * Unblock, Report.
 *
 * Blocking is two-way invisibility and removes both follow edges, so it
 * is confirmed through `appAlert` (the app reserves alerts for exactly
 * this kind of decision). Muting is quiet and reversible, so it is a
 * single tap with a toast. The muted person is never told.
 *
 * Props:
 *   visible    controlled
 *   onClose    close the sheet
 *   card       the profile card this menu is for
 *   onChanged  (relationship) after a mute/unmute/block/unblock
 *   onReport   open the report sheet (the parent owns it, so the report
 *              sheet is not nested inside this one)
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import BottomSheet from '../BottomSheet';
import PressableCard from '../PressableCard';
import { appAlert } from '../AppAlert';
import { useToast } from '../Toast';
import { spacing, type, colors, iconSize } from '../../styles/theme';
import useTheme from '../../hooks/useTheme';
import {
  profileUrl, blockUser, unblockUser, muteUser, unmuteUser,
} from '../../lib/community';

const REFUSALS = {
  offline: 'You are offline. Try again when you have a connection.',
  no_profile: 'Create your Community profile first.',
  not_found: 'This profile is no longer available.',
};

function MenuRow({ icon, label, tone, onPress, accessibilityLabel }) {
  const t = useTheme();
  return (
    <PressableCard
      onPress={onPress}
      style={styles.row}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Ionicons name={icon} size={iconSize.md} color={tone ?? t.colors.textSecondary} />
      <Text style={[styles.rowLabel, { ...t.type.body, color: tone ?? t.colors.textPrimary }]}>
        {label}
      </Text>
    </PressableCard>
  );
}

export default function ProfileMenuSheet({ visible, onClose, card, onChanged, onReport }) {
  const t = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const rel = card?.relationship ?? {};

  async function run(fn, nextRelationship, message) {
    if (busy || !card?.user_id) return;
    setBusy(true);
    try {
      await fn(card.user_id);
      onChanged?.({ ...rel, ...nextRelationship });
      if (message) toast.show(message);
      onClose?.();
    } catch (e) {
      toast.show(REFUSALS[e?.code] ?? 'Could not do that just now.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function confirmBlock() {
    appAlert(
      `Block @${card?.handle ?? 'this person'}?`,
      'Neither of you will see the other in Community, and any follow between you is removed. You can unblock later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => run(blockUser, { blocked: true, following: 'none', followed_by: false }, 'Blocked'),
        },
      ],
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="Profile options">
      <View style={styles.body}>
        <Text style={[styles.title, { ...t.type.h3, color: t.colors.textPrimary }]}>
          {card?.handle ? `@${card.handle}` : 'Options'}
        </Text>
        <MenuRow
          icon="link-outline"
          label="Share link"
          onPress={async () => {
            try { await Share.share({ message: profileUrl(card?.handle) }); }
            catch (_) { /* the user dismissed the share sheet */ }
            onClose?.();
          }}
        />
        {rel.muted ? (
          <MenuRow
            icon="volume-high-outline"
            label="Unmute"
            onPress={() => run(unmuteUser, { muted: false }, 'Unmuted')}
          />
        ) : (
          <MenuRow
            icon="volume-mute-outline"
            label="Mute"
            onPress={() => run(muteUser, { muted: true }, 'Muted. They are not told.')}
          />
        )}
        {rel.blocked ? (
          <MenuRow
            icon="lock-open-outline"
            label="Unblock"
            onPress={() => run(unblockUser, { blocked: false }, 'Unblocked')}
          />
        ) : (
          <MenuRow
            icon="ban-outline"
            label="Block"
            tone={t.colors.error}
            onPress={confirmBlock}
          />
        )}
        <MenuRow
          icon="flag-outline"
          label="Report"
          onPress={() => { onClose?.(); onReport?.(); }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs, paddingBottom: spacing.md },
  title: { ...type.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowLabel: { ...type.body, color: colors.textPrimary },
});
