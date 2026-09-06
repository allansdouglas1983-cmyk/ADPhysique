/**
 * CommunityRulesScreen (blueprint sections 6, 11; SD-11)
 *
 * The rules, what stays private, how reporting and blocking work, what
 * a moderator can do, the published contact address, and the version.
 *
 * The text below is the versioned rules text from
 * `docs/community-safety/COMMUNITY-RULES.md`, pasted here verbatim. It
 * is the notice recorded against `COMMUNITY_RULES_VERSION` when someone
 * joins, so it changes only with a version bump, and this screen and
 * that document move together.
 */

import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Card from '../components/Card';
import Button from '../components/Button';
import SectionLabel from '../components/SectionLabel';
import useTheme from '../hooks/useTheme';
import { colors, spacing, type } from '../styles/theme';
import { COMMUNITY_RULES_VERSION } from '../lib/community';

// Community Rules v1, from docs/community-safety/COMMUNITY-RULES.md.
// Keep this block in step with that document.
export const COMMUNITY_RULES_TEXT = {
  title: 'Community rules',
  intro:
    'Community is where you share your training, follow people you rate, '
    + 'and use or adapt the programmes other lifters have built. It works '
    + 'best when it stays about training. Here is what that means in '
    + 'practice.',
  rules: [
    {
      heading: 'Training talk only.',
      body: 'Posts and comments are about training: what you did, how it went, what you built. Keep it there.',
    },
    {
      heading: 'Be decent to people.',
      body: 'Disagree if you like, but no harassment, threats, hate or targeting anyone.',
    },
    {
      heading: 'No body-shaming, no diet or calorie talk.',
      body:
        'Nothing about anyone’s body, weight or appearance, and nothing '
        + 'about calories, restriction or dieting. This applies to your own '
        + 'body too, not just other people’s.',
    },
    {
      heading: 'Report what breaks this.',
      body: 'If you see something that shouldn’t be here, report it. That is how we keep Community working for everyone.',
    },
  ],
  privacy: {
    heading: 'What stays private',
    intro:
      'Community only ever shows what you choose to put there: a handle, '
      + 'a display name, a bio, up to three training styles, a goal, a '
      + 'training setting, and (if you want) an area or gym label. '
      + 'Training-story posts show what you post and nothing more.',
    neverShown: [
      'Your bodyweight and body composition',
      'Your Progress Scan',
      'Your nutrition and food diary',
      'Your injuries and limitations',
      'Anything your coach or plan adjustments have said',
      'Your check-ins',
      'Your progress photos',
      'Your first name, date of birth, email, height or age',
    ],
    note:
      'If you post a personal best, the weight and reps on that specific '
      + 'lift are shown because you chose to share that result. Programmes '
      + 'you publish share their structure (days, exercises, sets, reps, '
      + 'rest) and never a weight.',
  },
  reporting: {
    heading: 'Reporting and blocking',
    body:
      'Every profile, post, comment and programme has a Report option '
      + 'with a short list of reasons to choose from, including a '
      + 'dedicated reason for harmful body or eating content. Reports go '
      + 'straight to a moderator queue.\n\n'
      + 'You can also block anyone. Blocking is two-way: once you block '
      + 'someone, neither of you can see the other’s profile, posts, '
      + 'programmes or comments, and any follow between you is removed. '
      + 'You can unblock at any time. Muting is quieter: you stop seeing '
      + 'someone’s posts, and they are never told.\n\n'
      + 'If a post, comment or programme gets reported by three different '
      + 'people, it is hidden automatically while a moderator looks at it.',
  },
  moderatorActions: {
    heading: 'What moderators can do',
    body:
      'A moderator can dismiss a report, hide or delete content, or '
      + 'restrict or suspend an account. Every action a moderator takes is '
      + 'recorded, including who did it and why, so it can always be '
      + 'checked.',
  },
  contact: {
    heading: 'Contact',
    body:
      'Questions about these rules, or anything Community-related you '
      + 'would rather raise directly:',
    email: 'support@volyume.app',
  },
  version: {
    number: COMMUNITY_RULES_VERSION,
    publishedDate: '2026-09-06',
    label: 'Community rules version 1, published 6 September 2026.',
    changeNote:
      'Any future change to these rules is a new version, and you will '
      + 'be asked to accept it before you can keep using Community.',
  },
};

export default function CommunityRulesScreen() {
  const t = useTheme();
  const text = COMMUNITY_RULES_TEXT;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title={text.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.body, { ...t.type.body, color: t.colors.textSecondary }]}>
          {text.intro}
        </Text>

        <Card style={styles.block}>
          {text.rules.map((rule) => (
            <View key={rule.heading} style={styles.rule}>
              <Text style={[styles.ruleHeading, { ...t.type.bodyStrong, color: t.colors.textPrimary }]}>
                {rule.heading}
              </Text>
              <Text style={[styles.body, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
                {rule.body}
              </Text>
            </View>
          ))}
        </Card>

        <View style={styles.section}>
          <SectionLabel>{text.privacy.heading}</SectionLabel>
          <Text style={[styles.body, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {text.privacy.intro}
          </Text>
          {text.privacy.neverShown.map((line) => (
            <Text key={line} style={[styles.bullet, { ...t.type.bodySm, color: t.colors.textPrimary }]}>
              {line}
            </Text>
          ))}
          <Text style={[styles.body, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {text.privacy.note}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>{text.reporting.heading}</SectionLabel>
          <Text style={[styles.body, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {text.reporting.body}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>{text.moderatorActions.heading}</SectionLabel>
          <Text style={[styles.body, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {text.moderatorActions.body}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>{text.contact.heading}</SectionLabel>
          <Text style={[styles.body, { ...t.type.bodySm, color: t.colors.textSecondary }]}>
            {text.contact.body}
          </Text>
          <Button
            variant="secondary"
            title={text.contact.email}
            onPress={() => Linking.openURL(`mailto:${text.contact.email}`).catch(() => {})}
            accessibilityLabel={`Email ${text.contact.email}`}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.version, { ...t.type.caption, color: t.colors.textMuted }]}>
            {text.version.label}
          </Text>
          <Text style={[styles.version, { ...t.type.caption, color: t.colors.textMuted }]}>
            {text.version.changeNote}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  block: { gap: spacing.md },
  rule: { gap: spacing.xxs },
  ruleHeading: { ...type.bodyStrong, color: colors.textPrimary },
  section: { gap: spacing.sm },
  body: { ...type.bodySm, color: colors.textSecondary },
  bullet: { ...type.bodySm, color: colors.textPrimary },
  version: { ...type.caption, color: colors.textMuted },
});
