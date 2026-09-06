/**
 * CommunityPublishProgrammeScreen — share one of your own plans as a
 * programme (blueprint section 6, `docs/social-discovery-2026-09-06/
 * 30-BLUEPRINT.md`; SD-04).
 *
 * The disclosure on this screen is the whole point of it. A published
 * programme is STRUCTURE: days, exercises, sets, reps, rest and the notes
 * the creator wrote on their own exercises. It never carries a weight, and
 * the snapshot builder (`src/lib/community/snapshot.js`) never reads one, so
 * the sentence on screen is a description of the code, not a promise.
 *
 * The preview above the fields is the same `ProgrammeStructure` the reader
 * will see, so nobody publishes something they have not looked at.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import SegmentedControl from '../components/SegmentedControl';
import { appAlert } from '../components/AppAlert';
import { useToast } from '../components/Toast';
import ProgrammeStructure from '../components/community/ProgrammeStructure';
import useTheme from '../hooks/useTheme';
import { spacing, radius, type } from '../styles/theme';
import { touchTarget } from '../styles/layout';
import * as haptics from '../lib/haptics';
import { logError } from '../lib/errorLog';
import {
  buildSnapshotForPlan, validateSnapshot, snapshotStats,
  publishProgramme, unpublishProgramme, myProgrammes, hasProfile, loadMe,
  PROGRAMME_TITLE_MAX, PROGRAMME_DESCRIPTION_MAX, programmeUrl,
} from '../lib/community';

export const DISCLOSURE_LINE = 'Structure only: days, exercises, sets, reps, rest and your exercise notes. Never your weights.';

const VISIBILITY_OPTIONS = [
  { label: 'Public', value: 'public' },
  { label: 'Followers', value: 'followers' },
  { label: 'Link only', value: 'link' },
];

export function publishErrorLine(code) {
  if (code === 'offline') return 'Volyume could not reach Community just now. Check your connection and try again.';
  if (code === 'rate_limited') return 'That is a lot of publishing for one day. Try again tomorrow.';
  if (code === 'content_not_allowed') return 'Some of that wording is not allowed in Community. Please reword it.';
  if (code === 'invalid_input') return 'Volyume could not publish that. Check the title and description, then try again.';
  return 'That did not publish. Please try again.';
}

export default function CommunityPublishProgrammeScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const planId = route?.params?.planId ?? null;

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [publishedId, setPublishedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const built = planId ? await buildSnapshotForPlan(planId) : null;
      setSnapshot(built);
      setTitle(built?.title ?? '');
      setDescription(built?.description ?? '');
      // Cold-open truth: the owner's own list carries source_plan_id, so a
      // plan that is already published opens in its Update / Unpublish
      // state rather than offering a second Publish (lead review). A read
      // failure here is quiet: the server upsert is keyed on the plan, so
      // no duplicate row can result either way.
      if (planId) {
        try {
          const mine = await myProgrammes();
          const existing = (mine?.programmes ?? []).find((r) => r?.source_plan_id === planId);
          if (existing?.id) {
            setPublishedId(existing.id);
            if (existing.visibility) setVisibility(existing.visibility);
            if (existing.title) setTitle(existing.title);
            if (existing.description != null) setDescription(existing.description);
          }
        } catch (_e) { /* best-effort: the publish upsert is keyed on the plan */ }
      }
    } catch (e) {
      logError('CommunityPublishProgrammeScreen.load', e, { planId });
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  // No profile, no publishing: Join owns that step, and it comes back here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { me } = await loadMe({});
      if (cancelled || hasProfile(me)) return;
      navigation.navigate('CommunityJoin', {
        next: { screen: 'CommunityPublishProgramme', params: { planId } },
      });
    })();
    return () => { cancelled = true; };
  }, [navigation, planId]);

  const stats = snapshot ? snapshotStats(snapshot) : null;
  const check = snapshot ? validateSnapshot(snapshot) : { ok: false, errors: ['no_snapshot'] };
  const canPublish = !!snapshot && check.ok && title.trim().length > 0 && !busy;

  async function handlePublish() {
    if (!canPublish || busyRef.current) return;
    haptics.selection();
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await publishProgramme({
        source_plan_id: String(planId),
        title: title.trim(),
        description: description.trim() || null,
        style_key: snapshot.style_key ?? null,
        split_type: snapshot.split_type ?? null,
        difficulty: snapshot.difficulty ?? null,
        days_per_week: snapshot.days_per_week ?? null,
        snapshot,
        visibility,
      });
      if (!result?.id) throw new Error('Publish failed.');
      setPublishedId(result.id);
      toast.show(publishedId ? 'Programme updated' : 'Programme shared', { variant: 'success' });
    } catch (e) {
      if (!e?.code) logError('CommunityPublishProgrammeScreen.handlePublish', e, { planId });
      toast.show(publishErrorLine(e?.code), { variant: 'error' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleUnpublish() {
    if (!publishedId) return;
    appAlert(
      'Stop sharing this programme?',
      'It disappears from Community. Anyone who already copied it keeps their own copy, and your plan is untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpublishProgramme(publishedId);
              setPublishedId(null);
              toast.show('No longer shared', { variant: 'success' });
            } catch (_e) {
              toast.show('That did not change. Please try again.', { variant: 'error' });
            }
          },
        },
      ],
    );
  }

  async function handleShareLink() {
    if (!publishedId) return;
    haptics.selection();
    try {
      await Share.share({ message: programmeUrl(publishedId) });
    } catch (_e) { /* the user dismissed the share sheet */ }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Share programme" />
      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={t.colors.primary} /></View>
      ) : !snapshot || !check.ok ? (
        <View style={styles.centre}>
          <EmptyState
            icon="document-outline"
            title="Nothing to share yet"
            text="This plan has no days and exercises to publish. Add a workout to it first, then share it."
            actionLabel="Go back"
            onAction={() => navigation.goBack()}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card elevated>
            <Text style={[styles.disclosure, { color: t.colors.textPrimary }]}>{DISCLOSURE_LINE}</Text>
          </Card>

          <View style={styles.field}>
            <SectionLabel>Title</SectionLabel>
            <TextInput
              style={[styles.input, {
                backgroundColor: t.colors.inputBg, borderColor: t.colors.border, color: t.colors.textPrimary,
              }]}
              value={title}
              onChangeText={setTitle}
              maxLength={PROGRAMME_TITLE_MAX}
              placeholder="Name this programme"
              placeholderTextColor={t.colors.textDisabled}
              accessibilityLabel="Programme title"
            />
          </View>

          <View style={styles.field}>
            <SectionLabel>Description</SectionLabel>
            <TextInput
              style={[styles.input, styles.inputMultiline, {
                backgroundColor: t.colors.inputBg, borderColor: t.colors.border, color: t.colors.textPrimary,
              }]}
              value={description}
              onChangeText={setDescription}
              maxLength={PROGRAMME_DESCRIPTION_MAX}
              multiline
              placeholder="What is this programme for, and who is it for?"
              placeholderTextColor={t.colors.textDisabled}
              accessibilityLabel="Programme description"
            />
          </View>

          <View style={styles.field}>
            <SectionLabel>Who can see it</SectionLabel>
            <SegmentedControl
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onChange={setVisibility}
            />
          </View>

          <View style={styles.field}>
            <SectionLabel>{`Preview · ${stats?.days ?? 0} days · ${stats?.exercises ?? 0} exercises`}</SectionLabel>
            <ProgrammeStructure snapshot={snapshot} />
          </View>

          <Button
            variant="emphatic"
            title={publishedId ? 'Update' : 'Publish'}
            size="lg"
            onPress={handlePublish}
            loading={busy}
            disabled={!canPublish}
          />
          {publishedId ? (
            <>
              <Button title="Share link" variant="secondary" icon="share-social-outline" onPress={handleShareLink} />
              <Button title="Unpublish" variant="tertiary" onPress={handleUnpublish} />
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  disclosure: { ...type.bodySm },
  field: { gap: spacing.sm },
  input: {
    minHeight: touchTarget.minimum, borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...type.body,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
});
