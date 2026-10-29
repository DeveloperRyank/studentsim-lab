import type { AttemptRecord, LearnerProfile } from "./types";
import { getQuestion } from "./questions";
import { SCENARIOS, evaluateScenario, type ScenarioResult } from "./scenarios";

export type AnomalyKind =
  | "overperform_low_skill"
  | "repeat_after_hint"
  | "flat_profile"
  | "improve_then_fail_related";

export interface Anomaly {
  kind: AnomalyKind;
  severity: "warning" | "suspicious";
  message: string;
  sequences: number[];
}

const ANOMALY_LABELS: Record<AnomalyKind, string> = {
  overperform_low_skill: "Sudden over-performance",
  repeat_after_hint: "Misconception persists after targeted hint",
  flat_profile: "Profile looks flat (weakness not expressed)",
  improve_then_fail_related: "Improvement then failure on a related question",
};

export function anomalyLabel(kind: AnomalyKind): string {
  return ANOMALY_LABELS[kind];
}

/** Inspect a single attempt history for behaviour that contradicts the profile. */
export function detectAnomalies(attempts: AttemptRecord[], profile: LearnerProfile): Anomaly[] {
  const out: Anomaly[] = [];

  // 1. Advanced question answered correctly despite low initial skill.
  const overperform = attempts.filter((a) => {
    const q = getQuestion(a.questionId);
    const skill = a.skillSnapshot[q.concepts[0]] ?? 0;
    return a.correct && q.difficulty >= 4 && (profile.initialSkills[q.concepts[0]] ?? 0) < 0.45 && skill < 0.5;
  });
  if (overperform.length) {
    out.push({
      kind: "overperform_low_skill",
      severity: "warning",
      message: `Answered ${overperform.length} hard question(s) correctly while simulated skill stayed low.`,
      sequences: overperform.map((a) => a.sequence),
    });
  }

  // 2. Fired the same misconception right after a targeted hint aimed at it.
  const repeat = attempts.filter(
    (a) =>
      !a.correct &&
      a.misconceptionId &&
      a.priorIntervention?.kind === "targeted_hint" &&
      a.priorIntervention.targetsMisconception === a.misconceptionId,
  );
  if (repeat.length) {
    out.push({
      kind: "repeat_after_hint",
      severity: "suspicious",
      message: `Repeated the same misconception on ${repeat.length} attempt(s) immediately after a hint that targeted it.`,
      sequences: repeat.map((a) => a.sequence),
    });
  }

  // 3. Flat profile: many wrongs but all the same misconception, ignoring variety.
  const wrongs = attempts.filter((a) => !a.correct && a.misconceptionId);
  const distinct = new Set(wrongs.map((a) => a.misconceptionId));
  if (wrongs.length >= 4 && distinct.size === 1) {
    out.push({
      kind: "flat_profile",
      severity: "warning",
      message: `Only one misconception (${[...distinct][0]}) appeared across ${wrongs.length} errors, despite a broader profile.`,
      sequences: wrongs.map((a) => a.sequence),
    });
  }

  // 4. Correct on a concept then wrong on a closely related (same-concept) question.
  const seq = [...attempts].sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    const cur = seq[i];
    if (prev.correct && !cur.correct && prev.concept === cur.concept) {
      out.push({
        kind: "improve_then_fail_related",
        severity: "warning",
        message: `Correct on ${prev.questionId} then wrong on related ${cur.questionId} (same concept).`,
        sequences: [prev.sequence, cur.sequence],
      });
      break;
    }
  }

  return out;
}

export interface EvaluationSummary {
  baselinePassRate: number;
  enhancedPassRate: number;
  results: ScenarioResult[];
  failures: { scenario: ScenarioResult; failedSteps: number }[];
}

export function runAllScenarios(profiles: Record<string, LearnerProfile>): EvaluationSummary {
  const results: ScenarioResult[] = [];
  for (const s of SCENARIOS) {
    const profile = profiles[s.learnerId];
    if (!profile) continue;
    results.push(evaluateScenario(s, profile, "baseline"));
    results.push(evaluateScenario(s, profile, "enhanced"));
  }
  const baseline = results.filter((r) => r.simulator === "baseline");
  const enhanced = results.filter((r) => r.simulator === "enhanced");
  const failures = results
    .map((r) => ({ scenario: r, failedSteps: r.steps.filter((x) => !x.pass).length }))
    .filter((f) => f.failedSteps > 0);
  return {
    baselinePassRate: avg(baseline.map((r) => r.passRate)),
    enhancedPassRate: avg(enhanced.map((r) => r.passRate)),
    results,
    failures,
  };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
