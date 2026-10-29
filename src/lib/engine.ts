import type {
  ConceptId,
  Intervention,
  KnowledgeState,
  LearnerProfile,
  MisconceptionId,
  Question,
  SimulatorKind,
} from "./types";
import { MISCONCEPTIONS } from "./misconceptions";
import { isCorrect } from "./questions";
import { clamp, hashStringToSeed, makeRng } from "./rng";

/** Explicit, configurable state-update rule set. Everything the engine "believes"
 *  is derived from these numbers so behaviour is inspectable and tunable. */
export interface SimConfig {
  difficultyWeight: number; // how strongly difficulty erodes accuracy
  variabilityScale: number; // fraction of profile variability applied to p(correct)
  learningRate: number; // EWMA alpha when a correct answer is observed
  wrongPenaltyScale: number; // EWMA alpha multiplier when an incorrect answer is observed
  misconceptionWeight: number; // how strongly severity turns a failure into that misconception
  baseSlip: number; // floor probability of a generic slip even for a skilled answer
  boostDecay: number; // multiplier applied to a used correction boost each turn
  boostMax: number;
  boosts: {
    targetedHint: number;
    directExplanation: number; // small, capped skill nudge on related concepts
    socraticHigh: number; // socratic gain when foundational skill is adequate
    socraticLow: number; // socratic gain when foundational skill is weak
    socraticThreshold: number;
    genericCorrection: number; // tiny suppression of the tested misconception after success
  };
}

export const DEFAULT_CONFIG: SimConfig = {
  difficultyWeight: 0.6,
  variabilityScale: 0.22,
  learningRate: 0.16,
  wrongPenaltyScale: 0.6,
  misconceptionWeight: 0.7,
  baseSlip: 0.04,
  boostDecay: 0.5,
  boostMax: 0.9,
  boosts: {
    targetedHint: 0.6,
    directExplanation: 0.12,
    socraticHigh: 0.18,
    socraticLow: 0.04,
    socraticThreshold: 0.55,
    genericCorrection: 0.1,
  },
};

export function freshState(profile: LearnerProfile): KnowledgeState {
  return {
    skills: { ...profile.initialSkills },
    correctionBoosts: {},
    pendingBoosts: {},
    pendingSkillNudge: {},
  };
}

/** The learner's effective skill for a question = average over its concepts. */
export function skillForQuestion(
  skills: Record<ConceptId, number>,
  question: Question,
): number {
  const vals = question.concepts.map((c) => skills[c] ?? 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

interface RawAttempt {
  answer: string;
  correct: boolean;
  misconceptionId: MisconceptionId | null;
  observableExplanation: string;
  pCorrect: number;
  roll: number;
}

/**
 * Decide a single simulated attempt.
 *
 * `enhanced` reads and mutates persistent KnowledgeState.
 * `baseline` uses only the profile's static initial skills plus a one-shot
 * transient hint — it has NO persistent misconception-update mechanism, which
 * is exactly the property the Experiment Arena is meant to expose.
 */
export function simulateAttempt(params: {
  profile: LearnerProfile;
  question: Question;
  simulator: SimulatorKind;
  state: KnowledgeState;
  /** Intervention shown immediately before this attempt, if any. */
  priorIntervention: Intervention | null;
  seed: number;
  config?: SimConfig;
}): RawAttempt {
  const cfg = params.config ?? DEFAULT_CONFIG;
  const { profile, question, state, simulator } = params;
  const rng = makeRng(params.seed);

  // 1. Commit any pending boosts carried from the intervention just shown.
  if (simulator === "enhanced") commitPending(state, cfg);

  // 2. Skill estimate: enhanced uses live state, baseline uses frozen profile.
  const skills =
    simulator === "enhanced" ? state.skills : profile.initialSkills;
  const baseSkill = skillForQuestion(skills, question);

  // 3. Difficulty erosion.
  const diffPenalty =
    profile.difficultySensitivity * ((question.difficulty - 1) / 4) * cfg.difficultyWeight;
  const noise = (rng() * 2 - 1) * profile.variability * cfg.variabilityScale;
  let pCorrect = clamp(baseSkill - diffPenalty + noise);

  // 4. Active misconceptions available on this question for this learner.
  const candidates = collectCandidates(profile, question);
  // Enhanced can suppress a misconception via its (concept-scoped) boost.
  const weights = candidates.map((c) => {
    let boost = 0;
    if (simulator === "enhanced") boost = effectiveBoost(state, c.id, question);
    return c.severity * (1 - boost) * cfg.misconceptionWeight;
  });

  // A targeted hint also lifts the odds directly (models the learner attending
  // to the very error it aims at). Baseline hint is transient and weaker.
  if (params.priorIntervention?.kind === "targeted_hint") {
    const strength = simulator === "enhanced" ? cfg.boosts.targetedHint : cfg.boosts.targetedHint * 0.5;
    pCorrect = clamp(pCorrect + strength * 0.15);
  }

  // 5. Roll once against p(correct). A success is a success regardless of how
  //    much misconception weight remains — that weight only governs WHICH wrong
  //    answer is produced on a failure.
  const roll = rng();
  if (roll < pCorrect) {
    if (simulator === "enhanced") nudgeSuccess(state, candidates, cfg);
    return finalizeCorrect(question, pCorrect, roll);
  }

  // Wrong: fire a weighted, concept-scoped misconception if one is available.
  const chosen = pickWeighted(candidates, weights, rng());
  if (chosen) {
    const resp = question.misconceptionResponses[chosen.id];
    const [answer, explanation] = splitResponse(resp);
    return {
      answer,
      correct: false,
      misconceptionId: chosen.id,
      observableExplanation:
        explanation || MISCONCEPTIONS[chosen.id].description,
      pCorrect,
      roll,
    };
  }

  // Generic slip with no question-specific mapping.
  return {
    answer: "unsure",
    correct: false,
    misconceptionId: null,
    observableExplanation: "The learner could not commit to an answer here.",
    pCorrect,
    roll,
  };
}

/** Update knowledge state AFTER an attempt (enhanced simulator only). */
export function updateStateAfterAttempt(
  state: KnowledgeState,
  question: Question,
  correct: boolean,
  firedMisconception: MisconceptionId | null,
  cfg: SimConfig = DEFAULT_CONFIG,
): void {
  const alpha = correct ? cfg.learningRate : cfg.learningRate * cfg.wrongPenaltyScale;
  question.concepts.forEach((c) => {
    const cur = state.skills[c] ?? 0;
    state.skills[c] = clamp(cur + alpha * ((correct ? 1 : 0) - cur));
  });
  // Used boosts decay; concept-scoped so other misconceptions are untouched.
  (Object.keys(state.correctionBoosts) as MisconceptionId[]).forEach((id) => {
    if (firedMisconception === id || overlapsConcepts(id, question.concepts)) {
      const v = state.correctionBoosts[id] ?? 0;
      state.correctionBoosts[id] = v * cfg.boostDecay;
    }
  });
}

/** Apply a tutoring intervention to the persistent state (enhanced only). */
export function applyIntervention(
  state: KnowledgeState,
  intervention: Intervention,
  question: Question,
  cfg: SimConfig = DEFAULT_CONFIG,
): void {
  if (intervention.kind === "no_intervention") return;
  const concepts = intervention.concepts.length
    ? intervention.concepts
    : question.concepts;
  switch (intervention.kind) {
    case "targeted_hint":
      if (intervention.targetsMisconception) {
        const cur = state.pendingBoosts[intervention.targetsMisconception] ?? 0;
        state.pendingBoosts[intervention.targetsMisconception] = clamp(
          cur + cfg.boosts.targetedHint,
          0,
          cfg.boostMax,
        );
      }
      break;
    case "direct_explanation":
      concepts.forEach((c) => {
        const cur = state.pendingSkillNudge[c] ?? 0;
        state.pendingSkillNudge[c] = clamp(cur + cfg.boosts.directExplanation, 0, 0.4);
      });
      break;
    case "socratic_prompt": {
      concepts.forEach((c) => {
        const skill = state.skills[c] ?? 0;
        const gain =
          skill >= cfg.boosts.socraticThreshold
            ? cfg.boosts.socraticHigh
            : cfg.boosts.socraticLow;
        const cur = state.pendingSkillNudge[c] ?? 0;
        state.pendingSkillNudge[c] = clamp(cur + gain, 0, 0.4);
      });
      break;
    }
  }
}

function commitPending(state: KnowledgeState, cfg: SimConfig): void {
  (Object.keys(state.pendingBoosts) as MisconceptionId[]).forEach((id) => {
    const cur = state.correctionBoosts[id] ?? 0;
    state.correctionBoosts[id] = clamp(
      Math.max(cur, state.pendingBoosts[id] ?? 0),
      0,
      cfg.boostMax,
    );
  });
  (Object.keys(state.pendingSkillNudge) as ConceptId[]).forEach((c) => {
    state.skills[c] = clamp((state.skills[c] ?? 0) + (state.pendingSkillNudge[c] ?? 0) * 0.5);
  });
  state.pendingBoosts = {};
  state.pendingSkillNudge = {};
}

function nudgeSuccess(
  state: KnowledgeState,
  candidates: { id: MisconceptionId }[],
  cfg: SimConfig,
): void {
  candidates.forEach((c) => {
    const cur = state.correctionBoosts[c.id] ?? 0;
    state.correctionBoosts[c.id] = clamp(
      cur + cfg.boosts.genericCorrection,
      0,
      cfg.boostMax,
    );
  });
}

function collectCandidates(profile: LearnerProfile, question: Question) {
  return profile.misconceptions
    .filter((m) => question.misconceptionResponses[m.id])
    .map((m) => ({ id: m.id, severity: m.severity }));
}

function effectiveBoost(
  state: KnowledgeState,
  id: MisconceptionId,
  question: Question,
): number {
  if (!overlapsConcepts(id, question.concepts)) return 0;
  return state.correctionBoosts[id] ?? 0;
}

function overlapsConcepts(
  id: MisconceptionId,
  concepts: ConceptId[],
): boolean {
  return MISCONCEPTIONS[id].concepts.some((c) => concepts.includes(c));
}

function pickWeighted(
  candidates: { id: MisconceptionId }[],
  weights: number[],
  r: number,
): { id: MisconceptionId } | null {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let acc = 0;
  const target = r * total;
  for (let i = 0; i < candidates.length; i++) {
    acc += weights[i];
    if (target <= acc) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function splitResponse(resp?: string): [string, string] {
  if (!resp) return ["unsure", ""];
  const idx = resp.indexOf("|");
  if (idx === -1) return [resp, ""];
  return [resp.slice(0, idx), resp.slice(idx + 1)];
}

function finalizeCorrect(question: Question, pCorrect: number, roll: number): RawAttempt {
  return {
    answer: question.expectedAnswer,
    correct: true,
    misconceptionId: null,
    observableExplanation:
      "The learner applied the standard procedure and reached the expected answer.",
    pCorrect,
    roll,
  };
}

/** Public helper: whether the answer matches expectations. */
export function checkCorrect(expected: string, answer: string): boolean {
  return isCorrect(expected, answer);
}

export function makeAttemptSeed(
  learnerId: string,
  sessionId: string,
  questionId: string,
  sequence: number,
): number {
  return hashStringToSeed(`${learnerId}:${sessionId}:${questionId}:${sequence}`);
}
