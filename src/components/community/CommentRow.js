/**
 * CommentRow — one comment on a story or a programme (blueprint section 6,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`).
 *
 * Author, body, day, and the two actions a reader needs: delete (their own,
 * or a comment on their own content) and report (anyone else's). Nothing
 * else, and no reaction on a comment: a comment thread on a training app is
 * a conversation, not a leaderboard.
 *
 * Props:
 *   comment       { id, body, created_at, mine }
 *   author        the author's profile card
 *   canDelete     boolean, show the delete action
 *   onDelete      () => void
 *   onOpenAuthor  () => void
 *   onReport      () => void, omit to hide reporting (your own comment)
 *
 * `CommentComposer` ships alongside it, because the field that writes a
 * comment belongs with the row that reads one and both screens that carry a
 * thread (the programme and the story) need exactly the same field.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '../Button';
import ProfileAvatarMark from '../ProfileAvatarMark';
import useTheme from '../../hooks/useTheme';
import { spacing, radius, type, hitSlop, iconSize } from '../../styles/theme';
import { touchTarget } from '../../styles/layout';
import { COMMENT_MAX } from '../../lib/community/validation';
import { postDayLabel } from './PostCard';

/**
 * The comment field and its send action.
 *
 * Props:
 *   onSubmit     (body: string) => Promise<boolean>, true clears the field
 *   placeholder  optional
 */
export function CommentComposer({ onSubmit, placeholder = 'Add a comment' }) {
  const t = useTheme();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const trimmed = body.trim();

  async function send() {
    if (!trimmed || sending) return;
    setSending(true);
    const ok = await onSubmit?.(trimmed);
    setSending(false);
    if (ok) setBody('');
  }

  return (
    <View style={[styles.composer, { borderTopColor: t.colors.borderSubtle }]}>
      <TextInput
        style={[styles.composerInput, {
          backgroundColor: t.colors.inputBg, borderColor: t.colors.border, color: t.colors.textPrimary,
        }]}
        value={body}
        onChangeText={setBody}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textDisabled}
        maxLength={COMMENT_MAX}
        multiline
        accessibilityLabel="Comment"
      />
      <Button
        title="Send"
        size="sm"
        fullWidth={false}
        onPress={send}
        disabled={!trimmed || sending}
        loading={sending}
        accessibilityLabel="Send comment"
      />
    </View>
  );
}

export default function CommentRow({
  comment, author, canDelete = false, onDelete, onOpenAuthor, onReport,
}) {
  const t = useTheme();
  const handle = author?.handle ? `@${author.handle}` : '';
  const day = postDayLabel(comment?.created_at);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onOpenAuthor}
        disabled={!onOpenAuthor}
        accessibilityRole="button"
        accessibilityLabel={author?.display_name ? `Open ${author.display_name}'s profile` : 'Open profile'}
      >
        <ProfileAvatarMark
          presetKey={author?.avatar_preset ?? null}
          displayName={author?.display_name ?? ''}
          size={32}
        />
      </TouchableOpacity>
      <View style={styles.main}>
        <Text style={[styles.meta, { color: t.colors.textSecondary }]} numberOfLines={1}>
          {[author?.display_name ?? 'A lifter', handle, day].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.body, { color: t.colors.textPrimary }]}>{comment?.body ?? ''}</Text>
      </View>
      {canDelete && onDelete ? (
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Delete this comment"
        >
          <Ionicons name="trash-outline" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>
      ) : null}
      {onReport ? (
        <TouchableOpacity
          onPress={onReport}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Report this comment"
        >
          <Ionicons name="flag-outline" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  main: { flex: 1, gap: spacing.xxs },
  meta: { ...type.caption },
  body: { ...type.bodySm },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1,
  },
  composerInput: {
    flex: 1, minHeight: touchTarget.minimum, maxHeight: 120,
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...type.bodySm,
  },
});
