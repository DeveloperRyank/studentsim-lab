import type {
  AttemptRecord,
  LearnerProfile,
  Question,
  SimulatorKind,
} from "./types";
import { QUESTIONS } from "./questions";
import { createRun, runAttempt, type Run } from "./session";
import { buildInterventions } from "./interventions";
import { computeBundle, type MetricBundle } from "./metrics";

export type Strategy =
  | "none"
  | "always_direct"
  | "always_hint"
  | "always_socratic"
  | "on_error_hint"
  | "adaptive";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  none: "No intervention",
  always_direct: "Always direct explanation",
  always_hint: "Always targeted hint",
  always_socratic: "Always socratic prompt",
  on_error_hint: "Targeted hint after an error",
  adaptive: "Adaptive (hint after error, socratic otherwise)",
};

export interface ExperimentQuestionRow {
  questionId: string;
  prompt: string;
  baselineCorrect: boolean;
  enhancedCorrect: boolean;
  baselineMisconception: string | null;
  enhancedMisconception: string | null;
}

export interface ExperimentRecord {
  id: string;
  learnerId: string;
  learnerName: string;
  strategy: Strategy;
  createdAt: number;
  questionIds: string[];
  repeats: number;
  baseline: { attempts: AttemptRecord[]; metrics: MetricBundle };
  enhanced: { attempts: AttemptRecord[]; metrics: MetricBundle };
  comparison: ExperimentQuestionRow[];
}

function decideIntervention(strategy: Strategy, run: Run, question: Question) {
  const all = buildInterventions(run.profile, question, run.state);
  const lastWrong = run.attempts.length
    ? !run.attempts[run.attempts.length - 1].correct
    : false;
  switch (strategy) {
    case "none":
      return null;
    case "always_direct":
      return all.direct_explanation;
    case "always_hint":
      return all.targeted_hint.targetsMisconception ? all.targeted_hint : all.direct_explanation;
    case "always_socratic":
      return all.socratic_prompt;
    case "on_error_hint":
      return lastWrong
        ? all.targeted_hint.targetsMisconception
          ? all.targeted_hint
          : all.direct_explanation
        : null;
    case "adaptive":
      if (lastWrong) return all.targeted_hint;
      return run.seq % 2 === 0 ? all.socratic_prompt : null;
  }
}

function runSimulatorSequence(
  profile: LearnerProfile,
  simulator: SimulatorKind,
  questions: Question[],
  strategy: Strategy,
  runId: string,
): AttemptRecord[] {
  const run = createRun(profile, simulator, runId);
  questions.forEach((q) => {
    const iv = decideIntervention(strategy, run, q);
    runAttempt(run, q, iv);
  });
  return run.attempts;
}

export function runExperiment(params: {
  profile: LearnerProfile;
  questionIds: string[];
  strategy: Strategy;
  repeats: number;
  id: string;
}): ExperimentRecord {
  const { profile, strategy, repeats, id } = params;
  const questions = params.questionIds
    .map((qid) => QUESTIONS.find((q) => q.id === qid))
    .filter(Boolean) as Question[];

  // Primary run (kept in full for the behaviour inspector).
  const baselineAttempts = runSimulatorSequence(profile, "baseline", questions, strategy, `${id}-base-0`);
  const enhancedAttempts = runSimulatorSequence(profile, "enhanced", questions, strategy, `${id}-enh-0`);

  // Repeats for consistency (correct/incorrect vectors).
  const baseVectors: boolean[][] = [baselineAttempts.map((a) => a.correct)];
  const enhVectors: boolean[][] = [enhancedAttempts.map((a) => a.correct)];
  for (let r = 1; r < repeats; r++) {
    baseVectors.push(
      runSimulatorSequence(profile, "baseline", questions, strategy, `${id}-base-${r}`).map((a) => a.correct),
    );
    enhVectors.push(
      runSimulatorSequence(profile, "enhanced", questions, strategy, `${id}-enh-${r}`).map((a) => a.correct),
    );
  }

  const qmap = new Map(questions.map((q) => [q.id, q]));
  const baselineMetrics = computeBundle(baselineAttempts, profile, qmap, baseVectors);
  const enhancedMetrics = computeBundle(enhancedAttempts, profile, qmap, enhVectors);

  const comparison: ExperimentQuestionRow[] = questions.map((q, i) => ({
    questionId: q.id,
    prompt: q.prompt,
    baselineCorrect: baselineAttempts[i]?.correct ?? false,
    enhancedCorrect: enhancedAttempts[i]?.correct ?? false,
    baselineMisconception: baselineAttempts[i]?.misconceptionId ?? null,
    enhancedMisconception: enhancedAttempts[i]?.misconceptionId ?? null,
  }));

  return {
    id,
    learnerId: profile.id,
    learnerName: profile.name,
    strategy,
    createdAt: Date.now(),
    questionIds: questions.map((q) => q.id),
    repeats,
    baseline: { attempts: baselineAttempts, metrics: baselineMetrics },
    enhanced: { attempts: enhancedAttempts, metrics: enhancedMetrics },
    comparison,
  };
}
