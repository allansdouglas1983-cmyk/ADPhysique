/**
 * ProgrammeStructure — the day-by-day reading of a published programme
 * snapshot (blueprint section 6, `docs/social-discovery-2026-09-06/
 * 30-BLUEPRINT.md`).
 *
 * STRUCTURE ONLY. A snapshot carries days, exercises, sets, reps, rest and
 * the creator's exercise notes; it has never carried a weight, and this
 * component reads nothing else from it. There is no branch here that could
 * render a load even if a future snapshot smuggled one in: the fields are
 * named one by one.
 *
 * Circuits are rendered as ONE bordered block per group with its own label
 * line, then its stations, because a circuit is one thing the athlete does,
 * not three unrelated rows. The rounds and the round rest come from
 * `summariseCircuitGroups`, the app's own circuit arithmetic, so a shared
 * programme and the plan preview of the same programme can never disagree
 * about how many rounds it is. The wording is the blueprint's own line
 * ("Circuit · 3 rounds · 90 s between rounds"): the station COUNT that
 * `formatCircuitPreviewLine` carries is dropped here on purpose, because
 * the stations themselves are listed immediately below the label.
 *
 * Lead visual review 2026-09-06, ruling 1: the label is `textPrimary` with a
 * small amber `repeat-outline` glyph. Amber is never body text.
 */

import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SectionLabel from '../SectionLabel';
import useTheme from '../../hooks/useTheme';
import { spacing, radius, type } from '../../styles/theme';
import { summariseCircuitGroups } from '../../lib/circuitRound';

/** "Circuit · 3 rounds · 90 s between rounds". Anything the snapshot does
 * not carry is left out rather than guessed. */
export function circuitLabelLine(summary) {
  const parts = ['Circuit'];
  const rounds = Number(summary?.rounds);
  if (Number.isFinite(rounds) && rounds > 0) parts.push(`${rounds} round${rounds === 1 ? '' : 's'}`);
  const rest = Number(summary?.roundRestSeconds);
  if (Number.isFinite(rest) && rest > 0) parts.push(`${rest} s between rounds`);
  return parts.join(' · ');
}

/** "3 x 8 to 12 · 90 s", with anything unknown left out rather than guessed. */
export function straightSetLine(row) {
  const parts = [];
  const sets = Number(row?.sets);
  const min = Number(row?.reps_min);
  const max = Number(row?.reps_max);
  const reps = Number.isFinite(min) && min > 0
    ? (Number.isFinite(max) && max > min ? `${min} to ${max}` : `${min}`)
    : null;
  if (Number.isFinite(sets) && sets > 0 && reps) parts.push(`${sets} x ${reps}`);
  else if (Number.isFinite(sets) && sets > 0) parts.push(`${sets} sets`);
  else if (reps) parts.push(reps);
  const rest = Number(row?.rest_seconds);
  if (Number.isFinite(rest) && rest > 0) parts.push(`${rest} s`);
  return parts.join(' · ');
}

/** The reps half only, for a circuit station (rounds and rest belong to the
 * group label above it, never repeated per station). */
export function stationRepsLine(row) {
  const min = Number(row?.reps_min);
  const max = Number(row?.reps_max);
  if (!Number.isFinite(min) || min <= 0) return '';
  return Number.isFinite(max) && max > min ? `${min} to ${max}` : `${min}`;
}

/**
 * Split one day's rows into ordered blocks: a circuit group is one block
 * carrying its stations, everything else is a straight row of its own. Group
 * order follows the first station's position, matching the builder.
 */
export function blocksForDay(day) {
  const rows = Array.isArray(day?.exercises) ? [...day.exercises] : [];
  rows.sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
  const blocks = [];
  const byGroup = new Map();
  for (const row of rows) {
    const gid = row?.group_kind === 'circuit' ? (row?.superset_group_id ?? null) : null;
    if (!gid) { blocks.push({ kind: 'straight', row }); continue; }
    if (!byGroup.has(gid)) {
      const block = { kind: 'circuit', groupId: gid, stations: [] };
      byGroup.set(gid, block);
      blocks.push(block);
    }
    byGroup.get(gid).stations.push(row);
  }
  return blocks;
}

/**
 * One exercise line: name, its sets or reps, and the creator's own note
 * underneath when there is one.
 *
 * The note is part of the published structure (`snapshot.js` carries
 * `notes`, and `importProgramme` writes it into the reader's plan), so it
 * belongs on BOTH sides of the same component: the creator sees before
 * publishing exactly what a reader sees afterwards (product review
 * 2026-09-06, item 17). The fields are still named one by one; nothing is
 * spread out of the row.
 */
function ExerciseLine({ row, meta }) {
  const t = useTheme();
  const note = row?.notes != null ? String(row.notes).trim() : '';
  return (
    <View style={styles.exercise}>
      <View style={styles.exerciseRow}>
        <Text style={[styles.exerciseName, { color: t.colors.textPrimary }]}>
          {row?.exercise_name ?? 'Exercise'}
        </Text>
        <Text style={[styles.exerciseMeta, { color: t.colors.textSecondary }]}>
          {meta}
        </Text>
      </View>
      {note ? (
        <Text style={[styles.exerciseNote, { color: t.colors.textMuted }]}>{note}</Text>
      ) : null}
    </View>
  );
}

export default function ProgrammeStructure({ snapshot }) {
  const t = useTheme();
  const days = Array.isArray(snapshot?.days) ? [...snapshot.days] : [];
  days.sort((a, b) => (Number(a?.position) || 0) - (Number(b?.position) || 0));
  if (!days.length) return null;

  return (
    <View style={styles.wrap}>
      {days.map((day, dayIndex) => {
        // The circuit summaries for THIS day, from the shared helper, so the
        // rounds and round rest read exactly as they do in the plan preview.
        const summaries = summariseCircuitGroups(
          (Array.isArray(day?.exercises) ? day.exercises : []).map((row) => ({
            supersetGroupId: row?.superset_group_id ?? null,
            groupKind: row?.group_kind ?? null,
            recommendedSets: Number(row?.sets) || null,
            roundRestSeconds: Number(row?.round_rest_seconds) || null,
          })),
        );
        const summaryById = new Map(summaries.map((s) => [s.groupId, s]));
        const dayName = day?.name ? String(day.name) : `Day ${dayIndex + 1}`;
        return (
          <View key={`${day?.position ?? dayIndex}-${dayName}`} style={styles.day}>
            <SectionLabel>{`Day ${dayIndex + 1} · ${dayName}`}</SectionLabel>
            {blocksForDay(day).map((block, blockIndex) => {
              if (block.kind === 'circuit') {
                const summary = summaryById.get(block.groupId);
                const label = circuitLabelLine(summary);
                return (
                  <View
                    key={`c-${block.groupId}`}
                    style={[styles.circuit, {
                      backgroundColor: t.colors.surface2, borderColor: t.colors.border,
                    }]}
                  >
                    <View style={styles.circuitLabelRow}>
                      <Ionicons name="repeat-outline" size={14} color={t.colors.primary} />
                      <Text style={[styles.circuitLabel, { color: t.colors.textPrimary }]}>
                        {label}
                      </Text>
                    </View>
                    {block.stations.map((row, i) => (
                      <ExerciseLine
                        key={`${row?.exercise_id ?? row?.exercise_name}-${i}`}
                        row={row}
                        meta={stationRepsLine(row)}
                      />
                    ))}
                  </View>
                );
              }
              const row = block.row;
              return (
                <ExerciseLine
                  key={`s-${row?.exercise_id ?? row?.exercise_name}-${blockIndex}`}
                  row={row}
                  meta={straightSetLine(row)}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl },
  day: { gap: spacing.sm },
  circuit: {
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xxs,
  },
  circuitLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs2, marginBottom: spacing.xxs },
  circuitLabel: { ...type.captionStrong, flex: 1 },
  exercise: { paddingVertical: spacing.xs2, gap: spacing.xxs },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: spacing.md,
  },
  exerciseName: { ...type.bodySm, flex: 1 },
  exerciseMeta: { ...type.caption },
  exerciseNote: { ...type.captionTight },
});
