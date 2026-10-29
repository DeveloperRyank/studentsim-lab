import type {
  ConceptId,
  Intervention,
  InterventionKind,
  KnowledgeState,
  LearnerProfile,
  MisconceptionId,
  Question,
} from "./types";
import { MISCONCEPTIONS } from "./misconceptions";

const CONCEPT_EXPLAIN: Record<ConceptId, string> = {
  linear_equations:
    "To solve an equation, do the same thing to both sides until x is alone. Undo the +/− first, then undo the ×.",
  expanding_brackets:
    "The number outside the bracket multiplies EVERY term inside. Watch the sign of each term you create.",
  negative_numbers:
    "On a number line, adding a negative moves left and subtracting a negative moves right. Two negatives being multiplied give a positive.",
  word_problem_translation:
    "Turn the words into maths step by step. 'More than' means add, 'times' means multiply, 'is' means equals. Define the unknown first.",
};

const SOCRATIC: Record<ConceptId, string> = {
  linear_equations: "What would you do to this side so that only the x term is left on it?",
  expanding_brackets: "How many terms are inside the bracket, and how many times did you multiply?",
  negative_numbers: "Is your answer moving further left or further right on the number line?",
  word_problem_translation: "Which word in the question tells you the operation? What would it mean to do the opposite?",
};

/** Pick the misconception a targeted hint should aim at for this learner+question. */
export function chooseHintTarget(
  profile: LearnerProfile,
  question: Question,
  _state: KnowledgeState,
): MisconceptionId | null {
  const available = profile.misconceptions
    .filter((m) => question.misconceptionResponses[m.id])
    .sort((a, b) => b.severity - a.severity);
  return available[0]?.id ?? null;
}

/** Build the four tutoring intervention texts for a given learner + question. */
export function buildInterventions(
  profile: LearnerProfile,
  question: Question,
  state: KnowledgeState,
): Record<InterventionKind, Intervention> {
  const concept = question.concepts[0];
  const target = chooseHintTarget(profile, question, state);
  const mis = target ? MISCONCEPTIONS[target] : null;

  const hint = mis
    ? `Look specifically at the ${mis.label.toLowerCase()}: "${mis.description}" Re-check that one step before writing your final answer.`
    : `Re-check the last operation you performed against the rule for this topic.`;

  return {
    direct_explanation: {
      kind: "direct_explanation",
      text: CONCEPT_EXPLAIN[concept],
      concepts: question.concepts,
    },
    targeted_hint: {
      kind: "targeted_hint",
      text: hint,
      targetsMisconception: target ?? undefined,
      concepts: mis ? mis.concepts : question.concepts,
    },
    socratic_prompt: {
      kind: "socratic_prompt",
      text: SOCRATIC[concept],
      concepts: question.concepts,
    },
    no_intervention: {
      kind: "no_intervention",
      text: "(No help given — the next question is presented directly.)",
      concepts: [],
    },
  };
}

export const INTERVENTION_LABELS: Record<InterventionKind, string> = {
  direct_explanation: "A. Direct explanation",
  targeted_hint: "B. Targeted hint",
  socratic_prompt: "C. Socratic prompt",
  no_intervention: "D. No intervention",
};
