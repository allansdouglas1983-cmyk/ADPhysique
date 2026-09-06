/**
 * CommunityComposeScreen — post one training story (blueprint section 6,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`; SD-06).
 *
 * Nothing here is automatic. A story is composed from something the athlete
 * really logged, shown to them exactly as everyone else will see it, and
 * posted only when they tap Post. The payload comes from the builders in
 * `src/lib/community/posts.js`, which carry ONLY the allow-listed keys for
 * the kind; this screen never assembles a payload of its own.
 *
 * Without a Community profile there is nothing to post as, so the screen
 * hands over to Join and asks it to come back here afterwards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import SegmentedControl from '../components/SegmentedControl';
import { useToast } from '../components/Toast';
import PostCard from '../components/community/PostCard';
import useTheme from '../hooks/useTheme';
import useAppStore from '../store/useAppStore';
import { spacing, radius, type } from '../styles/theme';
import * as haptics from '../lib/haptics';
import { logError } from '../lib/errorLog';
import {
  loadMe, hasProfile, createPost,
  buildPrPayload, buildSessionPayload, buildBlockPayload, buildMilestonePayload,
  buildProgrammePayload, CAPTION_MAX,
} from '../lib/community';

const VISIBILITY_OPTIONS = [
  { label: 'Public', value: 'public' },
  { label: 'Followers', value: 'followers' },
];

export function composeErrorLine(code) {
  if (code === 'offline') return 'Volyume could not reach Community just now. Check your connection and try again.';
  if (code === 'rate_limited') return 'That is a lot of posting for one day. Try again tomorrow.';
  if (code === 'content_not_allowed') return 'Some of that wording is not allowed in Community. Please reword it.';
  if (code === 'no_profile') return 'Create your Community profile first, then post this.';
  return 'That did not post. Please try again.';
}

/** Build the payload for one kind from what the entry point handed over.
 * Each branch calls exactly one builder and nothing else. */
export async function payloadFor({ kind, workoutId, mesocycleId, pr, milestone, programme }, { userId, units }) {
  if (kind === 'pr') return pr ? buildPrPayload({ ...pr, units: pr.units ?? units }) : null;
  if (kind === 'milestone') return milestone ? buildMilestonePayload(milestone) : null;
  if (kind === 'session') return workoutId ? buildSessionPayload(workoutId, { userId, units }) : null;
  if (kind === 'block') return mesocycleId ? buildBlockPayload(mesocycleId, { userId, units }) : null;
  if (kind === 'programme') return programme ? buildProgrammePayload(programme) : null;
  return null;
}

export default function CommunityComposeScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const params = route?.params ?? {};
  const kind = params.kind ?? null;
  const user = useAppStore((s) => s.user);
  const units = useAppStore((s) => s.units);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { me } = await loadMe({});
    if (!hasProfile(me)) {
      setLoading(false);
      navigation.navigate('CommunityJoin', {
        next: { screen: 'CommunityCompose', params },
      });
      return;
    }
    setProfile(me.profile);
    try {
      setPayload(await payloadFor(params, { userId: user?.id ?? null, units }));
    } catch (e) {
      logError('CommunityComposeScreen.load', e, { kind });
      setPayload(null);
    } finally {
      setLoading(false);
    }
    // `params` is a route object, stable for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, user?.id, units, kind]);

  useEffect(() => { load(); }, [load]);

  async function handlePost() {
    if (!payload || postingRef.current) return;
    haptics.selection();
    postingRef.current = true;
    setPosting(true);
    try {
      const created = await createPost({
        kind,
        payload,
        caption: caption.trim() || null,
        programmeId: kind === 'programme' ? (payload.id ?? null) : null,
        visibility,
      });
      if (!created?.id) throw new Error('Post failed.');
      toast.show('Posted to Community', { variant: 'success' });
      navigation.replace('CommunityPost', { id: created.id });
    } catch (e) {
      if (!e?.code) logError('CommunityComposeScreen.handlePost', e, { kind });
      toast.show(composeErrorLine(e?.code), { variant: 'error' });
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  const previewPost = payload
    ? { id: 'preview', kind, payload, caption: caption.trim() || null, reaction_count: 0, comment_count: 0, created_at: Date.now() }
    : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Post to Community" />
      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={t.colors.primary} /></View>
      ) : !previewPost ? (
        <View style={styles.centre}>
          <EmptyState
            icon="document-outline"
            title="Nothing to post yet"
            text="Volyume could not read this session. Open it again from where you finished it, then post."
            actionLabel="Go back"
            onAction={() => navigation.goBack()}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionLabel>Preview</SectionLabel>
          <PostCard post={previewPost} author={profile} myReaction={false} />

          <View style={styles.field}>
            <SectionLabel>Caption</SectionLabel>
            <TextInput
              style={[styles.input, {
                backgroundColor: t.colors.inputBg, borderColor: t.colors.border, color: t.colors.textPrimary,
              }]}
              value={caption}
              onChangeText={setCaption}
              maxLength={CAPTION_MAX}
              multiline
              placeholder="Say something about the training, if you want to."
              placeholderTextColor={t.colors.textDisabled}
              accessibilityLabel="Caption"
            />
            <Text style={[styles.counter, { color: t.colors.textMuted }]}>
              {`${caption.length} of ${CAPTION_MAX}`}
            </Text>
          </View>

          <View style={styles.field}>
            <SectionLabel>Who can see it</SectionLabel>
            <SegmentedControl options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
          </View>

          <Button
            variant="emphatic"
            title="Post"
            size="lg"
            onPress={handlePost}
            loading={posting}
            disabled={posting}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  field: { gap: spacing.sm },
  input: {
    minHeight: 96, textAlignVertical: 'top', borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...type.body,
  },
  counter: { ...type.caption, textAlign: 'right' },
});
