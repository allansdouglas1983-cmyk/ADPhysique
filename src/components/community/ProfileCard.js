/**
 * ProfileCard (blueprint section 6)
 *
 * One person, as a row: avatar, display name, @handle, the facts they
 * chose (styles, goal, setting), an optional reasons line, and the
 * follow control.
 *
 * Section 13, ruling 1: the reasons line is `textPrimary` at
 * `captionStrong`, never amber. Amber on a Community screen is only the
 * glyph on a primary button, the selected segment, an emphatic fill, the
 * Volyume chip and the unseen dot.
 *
 * Props:
 *   card       the profile card (user_id, handle, display_name,
 *              avatar_preset, bio, styles, goal, setting, area_label,
 *              gym_label, follower_count, relationship, ...)
 *   reasons    string[] from `suggestedPeople`, rendered as one line
 *   onPress    opens the profile
 *   showFollow render the FollowButton (default true; pass false on your
 *              own card and inside a picker)
 *   onFollowChange (relationship, card) after a successful follow toggle
 *   compact    drops the fact chips, for a creator line above a programme
 */

import { View, Text, StyleSheet } from 'react-native';
import Card from '../Card';
import Chip from '../Chip';
import ProfileAvatarMark from '../ProfileAvatarMark';
import FollowButton from './FollowButton';
import { spacing, type, colors } from '../../styles/theme';
import useTheme from '../../hooks/useTheme';
import { COMMUNITY_STYLE_KEYS, COMMUNITY_GOALS, COMMUNITY_SETTINGS } from '../../lib/community';

const AVATAR = 40;

/** The chosen facts, in the order the profile hero shows them. */
export function factLabels(card) {
  const out = [];
  for (const key of card?.styles ?? []) {
    if (COMMUNITY_STYLE_KEYS[key]) out.push(COMMUNITY_STYLE_KEYS[key]);
  }
  if (COMMUNITY_GOALS[card?.goal]) out.push(COMMUNITY_GOALS[card.goal]);
  if (COMMUNITY_SETTINGS[card?.setting]) out.push(COMMUNITY_SETTINGS[card.setting]);
  return out;
}

/** "Trains at PureGym Leeds · Leeds", or just whichever half was typed. */
export function placeLine(card) {
  const parts = [];
  if (card?.gym_label) parts.push(`Trains at ${card.gym_label}`);
  if (card?.area_label) parts.push(card.area_label);
  return parts.length ? parts.join(' · ') : null;
}

export default function ProfileCard({
  card,
  reasons = [],
  onPress,
  showFollow = true,
  onFollowChange,
  compact = false,
}) {
  const t = useTheme();
  if (!card) return null;
  const facts = compact ? [] : factLabels(card);
  const reasonLine = reasons.length ? reasons.join(' · ') : null;
  const name = card.display_name || card.handle;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${name}, @${card.handle}`}
      style={styles.card}
    >
      <View style={styles.row}>
        <ProfileAvatarMark
          presetKey={card.avatar_preset}
          displayName={name}
          size={AVATAR}
        />
        <View style={styles.body}>
          <Text style={[styles.name, { ...t.type.bodyStrong, color: t.colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.handle, { ...t.type.caption, color: t.colors.textSecondary }]} numberOfLines={1}>
            {`@${card.handle}`}
          </Text>
          {reasonLine ? (
            <Text style={[styles.reasons, { ...t.type.captionStrong, color: t.colors.textPrimary }]}>
              {reasonLine}
            </Text>
          ) : null}
        </View>
        {showFollow ? (
          <FollowButton card={card} onChange={onFollowChange} />
        ) : null}
      </View>
      {facts.length ? (
        <View style={styles.chips}>
          {facts.map((label) => (
            <Chip key={label} label={label} accessibilityRole="text" />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1, gap: spacing.xxs },
  name: { ...type.bodyStrong, color: colors.textPrimary },
  handle: { ...type.caption, color: colors.textSecondary },
  reasons: { ...type.captionStrong, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs2 },
});
