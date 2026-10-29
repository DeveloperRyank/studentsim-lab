import type { InterventionKind, LearnerProfile, MisconceptionId } from "./types";
import { QUESTIONS } from "./questions";
import { createRun, runAttempt } from "./session";
import { buildInterventions } from "./interventions";
import { getProfile } from "./profiles";

export interface ScenarioStep {
  questionId: string;
  intervention?: InterventionKind;
  expected: "correct" | "incorrect" | "misconception";
  expectedMisconception?: MisconceptionId;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  learnerId: string;
  steps: ScenarioStep[];
}

// Manually authored ground-truth expectations. These encode what the PROFILE
// says should happen; they are NOT observations of real students.
export const SCENARIOS: Scenario[] = [
  {
    id: "sign-confuser-distributes-negative",
    title: "Sign Confuser on negative distribution",
    description:
      "The Sign Confuser should tend to mishandle the sign when expanding -3(x + 6).",
    learnerId: "sign-confuser",
    steps: [{ questionId: "exp-3", expected: "incorrect", expectedMisconception: "sign_on_distribution" }],
  },
  {
    id: "sign-confuser-hint-helps",
    title: "Targeted hint reduces the sign error",
    description:
      "After a targeted hint aimed at the sign error, the same learner should reproduce it less often on a related question.",
    learnerId: "sign-confuser",
    steps: [
      { questionId: "exp-3", expected: "incorrect", expectedMisconception: "sign_on_distribution" },
      { questionId: "exp-3", intervention: "targeted_hint", expected: "correct" },
    ],
  },
  {
    id: "procedural-fails-transfer",
    title: "Procedural Learner fails word-problem transfer",
    description:
      "Comfortable on 3x - 7 = 2x + 4, but expected to stumble on the reworded problem.",
    learnerId: "procedural-learner",
    steps: [
      { questionId: "lin-2", expected: "correct" },
      { questionId: "wp-2", expected: "incorrect" },
    ],
  },
  {
    id: "developing-low-across-board",
    title: "Developing Learner is weak across concepts",
    description:
      "With low foundational skills, an unassisted run should show limited accuracy.",
    learnerId: "developing-learner",
    steps: [
      { questionId: "lin-3", expected: "incorrect" },
      { questionId: "exp-3", expected: "incorrect" },
      { questionId: "wp-3", expected: "incorrect" },
    ],
  },
];

export interface StepResult {
  step: ScenarioStep;
  studentAnswer: string;
  correct: boolean;
  firedMisconception: MisconceptionId | null;
  pass: boolean;
  note: string;
}

export interface ScenarioResult {
  scenarioId: string;
  title: string;
  simulator: "baseline" | "enhanced";
  steps: StepResult[];
  pass: boolean;
  passRate: number;
}

function getProfileFor(id: string): LearnerProfile {
  return getProfile(id);
}

export function evaluateScenario(
  scenario: Scenario,
  profile: LearnerProfile,
  simulator: "baseline" | "enhanced",
): ScenarioResult {
  const run = createRun(profile, simulator, `scenario:${scenario.id}:${simulator}`);
  const steps: StepResult[] = [];
  for (const step of scenario.steps) {
    const q = QUESTIONS.find((x) => x.id === step.questionId)!;
    const iv = step.intervention ? buildInterventions(profile, q, run.state)[step.intervention] : null;
    const attempt = runAttempt(run, q, iv && step.intervention ? iv : null);
    let pass = false;
    let note = "";
    if (step.expected === "correct") {
      pass = attempt.correct;
      note = attempt.correct ? "answered correctly as expected" : "answered incorrectly";
    } else if (step.expected === "incorrect") {
      pass = !attempt.correct;
      note = attempt.correct ? "answered correctly (unexpected)" : "answered incorrectly as expected";
    } else if (step.expected === "misconception") {
      pass = !attempt.correct && attempt.misconceptionId === step.expectedMisconception;
      note = `expected ${step.expectedMisconception}, got ${attempt.misconceptionId ?? (attempt.correct ? "correct" : "none")}`;
    }
    steps.push({
      step,
      studentAnswer: attempt.studentAnswer,
      correct: attempt.correct,
      firedMisconception: attempt.misconceptionId,
      pass,
      note,
    });
  }
  const passed = steps.filter((s) => s.pass).length;
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    simulator,
    steps,
    pass: passed === steps.length && steps.length > 0,
    passRate: steps.length ? passed / steps.length : 0,
  };
}

export { getProfileFor };
