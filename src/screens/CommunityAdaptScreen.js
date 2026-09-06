/**
 * CommunityAdaptScreen — "Adapt for me" (blueprint section 6,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`; SD-09).
 *
 * A preview, not a write. The screen shows every change Volyume proposes,
 * each with the reason it is proposed, and NOTHING is saved until the
 * athlete taps "Save to my plans". The creator's programme is never
 * touched by any of this, which the screen says in as many words.
 *
 * The one state that matters most is the honest one: when the recipient's
 * own limitations could not be read, `planAdaptation` proposes nothing and
 * `capabilityChecked` is false. An unreadable capability state is NOT "no
 * restrictions", so this screen offers no Save at all in that case and says
 * why, rather than quietly serving an unadapted copy as if it had been
 * checked.
 *
 * Lead visual review 2026-09-06, ruling 1: reasons render in `textPrimary`,
 * never amber. Ruling 2 puts the emphatic fill here, on "Save to my plans",
 * because this is the step that writes a plan.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import SectionLabel from '../components/SectionLabel';
import { useToast } from '../components/Toast';
import useTheme from '../hooks/useTheme';
import useAppStore from '../store/useAppStore';
import { spacing, type } from '../styles/theme';
import * as haptics from '../lib/haptics';
import { logError } from '../lib/errorLog';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import {
  getCommunityProgramme, recordProgrammeUse, notifyCommunityEvent,
  loadAdaptationContext, planAdaptation, applyAdaptation, ADAPT_REASON, snapshotStats,
} from '../lib/community';

export const CAPABILITY_UNREADABLE_LINE = 'Volyume could not read your limitations just now, so nothing was changed. Use as-is or try again.';
export const ORIGINAL_UNCHANGED_LINE = 'The original programme is not changed.';

/** The one plain sentence for a proposed change. A change with no
 * substitute is KEPT, and says so, rather than reading as a removal. */
export function reasonLine(change) {
  if (change?.reason === ADAPT_REASON.UNKNOWN_EXERCISE) return 'Not in your exercise library, kept';
  if (change?.kept || !change?.to) return 'No alternative in this style, kept';
  if (change?.reason === ADAPT_REASON.EQUIPMENT) return 'Not in your equipment';
  if (change?.reason === ADAPT_REASON.EXCLUDED) return 'Excluded by you';
  if (change?.reason === ADAPT_REASON.LIMITATION) return 'Clashes with a limitation';
  return '';
}

/** "9 exercises kept, 2 swapped, 1 kept with a note". Zero counts are left
 * out rather than reported as nothing happening three times over. */
export function summaryLine({ total = 0, substitutions = 0, kept = 0 } = {}) {
  const untouched = Math.max(0, Number(total) - Number(substitutions) - Number(kept));
  const parts = [`${untouched} exercise${untouched === 1 ? '' : 's'} kept`];
  if (substitutions > 0) parts.push(`${substitutions} swapped`);
  if (kept > 0) parts.push(`${kept} kept with a note`);
  return parts.join(', ');
}

/** The day-count notice. The verb follows the direction, so it is always
 * the thing the athlete would actually do in the plan editor. */
export function daysMismatchLine(daysMismatch) {
  if (!daysMismatch) return null;
  const theirs = Number(daysMismatch.snapshot);
  const yours = Number(daysMismatch.yours);
  const verb = theirs > yours ? 'drop a day' : 'add a day';
  return `This programme is ${theirs} days a week. Your setup says ${yours}. `
    + `Volyume keeps the creator's structure; you can ${verb} in the plan editor.`;
}

export default function CommunityAdaptScreen({ navigation, route }) {
  const t = useTheme();
  const toast = useToast();
  const id = route?.params?.id ?? null;
  const user = useAppStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);
  const [programme, setProgramme] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    if (!id || !user?.id) { setLoading(false); setErrorCode('not_found'); return; }
    setLoading(true);
    setErrorCode(null);
    try {
      const payload = await getCommunityProgramme(id);
      const snapshot = payload?.programme?.snapshot ?? null;
      if (!snapshot) throw Object.assign(new Error('not_found'), { code: 'not_found' });
      setProgramme(payload.programme);
      const ctx = await loadAdaptationContext(user.id, snapshot);
      setResult(planAdaptation(snapshot, ctx));
    } catch (e) {
      setErrorCode(e?.code ?? 'unavailable');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!programme || !user?.id || savingRef.current) return;
    if (result?.capabilityChecked === false) return;
    haptics.selection();
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await applyAdaptation(user.id, programme.snapshot, result?.changes ?? [], {
        communityId: programme.id,
        capabilityChecked: result?.capabilityChecked !== false,
      });
      if (!saved?.plan?.id) throw new Error('Adaptation failed.');
      recordProgrammeUse(programme.id, 'adapt').catch(() => {
        // Best effort: the plan is written either way, and the creator's
        // counter is never worth failing a saved plan for.
      });
      notifyCommunityEvent('programme_used', programme.owner_id, programme.id);
      toast.show('Added to your plans', { variant: 'success' });
      navigateCrossTab(navigation, 'PlansTab', 'PlanDetail', { planId: saved.plan.id });
    } catch (e) {
      logError('CommunityAdaptScreen.handleSave', e, { programmeId: programme.id });
      toast.show('That did not save. Please try again.', { variant: 'error' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const stats = programme?.snapshot ? snapshotStats(programme.snapshot) : null;
  const capabilityUnreadable = result?.capabilityChecked === false;
  const changes = Array.isArray(result?.changes) ? result.changes : [];
  const mismatchLine = daysMismatchLine(result?.daysMismatch);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.colors.background }]} edges={['top']}>
      <BackHeader title="Adapt for me" />
      {loading ? (
        <View style={styles.centre}><ActivityIndicator color={t.colors.primary} /></View>
      ) : !result ? (
        <View style={styles.centre}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Not available"
            text={errorCode === 'offline'
              ? 'Volyume could not reach Community just now. Check your connection and try again.'
              : 'Volyume could not open this programme just now. Try again in a moment.'}
            actionLabel="Try again"
            onAction={load}
          />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {capabilityUnreadable ? (
              <Card>
                <Text style={[styles.summary, { color: t.colors.textPrimary }]}>
                  {CAPABILITY_UNREADABLE_LINE}
                </Text>
              </Card>
            ) : (
              <Card elevated>
                <Text style={[styles.summary, { color: t.colors.textPrimary }]}>
                  {summaryLine({
                    total: stats?.exercises ?? 0,
                    substitutions: result.substitutions,
                    kept: result.kept,
                  })}
                </Text>
                <Text style={[styles.summarySub, { color: t.colors.textSecondary }]}>
                  Fitted to your kit and exclusions. Circuits, rounds and days stay exactly as the creator built them.
                </Text>
              </Card>
            )}

            {mismatchLine ? (
              <Card>
                <Text style={[styles.notice, { color: t.colors.textSecondary }]}>{mismatchLine}</Text>
              </Card>
            ) : null}

            {changes.length ? (
              <View style={styles.changes}>
                <SectionLabel>Changes</SectionLabel>
                {changes.map((change, i) => (
                  <View
                    key={`${change.day}-${change.order}-${i}`}
                    style={[styles.change, { borderBottomColor: t.colors.borderSubtle }]}
                  >
                    {change.to ? (
                      <>
                        <Text style={[styles.from, { color: t.colors.textSecondary }]}>
                          {change.fromName ?? change.from?.name ?? 'Exercise'}
                        </Text>
                        <Text style={[styles.to, { color: t.colors.textPrimary }]}>
                          {change.to?.name ?? 'Exercise'}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.toKept, { color: t.colors.textSecondary }]}>
                        {change.fromName ?? change.from?.name ?? 'Exercise'}
                      </Text>
                    )}
                    <Text style={[styles.why, { color: t.colors.textPrimary }]}>{reasonLine(change)}</Text>
                  </View>
                ))}
              </View>
            ) : !capabilityUnreadable ? (
              <Text style={[styles.notice, { color: t.colors.textSecondary }]}>
                Nothing needed changing. This programme already fits your kit and your exclusions.
              </Text>
            ) : null}
          </ScrollView>

          {!capabilityUnreadable ? (
            <View style={[styles.footer, { borderTopColor: t.colors.borderSubtle }]}>
              <Button
                variant="emphatic"
                title="Save to my plans"
                size="lg"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
              />
              <Text style={[styles.footerNote, { color: t.colors.textMuted }]}>
                {ORIGINAL_UNCHANGED_LINE}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  summary: { ...type.title },
  summarySub: { ...type.bodySm, marginTop: spacing.xs },
  notice: { ...type.bodySm },
  changes: { gap: spacing.xs },
  change: { paddingVertical: spacing.md, borderBottomWidth: 1, gap: spacing.xxs },
  from: { ...type.caption, textDecorationLine: 'line-through' },
  to: { ...type.bodyStrong },
  toKept: { ...type.bodySm },
  why: { ...type.captionStrong },
  footer: { borderTopWidth: 1, padding: spacing.lg, gap: spacing.sm },
  footerNote: { ...type.caption, textAlign: 'center' },
});
