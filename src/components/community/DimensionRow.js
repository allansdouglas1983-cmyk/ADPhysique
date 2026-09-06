/**
 * DimensionRow (blueprint section 6; SD-10)
 *
 * One dimension the user shares with other people: a style, a programme,
 * a gym or an area. A dimension is a page listing the people who chose
 * it, never a room with its own feed or admin, so the row states the
 * label and the count and nothing more.
 *
 * Props:
 *   dimension  {kind: 'style'|'programme'|'gym'|'area', key, label, count}
 *   onPress    opens the dimension page
 */

import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../Card';
import { spacing, type, colors, iconSize } from '../../styles/theme';
import useTheme from '../../hooks/useTheme';

const GLYPH = {
  style: 'barbell-outline',
  programme: 'list-outline',
  gym: 'business-outline',
  area: 'location-outline',
};

/** "6 people" / "1 person". The count is other people, never including you. */
export function peopleLine(count) {
  const n = Number(count) || 0;
  return n === 1 ? '1 person' : `${n} people`;
}

export default function DimensionRow({ dimension, onPress }) {
  const t = useTheme();
  if (!dimension) return null;
  const sub = peopleLine(dimension.count);

  return (
    <Card
      onPress={onPress}
      style={styles.row}
      accessibilityLabel={`${dimension.label}. ${sub}`}
    >
      <View style={[styles.glyph, { backgroundColor: t.colors.surface2 }]}>
        <Ionicons
          name={GLYPH[dimension.kind] ?? 'people-outline'}
          size={iconSize.md}
          color={t.colors.textSecondary}
        />
      </View>
      <View style={styles.body}>
        <Text style={[styles.label, { ...t.type.bodyStrong, color: t.colors.textPrimary }]} numberOfLines={1}>
          {dimension.label}
        </Text>
        <Text style={[styles.sub, { ...t.type.caption, color: t.colors.textSecondary }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: spacing.xxs },
  label: { ...type.bodyStrong, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary },
});
