/**
 * JoinToInteractRow (blueprint section 6; SD-04)
 *
 * Reading Community never needs a profile. Reacting and commenting do:
 * `community_react` and `community_comment` both raise `no_profile`. A
 * reader without one used to be shown the composer and the Respect tap
 * and told "that did not send" after the fact, which is neither the
 * reason nor a route to the fix (product review 2026-09-06, item 16).
 *
 * One quiet row, in place of both, that goes to Join and comes back.
 */

import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Card from '../Card';
import useTheme from '../../hooks/useTheme';
import { spacing, type, iconSize } from '../../styles/theme';

export const JOIN_TO_INTERACT_LINE = 'Create your Community profile to react and comment';

export default function JoinToInteractRow({ onPress }) {
  const t = useTheme();
  return (
    <Card
      onPress={onPress}
      style={styles.card}
      accessibilityLabel={JOIN_TO_INTERACT_LINE}
    >
      <View style={styles.row}>
        <Text style={[styles.line, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
          {JOIN_TO_INTERACT_LINE}
        </Text>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { ...type.bodySm, flex: 1 },
});
