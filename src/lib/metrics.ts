import type { AttemptRecord, ConceptId, LearnerProfile, Question } from "./types";

export interface MetricBundle {
  accuracy: number | null;
  misconceptionReproductionRate: number | null;
  responsivenessToTutoring: number | null;
  avgAttemptsToCorrectPerConcept: number | null;
  consistencyAcrossRuns: number | null;
  totalAttempts: number;
}

function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return part / whole;
}

export function accuracy(attempts: AttemptRecord[]): number | null {
  return rate(attempts.filter((a) => a.correct).length, attempts.length);
}

/** Of the attempts where the learner erred on a question that maps to one of
 *  ITS OWN documented misconceptions, how often did it actually reproduce that
 *  misconception? High = faithful to the profile; low = profile is ignored. */
export function misconceptionReproductionRate(
  attempts: AttemptRecord[],
  profile: LearnerProfile,
  questionsById: Map<string, Question>,
): number | null {
  const mine = new Set(profile.misconceptions.map((m) => m.id));
  let applicableWrong = 0;
  let reproduced = 0;
  for (const a of attempts) {
    const q = questionsById.get(a.questionId);
    if (!q || a.correct) continue;
    const mappable = Object.keys(q.misconceptionResponses).some((id) => mine.has(id as never));
    if (!mappable) continue;
    applicableWrong += 1;
    if (a.misconceptionId && mine.has(a.misconceptionId)) reproduced += 1;
  }
  return rate(reproduced, applicableWrong);
}

/** Accuracy on attempts that FOLLOWED a tutoring intervention minus accuracy on
 *  attempts with no prior intervention. Positive = the sim responds to help. */
export function responsivenessToTutoring(attempts: AttemptRecord[]): number | null {
  const after = attempts.filter((a) => a.priorIntervention && a.priorIntervention.kind !== "no_intervention");
  const none = attempts.filter((a) => !a.priorIntervention || a.priorIntervention.kind === "no_intervention");
  const accA = accuracy(after);
  const accN = accuracy(none);
  if (accA === null || accN === null) return null;
  return accA - accN;
}

/** Mean number of attempts the learner needs per concept before its first correct
 *  answer on that concept within the run. */
export function avgAttemptsToCorrectPerConcept(attempts: AttemptRecord[]): number | null {
  const byConcept = new Map<ConceptId, AttemptRecord[]>();
  for (const a of attempts) {
    const arr = byConcept.get(a.concept) ?? [];
    arr.push(a);
    byConcept.set(a.concept, arr);
  }
  const counts: number[] = [];
  for (const arr of byConcept.values()) {
    arr.sort((x, y) => x.sequence - y.sequence);
    const firstCorrect = arr.findIndex((x) => x.correct);
    counts.push(firstCorrect === -1 ? arr.length : firstCorrect + 1);
  }
  if (!counts.length) return null;
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

/** Agreement (0..1) of correct/incorrect vectors across repeated identical runs. */
export function consistencyAcrossRuns(runsVectors: boolean[][]): number | null {
  if (runsVectors.length < 2) return null;
  const len = runsVectors[0].length;
  if (len === 0) return null;
  let agree = 0;
  let total = 0;
  for (let i = 0; i < len; i++) {
    const first = runsVectors[0][i];
    for (let r = 1; r < runsVectors.length; r++) {
      total += 1;
      if (runsVectors[r][i] === first) agree += 1;
    }
  }
  return rate(agree, total);
}

export function computeBundle(
  attempts: AttemptRecord[],
  profile: LearnerProfile,
  questionsById: Map<string, Question>,
  runsVectors: boolean[][],
): MetricBundle {
  return {
    accuracy: accuracy(attempts),
    misconceptionReproductionRate: misconceptionReproductionRate(attempts, profile, questionsById),
    responsivenessToTutoring: responsivenessToTutoring(attempts),
    avgAttemptsToCorrectPerConcept: avgAttemptsToCorrectPerConcept(attempts),
    consistencyAcrossRuns: consistencyAcrossRuns(runsVectors),
    totalAttempts: attempts.length,
  };
}
