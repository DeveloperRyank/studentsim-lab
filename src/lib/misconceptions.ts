import type { Misconception, MisconceptionId } from "./types";

export const MISCONCEPTIONS: Record<MisconceptionId, Misconception> = {
  sign_on_distribution: {
    id: "sign_on_distribution",
    label: "Sign error when distributing",
    description:
      "Drops or flips the negative sign when multiplying a bracket by a negative number.",
    concepts: ["expanding_brackets", "linear_equations"],
  },
  incomplete_distribution: {
    id: "incomplete_distribution",
    label: "Incomplete distribution",
    description:
      "Multiplies only the first term inside the bracket, forgetting the second.",
    concepts: ["expanding_brackets"],
  },
  subtraction_order: {
    id: "subtraction_order",
    label: "Subtraction / sign-of-result error",
    description:
      "Reverses a subtraction or reports the wrong sign for the final result.",
    concepts: ["negative_numbers", "linear_equations"],
  },
  transfer_failure: {
    id: "transfer_failure",
    label: "Fails transfer to unfamiliar format",
    description:
      "Solves a familiar equation layout but cannot apply the idea when it is phrased differently.",
    concepts: ["linear_equations", "word_problem_translation"],
  },
  wrong_operation_translation: {
    id: "wrong_operation_translation",
    label: "Wrong operation when translating words",
    description:
      "Turns a word statement into an equation using the wrong operation.",
    concepts: ["word_problem_translation"],
  },
  arithmetic_slip: {
    id: "arithmetic_slip",
    label: "Arithmetic slip on negatives",
    description: "A generic slip adding or subtracting negative numbers.",
    concepts: ["negative_numbers"],
  },
};

export const ALL_MISCONCEPTION_IDS = Object.keys(MISCONCEPTIONS) as MisconceptionId[];
