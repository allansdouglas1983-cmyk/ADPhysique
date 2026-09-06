/**
 * PrivacyReceipt (blueprint sections 2, 6)
 *
 * Two columns, "Others can see" against "Never shared", with a hairline
 * between them. Same typesetting as PartnerPrivacyReceipt (the shape
 * this reuses); the copy is Community's, and the right-hand column is
 * the promise the whole feature rests on: nothing about the body, food,
 * scans, injuries, coaching or check-ins ever enters Community.
 *
 * It is shown before anyone joins (the hub hero and the Join screen) and
 * again on the Community privacy screen, so the promise is readable
 * before the decision and after it.
 *
 * On a narrow width the two columns stack rather than truncate.
 */

import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SectionLabel from '../SectionLabel';
import {
  colors, spacing, radius, type, iconSize, withAlpha, alpha,
} from '../../styles/theme';
import useTheme from '../../hooks/useTheme';

// Fixed copy (blueprint section 2 and docs/community-safety/
// COMMUNITY-RULES.md). It is the notice recorded against
// COMMUNITY_RULES_VERSION, so it changes only with a version bump.
const SHOWN = [
  'Your handle and name',
  'Styles, goal, gym and area you type',
  'Programmes you publish',
  'Stories you post',
];
const NEVER = [
  'Bodyweight or body data',
  'Food and nutrition',
  'Progress Scan and photos',
  'Injuries, coaching, check-ins',
];

// Layout breakpoint (not a design token), same threshold and reason as
// PartnerPrivacyReceipt: below this the columns stack so no line truncates.
const STACK_BELOW = 360;

export default function PrivacyReceipt() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const stack = width < STACK_BELOW;

  return (
    <View style={[styles.card, { backgroundColor: t.colors.surface2, borderColor: t.colors.borderSubtle }]}>
      <View style={[styles.columns, stack && styles.columnsStack]}>
        <View style={styles.col}>
          <SectionLabel>Others can see</SectionLabel>
          {SHOWN.map((line) => (
            <Text key={line} style={[styles.line, { ...t.type.bodySm, color: t.colors.textPrimary }]}>
              {line}
            </Text>
          ))}
        </View>

        {stack
          ? <View style={[styles.ruleH, { backgroundColor: withAlpha(t.colors.border, alpha.strong) }]} />
          : <View style={[styles.ruleV, { backgroundColor: withAlpha(t.colors.border, alpha.strong) }]} />}

        <View style={styles.col}>
          <SectionLabel>Never shared</SectionLabel>
          {NEVER.map((line) => (
            <View key={line} style={styles.neverRow}>
              <Ionicons
                name="lock-closed-outline"
                size={iconSize.sm}
                color={t.colors.textSecondary}
                style={styles.lockIcon}
              />
              <Text style={[styles.neverLine, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  columnsStack: { flexDirection: 'column' },
  col: { flex: 1, gap: spacing.xs },
  ruleV: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
    backgroundColor: colors.border,
  },
  ruleH: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  line: { ...type.bodySm, color: colors.textPrimary },
  neverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  lockIcon: { marginTop: spacing.xxs },
  neverLine: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
});
