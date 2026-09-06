/**
 * PostCard — one training story (blueprint section 6,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`; SD-04, SD-06).
 *
 * A story is generated from something the user really logged and posted by
 * hand. This component renders ONLY the allow-listed payload keys for the
 * post's kind (`POST_PAYLOAD_KEYS` in `src/lib/community/validation.js`),
 * one field at a time, so nothing about a person's body, food or coaching
 * can reach a card even if a payload somehow carried it. The weight on a PR
 * card is the lift, which is training performance the user chose to share.
 *
 * Lead visual review 2026-09-06, ruling 3: the reaction is a single
 * "Respect" tap (`thumbs-up-outline`, filled `thumbs-up` when on) with a
 * count; comments use `chatbubble-outline`. No hearts, and no amber body
 * text anywhere on the card.
 *
 * Props:
 *   post        the post row: { id, kind, payload, caption, reaction_count,
 *               comment_count, created_at }
 *   author      the author's profile card: { handle, display_name,
 *               avatar_preset, user_id }
 *   myReaction  boolean, has the viewer already tapped Respect
 *   onPress     open the post
 *   onReact     (next: boolean) => void
 *   onOpenAuthor  open the author's profile
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../Card';
import SectionLabel from '../SectionLabel';
import ProfileAvatarMark from '../ProfileAvatarMark';
import useTheme from '../../hooks/useTheme';
import { spacing, type, hitSlop, iconSize } from '../../styles/theme';

/** A short, calm relative day. Never a clock time: a story is a day's work. */
export function postDayLabel(ms) {
  const value = Number(ms) || (ms ? Date.parse(ms) : 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  const days = Math.floor((Date.now() - value) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The eyebrow + hero + supporting line for each kind. Every field is named
 * explicitly; there is no spread of the payload anywhere in this file. */
export function bodyForKind(post) {
  const p = post?.payload ?? {};
  switch (post?.kind) {
    case 'pr':
      return {
        eyebrow: p.exerciseName ? `New PR · ${p.exerciseName}` : 'New PR',
        hero: `${p.weight ?? ''} ${p.units ?? 'kg'} x ${p.reps ?? ''}`.trim(),
        line: p.previousBest ? `Previous best ${p.previousBest} ${p.units ?? 'kg'}` : null,
      };
    case 'session': {
      const stats = [
        `${number(p.workingSets)} working sets`,
        `${number(p.exerciseCount)} exercises`,
        `${number(p.duration)} min`,
      ];
      return {
        eyebrow: p.planName ? `Session · ${p.planName}` : 'Session',
        hero: p.sessionName ?? 'Session',
        line: stats.join(' · '),
      };
    }
    case 'block': {
      const lifts = Array.isArray(p.lifts) ? p.lifts.slice(0, 3) : [];
      return {
        eyebrow: p.planName ? `Block complete · ${p.planName}` : 'Block complete',
        hero: `${number(p.weeks)} weeks · ${number(p.sessions)} sessions`,
        line: lifts.length
          ? lifts.map((l) => `${l?.exerciseName ?? 'Lift'} +${l?.deltaKg ?? 0} ${l?.units ?? 'kg'}`).join(' · ')
          : null,
      };
    }
    case 'milestone':
      return {
        eyebrow: p.eyebrow ?? 'Milestone',
        hero: `${p.heroValue ?? ''}${p.heroUnit ? ` ${p.heroUnit}` : ''}`.trim(),
        line: p.caption ?? null,
      };
    case 'programme':
      return {
        eyebrow: 'Programme · Published',
        hero: p.title ?? 'Programme',
        line: [
          p.days_per_week ? `${number(p.days_per_week)} days` : null,
          p.exercise_count ? `${number(p.exercise_count)} exercises` : null,
        ].filter(Boolean).join(' · ') || null,
      };
    default:
      return { eyebrow: null, hero: null, line: null };
  }
}

export default function PostCard({ post, author, myReaction = false, onPress, onReact, onOpenAuthor }) {
  const t = useTheme();
  const { eyebrow, hero, line } = bodyForKind(post);
  const handle = author?.handle ? `@${author.handle}` : '';
  const day = postDayLabel(post?.created_at);

  return (
    <Card onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={styles.card}>
      <TouchableOpacity
        style={styles.authorRow}
        onPress={onOpenAuthor}
        disabled={!onOpenAuthor}
        accessibilityRole="button"
        accessibilityLabel={author?.display_name ? `Open ${author.display_name}'s profile` : 'Open profile'}
      >
        <ProfileAvatarMark
          presetKey={author?.avatar_preset ?? null}
          displayName={author?.display_name ?? ''}
          size={40}
        />
        <View style={styles.authorText}>
          <Text style={[styles.authorName, { color: t.colors.textPrimary }]} numberOfLines={1}>
            {author?.display_name ?? 'A lifter'}
          </Text>
          <Text style={[styles.authorHandle, { color: t.colors.textSecondary }]} numberOfLines={1}>
            {[handle, day].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.body}>
        {eyebrow ? <SectionLabel>{eyebrow}</SectionLabel> : null}
        {hero ? (
          <Text style={[styles.hero, t.type.num('h2'), { color: t.colors.textPrimary }]}>{hero}</Text>
        ) : null}
        {line ? (
          <Text style={[styles.line, { color: t.colors.textSecondary }]}>{line}</Text>
        ) : null}
      </View>

      {post?.caption ? (
        <Text style={[styles.caption, { color: t.colors.textPrimary }]}>{post.caption}</Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => onReact?.(!myReaction)}
          disabled={!onReact}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityState={{ selected: !!myReaction }}
          accessibilityLabel={myReaction ? 'Remove your respect' : 'Respect this'}
        >
          <Ionicons
            name={myReaction ? 'thumbs-up' : 'thumbs-up-outline'}
            size={iconSize.sm}
            color={myReaction ? t.colors.textPrimary : t.colors.textSecondary}
          />
          <Text style={[styles.actionText, { color: myReaction ? t.colors.textPrimary : t.colors.textSecondary }]}>
            {`Respect ${number(post?.reaction_count)}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={onPress}
          disabled={!onPress}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Open the comments"
        >
          <Ionicons name="chatbubble-outline" size={iconSize.sm} color={t.colors.textSecondary} />
          <Text style={[styles.actionText, { color: t.colors.textSecondary }]}>
            {String(number(post?.comment_count))}
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  authorText: { flex: 1, gap: spacing.xxs },
  authorName: { ...type.label },
  authorHandle: { ...type.caption },
  body: { gap: spacing.xxs },
  hero: {},
  line: { ...type.caption },
  caption: { ...type.bodySm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs2 },
  actionText: { ...type.caption },
});
