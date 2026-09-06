/**
 * CommunityHeaderAction (blueprint section 1, entry point 1)
 *
 * The Today root's header action: a 34 dp round pressable carrying the
 * `people-outline` glyph in amber on `surface2` with a hairline border,
 * matching the brand-mark box it replaces on that screen. An amber dot
 * sits at its top-right when there is unseen activity or a pending
 * follow request, read from the cached `me` payload so the header never
 * waits on the network to draw.
 *
 * Lead visual review (section 13, ruling 1): the glyph and the dot are
 * the only amber on this control, and the Today header keeps ONLY this
 * action in its `right` slot.
 */

import { Pressable, View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { spacing, circle } from '../../styles/theme';
import useTheme from '../../hooks/useTheme';
import useCommunityMe from '../../hooks/useCommunityMe';
import { hasUnseen } from '../../lib/community';

// Matches ScreenHeader's BRAND_BOX so the control sits exactly where the
// brand mark used to, at the same optical weight.
const BOX = 34;
const DOT = 6;

export default function CommunityHeaderAction({ onPress }) {
  const t = useTheme();
  // useNavigation throws outside a navigator (isolated mount tests); the
  // same guard BackHeader uses, so the header degrades rather than crashes.
  let navigation = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  try { navigation = useNavigation(); } catch (_) { navigation = null; }
  const { me } = useCommunityMe();
  const unseen = hasUnseen(me);

  const go = onPress ?? (() => navigation?.navigate?.('Community'));

  return (
    <Pressable
      onPress={go}
      hitSlop={spacing.md}
      accessibilityRole="button"
      accessibilityLabel={unseen ? 'Community, new activity' : 'Community'}
      style={[
        styles.box,
        { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
      ]}
    >
      <Ionicons name="people-outline" size={18} color={t.colors.primary} />
      {unseen ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: t.colors.primary, borderColor: t.colors.background },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: BOX,
    height: BOX,
    borderRadius: circle(BOX),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: DOT + 2,
    height: DOT + 2,
    borderRadius: circle(DOT + 2),
    borderWidth: 1,
  },
});
