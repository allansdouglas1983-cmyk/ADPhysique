/**
 * ProgrammeTile (blueprint section 6)
 *
 * One published programme, as a tile: title, the creator's @handle (or
 * "By Volyume" for a library plan), a style chip, "N days", "N
 * exercises", a "Circuits" chip when the structure has any, and the
 * "Used by N" line.
 *
 * The `volyume` flag marks a Volyume library plan with a small amber
 * chip. That chip is one of the four amber affordances allowed on a
 * Community screen (section 13, ruling 1); everything else on the tile
 * is neutral ink.
 *
 * Props:
 *   programme  {id, title, style_key, days_per_week, exercise_count,
 *               has_circuits, use_count}
 *   creator    the creator's profile card, or null
 *   volyume    true for a Volyume library plan ("By Volyume")
 *   onPress    opens the programme
 */

import { View, Text, StyleSheet } from 'react-native';
import Card from '../Card';
import Chip from '../Chip';
import { spacing, type, colors, radius } from '../../styles/theme';
import useTheme from '../../hooks/useTheme';
import { COMMUNITY_STYLE_KEYS } from '../../lib/community';

/** A style key rendered for people: the Community label when we know it,
 * otherwise the key with its underscores opened out. */
export function styleLabel(key) {
  if (!key) return null;
  if (COMMUNITY_STYLE_KEYS[key]) return COMMUNITY_STYLE_KEYS[key];
  const words = String(key).replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
}

export default function ProgrammeTile({ programme, creator, volyume = false, onPress }) {
  const t = useTheme();
  if (!programme) return null;

  const days = Number(programme.days_per_week) || 0;
  const exercises = Number(programme.exercise_count) || 0;
  const uses = Number(programme.use_count) || 0;
  const style = styleLabel(programme.style_key);
  const by = volyume ? 'By Volyume' : (creator?.handle ? `@${creator.handle}` : null);

  return (
    <Card
      onPress={onPress}
      style={styles.tile}
      accessibilityLabel={`${programme.title}${by ? `, ${by}` : ''}`}
    >
      <Text style={[styles.title, { ...t.type.title, color: t.colors.textPrimary }]} numberOfLines={2}>
        {programme.title}
      </Text>
      {by ? (
        <Text style={[styles.by, { ...t.type.caption, color: t.colors.textSecondary }]} numberOfLines={1}>
          {by}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {volyume ? (
          <Chip label="Volyume" selected accessibilityRole="text" />
        ) : null}
        {style ? <Chip label={style} accessibilityRole="text" /> : null}
        {days ? <Chip label={days === 1 ? '1 day' : `${days} days`} accessibilityRole="text" /> : null}
        {exercises ? (
          <Chip
            label={exercises === 1 ? '1 exercise' : `${exercises} exercises`}
            accessibilityRole="text"
          />
        ) : null}
        {programme.has_circuits ? <Chip label="Circuits" accessibilityRole="text" /> : null}
      </View>
      {uses ? (
        <Text style={[styles.uses, { ...t.type.caption, color: t.colors.textMuted }]}>
          {`Used by ${uses}`}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { gap: spacing.sm, borderRadius: radius.lg },
  title: { ...type.title, color: colors.textPrimary },
  by: { ...type.caption, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
  uses: { ...type.caption, color: colors.textMuted },
});
