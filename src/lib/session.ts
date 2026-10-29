import type {
  AttemptRecord,
  Intervention,
  KnowledgeState,
  LearnerProfile,
  Question,
  Session,
  SimulatorKind,
} from "./types";
import {
  DEFAULT_CONFIG,
  SimConfig,
  applyIntervention,
  freshState,
  makeAttemptSeed,
  simulateAttempt,
  skillForQuestion,
  updateStateAfterAttempt,
} from "./engine";
import { MISCONCEPTIONS } from "./misconceptions";
import { requestNarration } from "./api";

export interface Run {
  id: string;
  profile: LearnerProfile;
  simulator: SimulatorKind;
  state: KnowledgeState;
  attempts: AttemptRecord[];
  seq: number;
  config: SimConfig;
  usedLlm: boolean;
}

export function createRun(
  profile: LearnerProfile,
  simulator: SimulatorKind,
  id: string,
  config: SimConfig = DEFAULT_CONFIG,
): Run {
  return {
    id,
    profile,
    simulator,
    state: freshState(profile),
    attempts: [],
    seq: 0,
    config,
    usedLlm: false,
  };
}

/** Deterministically produce the next attempt. The rules decide everything;
 *  an intervention is applied to persistent state first (enhanced only). */
export function runAttempt(
  run: Run,
  question: Question,
  priorIntervention: Intervention | null,
): AttemptRecord {
  if (priorIntervention && run.simulator === "enhanced") {
    applyIntervention(run.state, priorIntervention, question, run.config);
  }
  const seed = makeAttemptSeed(run.profile.id, run.id, question.id, run.seq);
  const raw = simulateAttempt({
    profile: run.profile,
    question,
    simulator: run.simulator,
    state: run.state,
    priorIntervention,
    seed,
    config: run.config,
  });

  updateStateAfterAttempt(
    run.state,
    question,
    raw.correct,
    raw.misconceptionId,
    run.config,
  );

  const skillSnapshot: Partial<Record<string, number>> = {};
  question.concepts.forEach((c) => {
    skillSnapshot[c] =
      run.simulator === "enhanced" ? run.state.skills[c] : run.profile.initialSkills[c as keyof typeof run.profile.initialSkills];
  });

  const record: AttemptRecord = {
    sequence: run.seq,
    sessionId: run.id,
    learnerId: run.profile.id,
    simulator: run.simulator,
    questionId: question.id,
    concept: question.concepts[0],
    expectedAnswer: question.expectedAnswer,
    studentAnswer: raw.answer,
    correct: raw.correct,
    misconceptionId: raw.misconceptionId,
    observableExplanation: raw.observableExplanation,
    priorIntervention: priorIntervention
      ? { ...priorIntervention }
      : null,
    skillSnapshot,
    seed,
    timestamp: Date.now(),
  };
  run.attempts.push(record);
  run.seq += 1;
  return record;
}

/** Turn the rule-decided outcome into natural first-person language.
 *  Uses the server LLM when configured, otherwise a deterministic template. */
export async function narrateAttempt(run: Run, attempt: AttemptRecord, question: Question): Promise<string> {
  const misconceptionLabel = attempt.misconceptionId
    ? MISCONCEPTIONS[attempt.misconceptionId].label
    : null;

  const llmText = await requestNarration({
    persona: `${run.profile.name}. ${run.profile.description}`,
    question: question.prompt,
    answer: attempt.studentAnswer,
    correct: attempt.correct,
    misconceptionLabel,
    observableExplanation: attempt.observableExplanation,
  });
  if (llmText) {
    run.usedLlm = true;
    return llmText;
  }
  return templateNarration(attempt, misconceptionLabel);
}

function templateNarration(
  attempt: AttemptRecord,
  misconceptionLabel: string | null,
): string {
  const q = attempt.studentAnswer;
  if (attempt.correct) {
    const lines = [
      `I got ${q}. I did the steps the usual way and I'm fairly confident about this one.`,
      `That came out to ${q} — this type I can handle.`,
    ];
    return lines[attempt.sequence % lines.length];
  }
  if (misconceptionLabel) {
    const lines = [
      `I wrote ${q}. I think I handled the signs OK... ${misconceptionLabel} is the bit I always rush.`,
      `My answer is ${q}. I wasn't sure about ${misconceptionLabel.toLowerCase()}, so I just went with it.`,
    ];
    return lines[attempt.sequence % lines.length];
  }
  return `I'm not sure on this one, so I guessed. It came out as ${attempt.studentAnswer}.`;
}

export function currentSkill(run: Run): number {
  const last = run.attempts[run.attempts.length - 1];
  if (!last) return 0;
  const vals = Object.values(last.skillSnapshot) as number[];
  return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
}

export function toSession(run: Run): Session {
  return {
    id: run.id,
    learnerId: run.profile.id,
    simulator: run.simulator,
    createdAt: run.attempts[0]?.timestamp ?? Date.now(),
    attempts: run.attempts,
    usedLlm: run.usedLlm,
  };
}

export { skillForQuestion };
