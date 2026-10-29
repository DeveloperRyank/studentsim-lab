// Core domain types for the StudentSim Lab simulation engine.
// NOTE: These are SIMULATED learners. Nothing here is a claim about a real student.

export type ConceptId =
  | "linear_equations"
  | "expanding_brackets"
  | "negative_numbers"
  | "word_problem_translation";

export type MisconceptionId =
  | "sign_on_distribution" // mishandles the negative sign when distributing
  | "incomplete_distribution" // multiplies only the first term in brackets
  | "subtraction_order" // reverses a subtraction / sign of the result
  | "transfer_failure" // solves familiar format, fails an unfamiliar one
  | "wrong_operation_translation" // picks the wrong operation for a word problem
  | "arithmetic_slip"; // generic sign/arithmetic slip on negatives

export interface Misconception {
  id: MisconceptionId;
  label: string;
  description: string;
  concepts: ConceptId[];
}

export interface ProfileMisconception {
  id: MisconceptionId;
  /** 0..1 — how strongly this learner tends to exhibit the misconception. */
  severity: number;
}

export interface LearnerProfile {
  id: string;
  name: string;
  /** Short, human learner description. */
  description: string;
  /** Initial simulated skill estimate per concept, 0..1. */
  initialSkills: Record<ConceptId, number>;
  misconceptions: ProfileMisconception[];
  /** Typical, labelled error patterns (for display only). */
  errorPatterns: string[];
  /** 0..1 — how much accuracy degrades as difficulty rises. */
  difficultySensitivity: number;
  /** 0..1 — spread of the response variability. */
  variability: number;
}

export interface Question {
  id: string;
  prompt: string;
  concepts: ConceptId[];
  /** 1 (easy) .. 5 (hard). */
  difficulty: number;
  /** Expected answer, compared after normalisation. */
  expectedAnswer: string;
  /**
   * Plausible wrong answers keyed by misconception. The deterministic engine
   * will pick one of these when the learner "fires" that misconception here.
   * The value is the answer the student gives; the string after "|" is a
   * concise, observable explanation of the visible error (never hidden CoT).
   */
  misconceptionResponses: Partial<Record<MisconceptionId, string>>;
}

export type InterventionKind =
  | "direct_explanation"
  | "targeted_hint"
  | "socratic_prompt"
  | "no_intervention";

export interface Intervention {
  kind: InterventionKind;
  text: string;
  /** For a targeted hint, the misconception it aims at. */
  targetsMisconception?: MisconceptionId;
  /** Concepts the intervention concerns. */
  concepts: ConceptId[];
}

/** Mutable per-learner knowledge state used by the Enhanced simulator. */
export interface KnowledgeState {
  skills: Record<ConceptId, number>;
  /**
   * Per-misconception active "correction boost" (0..1). Raised by tutoring
   * interventions, decays over time and after use. It only suppresses the
   * misconception on questions whose concepts overlap the intervention.
   */
  correctionBoosts: Partial<Record<MisconceptionId, number>>;
  /** Boost carried from an intervention applied since the last attempt. */
  pendingBoosts: Partial<Record<MisconceptionId, number>>;
  pendingSkillNudge: Partial<Record<ConceptId, number>>;
}

export interface AttemptRecord {
  sequence: number;
  sessionId: string;
  learnerId: string;
  simulator: SimulatorKind;
  questionId: string;
  concept: ConceptId;
  expectedAnswer: string;
  studentAnswer: string;
  correct: boolean;
  misconceptionId: MisconceptionId | null;
  observableExplanation: string;
  /** Intervention shown *before* this attempt, if any. */
  priorIntervention: Intervention | null;
  /** Snapshot of the simulated skill estimate for the tested concept(s). */
  skillSnapshot: Partial<Record<ConceptId, number>>;
  seed: number;
  timestamp: number;
}

export type SimulatorKind = "baseline" | "enhanced";

export interface Session {
  id: string;
  learnerId: string;
  simulator: SimulatorKind;
  createdAt: number;
  attempts: AttemptRecord[];
  /** True when the natural-language narration used an LLM (not fallback). */
  usedLlm: boolean;
}
