import type { ConceptId, LearnerProfile } from "./types";

export const CONCEPT_LABELS: Record<ConceptId, string> = {
  linear_equations: "Solving linear equations",
  expanding_brackets: "Expanding brackets",
  negative_numbers: "Negative numbers",
  word_problem_translation: "Translating word problems",
};

// Three predefined, deliberately simulated secondary-school maths learners.
export const PROFILES: LearnerProfile[] = [
  {
    id: "sign-confuser",
    name: "The Sign Confuser",
    description:
      "Comfortable with basic algebra and procedures, but frequently mishandles negative signs, " +
      "especially when distributing into brackets or reporting the sign of a result.",
    initialSkills: {
      linear_equations: 0.72,
      expanding_brackets: 0.55,
      negative_numbers: 0.45,
      word_problem_translation: 0.6,
    },
    misconceptions: [
      { id: "sign_on_distribution", severity: 0.8 },
      { id: "subtraction_order", severity: 0.6 },
      { id: "arithmetic_slip", severity: 0.35 },
    ],
    errorPatterns: [
      "Writes 3(x - 4) as 3x - 4",
      "Reports the positive value of a negative result",
      "Flips the sign after moving a term across the equals sign",
    ],
    difficultySensitivity: 0.35,
    variability: 0.25,
  },
  {
    id: "procedural-learner",
    name: "The Procedural Learner",
    description:
      "Reliable on familiar, textbook-shaped equations but struggles to transfer the same idea " +
      "to unfamiliar phrasing or word problems.",
    initialSkills: {
      linear_equations: 0.7,
      expanding_brackets: 0.62,
      negative_numbers: 0.6,
      word_problem_translation: 0.35,
    },
    misconceptions: [
      { id: "transfer_failure", severity: 0.75 },
      { id: "wrong_operation_translation", severity: 0.55 },
      { id: "incomplete_distribution", severity: 0.3 },
    ],
    errorPatterns: [
      "Solves 2x + 3 = 11 instantly, stalls on 'twice a number increased by three equals eleven'",
      "Matches keywords to operations by rote and picks the wrong one when reworded",
    ],
    difficultySensitivity: 0.5,
    variability: 0.2,
  },
  {
    id: "developing-learner",
    name: "The Developing Learner",
    description:
      "Has gaps in foundational algebra and needs more scaffolding; skill is still forming across " +
      "most concepts and accuracy is uneven.",
    initialSkills: {
      linear_equations: 0.4,
      expanding_brackets: 0.32,
      negative_numbers: 0.3,
      word_problem_translation: 0.28,
    },
    misconceptions: [
      { id: "incomplete_distribution", severity: 0.6 },
      { id: "arithmetic_slip", severity: 0.55 },
      { id: "subtraction_order", severity: 0.5 },
      { id: "transfer_failure", severity: 0.4 },
    ],
    errorPatterns: [
      "Forgets to apply an operation to both sides",
      "Loses the second term when expanding",
      "Guesses when the steps are unfamiliar",
    ],
    difficultySensitivity: 0.65,
    variability: 0.4,
  },
];

export function getProfile(id: string): LearnerProfile {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown learner profile: ${id}`);
  return p;
}
