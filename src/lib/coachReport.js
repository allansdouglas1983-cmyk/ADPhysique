/**
 * coachReport — the exportable coach handover report (B5, audit 05 §B5).
 *
 * A PDF of training history, weight trend, current targets and the
 * coaching decisions with their persisted written reasons over a period,
 * for the user to hand to a human coach, physio or GP.
 *
 * Artefact class (important distinction): share cards are public, outbound
 * social artefacts and are data-minimised by rule — never name, bodyweight,
 * measurements or private notes (CLAUDE.md; enforced in shareCard/greatWeek
 * and locked by its tests). This report is the opposite class: the user's
 * OWN complete data, generated on-device, and it leaves the device only
 * through the user's explicit share action — the same "your data is always
 * yours" guarantee as the CSV export and the diary PDF, whose plumbing this
 * module mirrors (src/lib/food/csvExport.js exportDiaryPdf).
 *
 * ED-safety (audit constraint: "ED-flagged users get the neutral variant —
 * no rate/weight emphasis"): under an open ED-pattern flag, a positive
 * SCOFF screen (score >= 2, the same trio the streak and
 * contest-countdown surfaces suppress on), calm mode, or a FAILED read of
 * the flag or body profile, the report is the neutral variant: the
 * weight-trend section, calorie-change rows, phase line and ALL persisted
 * prose are dropped, and bodyweight rows are never even read. (The
 * wellbeing read is done raw (AsyncStorage), so a genuine failure returns a
 * fail-closed sentinel too. getWellbeingMode would swallow it to 'unspecified'
 * the way it does on every other surface, which is why the raw read is used.)
 *
 * DISCLOSURE RULE, both variants: the artefact is handed to another
 * person, so it must never reveal what the app inferred about the user's
 * eating patterns, wellbeing screening, cycle or safety holds. The engine's
 * persisted prose legitimately contains such sentences (SCOFF holds, ED
 * lockout/clearance, cycle overrides, safety-floor holds), so the FULL
 * variant filters every rendered prose string through DISCLOSURE_PROSE and
 * drops the safety-hold decision types entirely; redaction removes the
 * prose, never invents copy. A source-pinned test cross-checks the filter
 * against the engine's actual reason strings so a rewording there forces
 * re-verification here.
 *
 * The decisions rendered are the output_json written by the deterministic
 * engine at coach-run time — nothing is recomputed, so the report shows
 * what the user was actually told, week by week.
 */
import * as Sharing from 'expo-sharing';
import {
  getRecapData,
  getCoachOutputHistory,
  getMorningWeights,
  getNutritionTargets,
  getOpenEdPatternFlag,
  getUserBodyProfile,
} from './database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCalm, WELLBEING_KEY } from './wellbeing';
import { robustEwma } from './robustTrend';

const DAY_MS = 24 * 60 * 60 * 1000;

// Persisted engine prose that would disclose screening, safety-hold or
// cycle state to a third party. \bcycle\b deliberately does not match
// "cycling" (cardio) — but does match "carb cycle", an accepted
// over-redaction (the decision fact still renders, only the prose drops).
export const DISCLOSURE_PROSE =
  /wellbeing|restriction|\bcycle\b|safety signal|safety floor|hold lifted|lockout|eating|scoff|held-decision/i;

// Safety-hold decision types whose whole row is the disclosure.
const REDACTED_HELD_TYPES = new Set(['ed_pattern_lockout', 'ed_pattern_cleared', 'ffm_floor']);

function printableProse(s) {
  return typeof s === 'string' && s.trim() && !DISCLOSURE_PROSE.test(s) ? s : null;
}

function htmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ms) {
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '');

// The engine's complete training-signal vocabulary ('reduce' | 'hold' |
// 'push', see weeklyCoach) — decision FACTS that render in both variants.
const TRAINING_SIGNAL_LABELS = {
  push: 'More work added',
  reduce: 'Volume pulled back',
  hold: 'Held steady',
};

/**
 * Pure HTML builder — everything interpolated is escaped; no I/O, no Date.now.
 * Kept separate from the export wrapper so the variants are unit-testable
 * (same split as buildDiaryHtml / exportDiaryPdf).
 */
export function buildCoachReportHtml({ startMs, endMs, generatedAt, neutral, recap, trend, targets, weeks }) {
  const sections = [];

  // Prose reaches the page only through this helper: full variant only,
  // and only when the disclosure filter passes.
  const prose = (s) => (!neutral ? printableProse(s) : null);

  // ── Training ──────────────────────────────────────────────────────────
  if (recap && recap.totalSessions > 0) {
    const lines = [
      `<tr><td>Sessions completed</td><td class="n">${fmtInt(recap.totalSessions)}</td></tr>`,
      `<tr><td>Average sessions per week</td><td class="n">${htmlEscape(recap.avgSessionsPerWeek ?? '')}</td></tr>`,
      `<tr><td>Working sets</td><td class="n">${fmtInt(recap.totalSets)}</td></tr>`,
      `<tr><td>Total lifted (kg)</td><td class="n">${fmtInt(recap.tonnage)} kg</td></tr>`,
      `<tr><td>Different exercises trained</td><td class="n">${fmtInt(recap.uniqueExercises)}</td></tr>`,
    ].join('');
    const top = (recap.topExercises ?? [])
      .map((t) => `<li>${htmlEscape(t.name)} (${fmtInt(t.sets)} sets)</li>`)
      .join('');
    const prs = neutral ? '' : (recap.topPRs ?? [])
      .map((p) => `<li>${htmlEscape(p.exerciseName)}: ${htmlEscape(p.value)} kg × ${htmlEscape(p.reps)}</li>`)
      .join('');
    sections.push(
      `<h2>Training</h2><table>${lines}</table>`
      + (top ? `<h3>Most trained</h3><ul>${top}</ul>` : '')
      + (prs ? `<h3>Best lifts (estimated max basis)</h3><ul>${prs}</ul>` : '')
    );
  } else {
    sections.push('<h2>Training</h2><p>No completed sessions in this period.</p>');
  }

  // ── Weight trend — full variant only ─────────────────────────────────
  if (!neutral && Array.isArray(trend) && trend.length >= 2) {
    const first = trend[0];
    const last = trend[trend.length - 1];
    const spanMs = last.loggedAt - first.loggedAt;
    const spanWeeks = Math.max(1, spanMs / (7 * DAY_MS));
    const change = Math.round((last.ewmaKg - first.ewmaKg) * 10) / 10;
    const weekly = Math.round(((last.ewmaKg - first.ewmaKg) / spanWeeks) * 100) / 100;
    const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
    // The weekly-rate row needs a real span behind it: the engine's own
    // trend helpers null sub-fortnight rates, so the report does too.
    const rateRow = spanMs >= 14 * DAY_MS
      ? `<tr><td>Average weekly change</td><td class="n">${htmlEscape(sign(weekly))} kg/week</td></tr>`
      : '';
    sections.push(
      '<h2>Weight trend</h2><table>'
      + `<tr><td>Trend weight at start (${htmlEscape(fmtDate(first.loggedAt))})</td><td class="n">${htmlEscape(first.ewmaKg)} kg</td></tr>`
      + `<tr><td>Trend weight latest (${htmlEscape(fmtDate(last.loggedAt))})</td><td class="n">${htmlEscape(last.ewmaKg)} kg</td></tr>`
      + `<tr><td>Change over the period</td><td class="n">${htmlEscape(sign(change))} kg</td></tr>`
      + rateRow
      + `<tr><td>Weigh-ins recorded</td><td class="n">${fmtInt(trend.length)}</td></tr>`
      + '</table><p class="note">Trend weight is a smoothed average of morning weigh-ins, so single days matter less.</p>'
    );
  }

  // ── Current targets ───────────────────────────────────────────────────
  if (targets && (targets.targetKcal || targets.proteinG)) {
    const rows = [
      targets.targetKcal ? `<tr><td>Daily energy target</td><td class="n">${fmtInt(targets.targetKcal)} kcal</td></tr>` : '',
      targets.proteinG ? `<tr><td>Protein</td><td class="n">${fmtInt(targets.proteinG)} g</td></tr>` : '',
      targets.carbsG ? `<tr><td>Carbohydrate</td><td class="n">${fmtInt(targets.carbsG)} g</td></tr>` : '',
      targets.fatG ? `<tr><td>Fat</td><td class="n">${fmtInt(targets.fatG)} g</td></tr>` : '',
      // The phase line frames the targets around weight movement, so the
      // neutral variant leaves it out.
      !neutral && targets.phase ? `<tr><td>Phase</td><td class="n">${htmlEscape(targets.phase)}</td></tr>` : '',
    ].join('');
    sections.push(`<h2>Current nutrition targets</h2><table>${rows}</table>`);
  }

  // ── Weekly coaching decisions ─────────────────────────────────────────
  const weekBlocks = (weeks ?? []).map((w) => {
    const adj = w.adjustments ?? {};
    const rows = [];
    // Decision fact first; the persisted written reason (full variant,
    // disclosure-filtered) follows as its own sentence — the voice rule
    // bans the em dash, so no dash joins.
    const withProse = (fact, note) => {
      const p = prose(note);
      return p ? `${fact}. ${p}` : fact;
    };

    const signalLabel = TRAINING_SIGNAL_LABELS[adj.training?.signal] ?? null;
    if (signalLabel) {
      rows.push(`<tr><td>Training volume</td><td>${htmlEscape(withProse(signalLabel, adj.training?.note))}</td></tr>`);
    }
    if (!neutral && Number.isFinite(adj.calories?.change) && adj.calories.change !== 0) {
      const amt = Math.abs(adj.calories.change);
      const dir = adj.calories.change > 0 ? `up +${fmtInt(amt)}` : `down ${fmtInt(amt)}`;
      rows.push(`<tr><td>Calories</td><td>${htmlEscape(withProse(`Adjusted ${dir} kcal/day`, adj.calories.note))}</td></tr>`);
    }
    if (!neutral && w.deloadSuggested && prose(w.deloadNote)) {
      rows.push(`<tr><td>Recovery week</td><td>${htmlEscape(prose(w.deloadNote))}</td></tr>`);
    }
    if (!neutral && w.dietBreakSuggested && prose(w.dietBreakNote)) {
      rows.push(`<tr><td>Diet break</td><td>${htmlEscape(prose(w.dietBreakNote))}</td></tr>`);
    }
    if (Number.isFinite(w.sessionsCompleted) && Number.isFinite(w.sessionsPlanned)) {
      rows.push(`<tr><td>Sessions</td><td>${fmtInt(w.sessionsCompleted)} of ${fmtInt(w.sessionsPlanned)} planned</td></tr>`);
    }
    // Held decisions: the reason IS the row, so a redacted reason (or a
    // safety-hold type) drops the row rather than rendering a blank.
    const held = !neutral
      ? (w.heldDecisions ?? [])
        .filter((d) => d && !REDACTED_HELD_TYPES.has(d.type))
        .map((d) => printableProse(d.reason))
        .filter(Boolean)
        .map((reason) => `<li>${htmlEscape(reason)}</li>`)
        .join('')
      : '';
    const why = prose(w.whyThisWeek) ? `<p class="why">${htmlEscape(prose(w.whyThisWeek))}</p>` : '';
    if (!rows.length && !held && !why) return '';
    return (
      `<h3>Week commencing ${htmlEscape(fmtDate(w.weekStart))}${!neutral && w.goalPhase ? ` · ${htmlEscape(w.goalPhase)}` : ''}</h3>`
      + (rows.length ? `<table>${rows.join('')}</table>` : '')
      + why
      + (held ? `<p class="heldLabel">Held back this week (with the coach's reason):</p><ul>${held}</ul>` : '')
    );
  }).filter(Boolean).join('');
  if (weekBlocks) {
    sections.push(`<h2>Coaching decisions, week by week</h2>${weekBlocks}`);
  }

  const range = `${htmlEscape(fmtDate(startMs))} to ${htmlEscape(fmtDate(endMs))}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>`
    + 'body{font-family:-apple-system,Roboto,sans-serif;color:#1a1a18;padding:24px;}'
    + 'h1{font-size:20px;margin:0 0 2px;} .range{color:#555;font-size:12px;margin-bottom:16px;}'
    + 'h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #999;padding-bottom:3px;}'
    + 'h3{font-size:12px;margin:12px 0 4px;} table{width:100%;border-collapse:collapse;font-size:11px;}'
    + 'td{text-align:left;padding:3px 6px;border-bottom:1px solid #e4e4df;} td.n{text-align:right;}'
    + 'ul{margin:4px 0;padding-left:18px;font-size:11px;} li{margin-bottom:2px;}'
    + '.why{font-size:11px;color:#333;margin:4px 0;} .heldLabel{font-size:11px;margin:6px 0 0;}'
    + '.note{font-size:10px;color:#777;} .foot{margin-top:20px;color:#999;font-size:10px;}'
    + '</style></head><body><h1>Coach handover report</h1>'
    + `<div class="range">${range} · generated ${htmlEscape(fmtDate(generatedAt))}</div>`
    + sections.join('')
    + '<div class="foot">Prepared on this device by Volyume from the account holder\'s own data. '
    + 'Nothing was uploaded to produce it; it is shared only by the account holder.</div></body></html>';
}

/**
 * Gather everything the report needs (read-only). The neutral decision is
 * fail-closed on the database reads: an open ED flag, a positive SCOFF
 * screen, calm mode, or a FAILED read of the flag or body profile makes the
 * report neutral — a transient read failure must never produce the fuller
 * variant. On the neutral path bodyweight rows are never read.
 */
export async function gatherCoachReportData(userId, { weeks = 12, nowMs = Date.now() } = {}) {
  const endMs = nowMs;
  const startMs = endMs - weeks * 7 * DAY_MS;

  const [edFlag, wellbeing, bodyProfile] = await Promise.all([
    getOpenEdPatternFlag(userId).catch(() => 'read_failed'),
    // Read wellbeing raw so a genuine failure fails closed too (getWellbeingMode
    // swallows storage errors to 'unspecified', which would fail open here).
    AsyncStorage.getItem(WELLBEING_KEY).then((v) => v || 'unspecified').catch(() => 'read_failed'),
    getUserBodyProfile(userId).catch(() => 'read_failed'),
  ]);
  const scoffPositive =
    bodyProfile === 'read_failed' ||
    (Number.isFinite(bodyProfile?.scoffScore) && bodyProfile.scoffScore >= 2);
  const neutral =
    !!edFlag || wellbeing === 'read_failed' || isCalm(wellbeing) || scoffPositive;

  const [recap, history, weights, targets] = await Promise.all([
    getRecapData(userId, { startMs, endMs }).catch(() => null),
    getCoachOutputHistory(userId, weeks + 1).catch(() => []),
    neutral ? Promise.resolve([]) : getMorningWeights(userId, 120).catch(() => []),
    getNutritionTargets(userId).catch(() => null),
  ]);

  const weeksInRange = (history ?? [])
    .filter((w) => Number.isFinite(w.weekStart) && w.weekStart >= startMs && w.weekStart <= endMs)
    .sort((a, b) => b.weekStart - a.weekStart);
  const weightsInRange = (weights ?? []).filter(
    (w) => Number.isFinite(w?.loggedAt) && w.loggedAt >= startMs && w.loggedAt <= endMs
  );

  return {
    startMs,
    endMs,
    generatedAt: nowMs,
    neutral,
    recap,
    trend: robustEwma(weightsInRange),
    targets,
    weeks: weeksInRange,
  };
}

/**
 * One-shot: gather, build the HTML, render to PDF via expo-print and hand it
 * to the native share sheet. Returns { fileUri, shared }, or { empty: true }
 * when there is nothing at all to report, or { unavailable: true } when
 * expo-print is not present in the build (same contract as exportDiaryPdf,
 * plus the shared flag so the caller can tell the user when the sheet could
 * not open).
 */
export async function exportCoachReportPdf({ userId, weeks = 12 } = {}) {
  const data = await gatherCoachReportData(userId, { weeks });
  const nothing =
    (!data.recap || !data.recap.totalSessions) && !data.weeks.length && !data.targets;
  if (nothing) return { empty: true };

  const html = buildCoachReportHtml(data);
  // eslint-disable-next-line global-require
  let Print; try { Print = require('expo-print'); } catch (_) { Print = null; }
  if (!Print?.printToFileAsync) return { unavailable: true };
  const { uri } = await Print.printToFileAsync({ html });
  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Coach handover report',
      UTI: 'com.adobe.pdf',
    });
    shared = true;
  }
  return { fileUri: uri, shared };
}
