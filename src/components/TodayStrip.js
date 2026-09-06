/**
 * TodayStrip, COMP-027 Part B
 *
 * The top Home strip is the morning-weight card. It does one job well:
 * show today's weigh-in state and let the user log or edit it quickly.
 * Meal logging lives in its own flow, not in this premium slot (cardio
 * logging itself is retired, D95).
 *
 * Weight data and persistence stay owned by HomeScreen. This component owns
 * only the draft input, parsing, and the compact visual states.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from './Button';
import TextField from './TextField';
import { colors, spacing, radius, type } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import * as haptics from '../lib/haptics';
import {
  stoneLbsToKg,
  parseBodyWeightToKg,
  kgToStoneLbsStrings,
  kgToLbs,
  formatBodyWeightShort,
} from '../lib/units';

export default function TodayStrip({
  bwu = 'st',
  todayWeight = null,
  lastWeightKg = null,
  savingWeight = false,
  onLogWeight,
  onOpenTrend,
  openWeightSignal = null,
  // Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §11 / FOUNDER-RULINGS-
  // PHASE2 R1): "The explanatory sentence shows only until the FIRST ever
  // log, then retires permanently (currently daily copy)." Owned by the
  // caller (HomeScreen knows the user's real logging history); defaults to
  // true so a not-yet-loaded caller never flashes the tutorial line to an
  // established user for a frame.
  everLogged = true,
}) {
  // CP-10 stage 3 (theming batch 2): live theme, same append-after pattern
  // as batch 1. `styles` stays frozen; `live` carries the colour-bearing
  // keys only. Captured by closure in the nested WeightInputRow/
  // WeightLogged/WeightEmpty helpers below (unchanged decomposition).
  const t = useTheme();
  const live = {
    card: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    metricIcon: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    cellLabel: { ...t.type.caption, color: t.colors.textMuted },
    cellValue: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    loggedPill: { borderColor: t.colors.success, backgroundColor: t.colors.surface2 },
    loggedPillText: { ...t.type.caption, color: t.colors.textPrimary },
    logPrompt: { ...t.type.label, color: t.colors.textPrimary },
    logWhy: { ...t.type.captionTight, color: t.colors.textMuted },
    unit: { ...t.type.caption, color: t.colors.textMuted },
    logBtnText: { ...t.type.label, color: t.colors.textPrimary },
  };
  const [weightInput, setWeightInput] = useState('');
  const [weightInputSt, setWeightInputSt] = useState('');
  const [weightInputStLbs, setWeightInputStLbs] = useState('');
  const [editing, setEditing] = useState(false);

  const setDraftFromKg = useCallback((kg) => {
    if (!kg || kg <= 0) return;
    if (bwu === 'st') {
      const { stoneStr, lbsStr } = kgToStoneLbsStrings(kg);
      setWeightInputSt(stoneStr);
      setWeightInputStLbs(lbsStr);
    } else if (bwu === 'lbs') {
      setWeightInput(String(Math.round(kgToLbs(kg))));
    } else {
      setWeightInput(String(Math.round(kg * 10) / 10));
    }
  }, [bwu]);

  const hasDraft = !!(weightInput || weightInputSt);
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (editing && !hasDraft && !prefilledRef.current) {
      prefilledRef.current = true;
      setDraftFromKg(todayWeight || lastWeightKg);
    }
    if (!editing) prefilledRef.current = false;
  }, [editing, hasDraft, todayWeight, lastWeightKg, setDraftFromKg]);

  useEffect(() => {
    if (openWeightSignal) setEditing(true);
  }, [openWeightSignal]);

  const submitWeight = useCallback(() => {
    let kg;
    if (bwu === 'st') {
      if (!weightInputSt) return;
      kg = stoneLbsToKg(weightInputSt, weightInputStLbs || '0');
    } else {
      kg = parseBodyWeightToKg(weightInput, bwu);
    }
    if (!kg || isNaN(kg) || kg <= 0 || kg > 300) return;
    onLogWeight?.(kg);
    setWeightInput('');
    setWeightInputSt('');
    setWeightInputStLbs('');
    setEditing(false);
  }, [bwu, weightInput, weightInputSt, weightInputStLbs, onLogWeight]);

  const startEdit = useCallback(() => setEditing(true), []);

  function WeightInputRow() {
    return (
      <View style={styles.inputRow}>
        {bwu === 'st' ? (
          <View style={styles.stFields}>
            <TextField
              accessibilityLabel="Morning weight in stones"
              containerStyle={styles.weightFieldContainer}
              fieldStyle={styles.weightField}
              inputStyle={styles.weightInput}
              value={weightInputSt}
              onChangeText={setWeightInputSt}
              placeholder="12st"
              placeholderTextColor={t.colors.textMuted}
              keyboardType="number-pad"
              maxLength={3}
            />
            <TextField
              accessibilityLabel="Morning weight remaining pounds"
              containerStyle={styles.weightFieldContainer}
              fieldStyle={styles.weightField}
              inputStyle={styles.weightInput}
              value={weightInputStLbs}
              onChangeText={setWeightInputStLbs}
              placeholder="7lb"
              placeholderTextColor={t.colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={4}
            />
          </View>
        ) : (
          <View style={styles.kgField}>
            <TextField
              accessibilityLabel={`Morning weight in ${bwu}`}
              containerStyle={styles.weightFieldContainer}
              fieldStyle={styles.weightField}
              inputStyle={styles.weightInput}
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder={bwu}
              placeholderTextColor={t.colors.textMuted}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.unit, live.unit]}>{bwu}</Text>
          </View>
        )}
        <Button
          title="Log"
          size="sm"
          fullWidth={false}
          style={[styles.logBtn, (!hasDraft || savingWeight) && styles.logBtnDisabled]}
          textStyle={[styles.logBtnText, live.logBtnText]}
          onPress={submitWeight}
          disabled={!hasDraft || savingWeight}
          accessibilityLabel="Log morning weight"
          accessibilityState={{ disabled: !hasDraft || savingWeight }}
        />
      </View>
    );
  }

  function WeightLogged() {
    const hasTrendDoor = typeof onOpenTrend === 'function';
    return (
      <TouchableOpacity
        style={styles.metricRow}
        onPress={hasTrendDoor ? onOpenTrend : startEdit}
        onLongPress={startEdit}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={hasTrendDoor
          ? `Weight ${formatBodyWeightShort(todayWeight, bwu)} logged today. Tap to see your trend, long press to edit.`
          : `Weight ${formatBodyWeightShort(todayWeight, bwu)} logged today. Tap to edit.`}
      >
        <View style={styles.metricLeft}>
          <View style={[styles.metricIcon, live.metricIcon]}>
            <Ionicons name="scale-outline" size={16} color={t.colors.textPrimary} />
          </View>
          <View style={styles.metricCopy}>
            <Text style={[styles.cellLabel, live.cellLabel]}>Morning weight</Text>
            <Text style={[styles.cellValue, live.cellValue]} numberOfLines={1}>{formatBodyWeightShort(todayWeight, bwu)}</Text>
          </View>
        </View>
        <View style={[styles.loggedPill, live.loggedPill]}>
          <Ionicons name="checkmark-circle" size={14} color={t.colors.success} />
          <Text style={[styles.loggedPillText, live.loggedPillText]}>Logged</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function WeightEmpty() {
    return (
      <TouchableOpacity
        style={styles.metricRow}
        // Close-review nit (R9): the nested Log Button self-ticks on press;
        // a tap on the rest of the row must feel the same - one control,
        // one beat.
        onPress={() => { haptics.selection(); startEdit(); }}
        accessibilityRole="button"
        accessibilityLabel="Log morning weight"
      >
        <View style={styles.metricLeft}>
          <View style={[styles.metricIcon, live.metricIcon]}>
            <Ionicons name="scale-outline" size={16} color={t.colors.textPrimary} />
          </View>
          <View style={styles.metricCopy}>
            <Text style={[styles.cellLabel, live.cellLabel]}>Morning weight</Text>
            <Text style={[styles.logPrompt, live.logPrompt]} numberOfLines={1}>Not logged yet</Text>
            {/* C5-P22-04 (D96): the surface a user touches every morning said
                only "Morning weight / Not logged yet / Log". The why lives
                three screens away. One caption, in the register already
                approved on the hand-off card, on the EMPTY state only: never
                on the logged state, never a count, never a streak or a
                frequency, so nothing here can read as pressure to weigh.
                Campaign 22 Phase 2 Stage 2 (§11/R1): first-use education,
                not a daily fixture -- retires for good once the caller
                reports a real weigh-in has ever been logged. */}
            {!everLogged && (
              // Campaign 27 Pillar A (D104): sentence-length copy never
              // carries a line clamp - it wraps, and the row grows.
              <Text style={[styles.logWhy, live.logWhy]}>
                Before breakfast, after the bathroom, so each reading is comparable. Your weight moves about day to day, so it is the pattern over a few weeks that counts, not any one morning.
              </Text>
            )}
          </View>
        </View>
        {/* C5-P37-01 (D96, applied by the lead at the Wave D/E landing): this
            was the first primary-filled button on a day-0 Home, rendered
            ABOVE the session hero's "Start workout" - two CTAs of the same
            visual weight with the lower-priority one first. Secondary weight
            keeps the row whole-tappable and the habit intact while the
            session hero owns the single primary action. */}
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          title="Log"
          onPress={startEdit}
          accessibilityLabel="Log morning weight"
          style={styles.metricAction}
        />
      </TouchableOpacity>
    );
  }

  if (editing) {
    return (
      <View style={[styles.card, live.card]}>
        <View style={styles.editHeader}>
          <View style={[styles.metricIcon, live.metricIcon]}>
            <Ionicons name="scale-outline" size={16} color={t.colors.textPrimary} />
          </View>
          <Text style={[styles.cellLabel, live.cellLabel]}>Morning weight</Text>
        </View>
        <WeightInputRow />
      </View>
    );
  }

  return (
    <View style={[styles.card, live.card]}>
      {todayWeight != null ? <WeightLogged /> : <WeightEmpty />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    // R9/D70 (design-cohesion sweep): app-wide card class is radius.lg
    // (16px, FOOD-DESIGN-STANDARD.md section 2); this strip's compact
    // padding/gap stays as-is, the density is deliberate.
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  metricRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  cellLabel: {
    ...type.caption,
    color: colors.textMuted,
  },
  cellValue: {
    ...type.bodyStrong,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  loggedPill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    // R2 (2026-07-11): badge/pill class -> radius.full (FOOD-DESIGN-STANDARD.md
    // section 4). The strip's OTHER inner sm radii (metricIcon/weightField/
    // logBtn) are a recorded density decision and stay radius.sm.
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
  },
  loggedPillText: { ...type.caption, color: colors.textPrimary },
  logPrompt: { ...type.label, color: colors.textPrimary },
  logWhy: { ...type.captionTight, color: colors.textMuted, marginTop: spacing.xxs },
  // R9/D70: fill/radius/label now come from the shared <Button
  // variant="primary">; the compact strip keeps its own minHeight/vertical
  // padding so the pill stays this row's height, not Button's roomier default.
  metricAction: {
    minHeight: 30,
    paddingVertical: spacing.xs,
    // Founder device screenshot (Today truth repair): the Log button sat
    // ABOVE the row's icon/text instead of level with them. Button applies
    // `alignSelf: fullWidth ? 'stretch' : 'flex-start'`, and this button is
    // fullWidth={false} - so its own alignSelf overrode metricRow's
    // alignItems: 'center' and pinned it to the top of the row. In the
    // not-logged state metricCopy is three lines tall (label + prompt + the
    // two-line why caption), so the gap was plainly visible. Re-asserting
    // centre here restores the shared row alignment; size, behaviour and
    // labels are untouched.
    alignSelf: 'center',
  },
  editHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stFields: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flex: 1 },
  // 'center', not 'baseline': the unit label ("kg"/"lbs") sits beside a
  // bordered TextField box, and baseline resolves to the input's text baseline
  // (below the box's optical centre), leaving the unit floating low. Matches
  // the sibling stFields row and HeightFeetInchesField's box+unit pairing.
  kgField: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  weightFieldContainer: {
    flex: 1,
    minWidth: 64,
  },
  weightField: {
    borderRadius: radius.sm,
    minHeight: 40,
  },
  weightInput: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...type.bodyStrong,
    minWidth: 64,
    fontVariant: ['tabular-nums'],
  },
  unit: { ...type.caption, color: colors.textMuted },
  logBtn: {
    borderRadius: radius.sm,
    minWidth: 76,
    // Match the weight input's minHeight (40) so the button and the field it
    // sits beside are the same height and align in the row, rather than the
    // button reading short next to the taller box.
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // Same fullWidth={false} alignSelf override as metricAction above: the
    // shared Button pins itself to flex-start, which beats inputRow's
    // alignItems: 'center'. Matching heights hid it here while the stones
    // variant (two stacked fields) exposed it; centre it explicitly so the
    // button can never drift from the field it sits beside.
    alignSelf: 'center',
  },
  logBtnDisabled: { opacity: 0.5 },
  // D150 (founder device report 2026-09-06): this label carried the dark
  // on-amber colour from before the D148 hierarchy; on the raised charcoal
  // primary it was dark on dark, so the Log button read as an empty shell.
  logBtnText: { ...type.label, color: colors.textPrimary },
});
