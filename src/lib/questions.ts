import type { ConceptId, Question } from "./types";

// Small secondary-school maths bank. Expected answers are compared after
// normalisation (whitespace, x = 3 -> 3, leading +, etc.).
export const QUESTIONS: Question[] = [
  {
    id: "neg-1",
    prompt: "Work out: -7 + 3",
    concepts: ["negative_numbers"],
    difficulty: 1,
    expectedAnswer: "-4",
    misconceptionResponses: {
      subtraction_order: "4|The learner treated -7 + 3 as 7 - 3 and dropped the negative sign on the result.",
      arithmetic_slip: "10|The learner added the magnitudes and ignored the signs.",
    },
  },
  {
    id: "neg-2",
    prompt: "Work out: 5 - (-2)",
    concepts: ["negative_numbers"],
    difficulty: 2,
    expectedAnswer: "7",
    misconceptionResponses: {
      subtraction_order: "3|The learner read 5 - (-2) as 5 - 2, treating the double negative as a single minus.",
      arithmetic_slip: "-3|The learner combined the signs incorrectly and produced a negative result.",
    },
  },
  {
    id: "neg-3",
    prompt: "Work out: -6 x -4",
    concepts: ["negative_numbers"],
    difficulty: 2,
    expectedAnswer: "24",
    misconceptionResponses: {
      subtraction_order: "-24|The learner multiplied the magnitudes but kept a single negative sign.",
      arithmetic_slip: "-10|The learner added the numbers instead of multiplying them.",
    },
  },
  {
    id: "lin-1",
    prompt: "Solve for x: 2x + 5 = 13",
    concepts: ["linear_equations"],
    difficulty: 1,
    expectedAnswer: "4",
    misconceptionResponses: {
      subtraction_order: "9|The learner moved +5 across the equals sign without changing it to -5.",
      arithmetic_slip: "6|The learner subtracted 5 to get 8 but then divided incorrectly.",
    },
  },
  {
    id: "lin-2",
    prompt: "Solve for x: 3x - 7 = 2x + 4",
    concepts: ["linear_equations"],
    difficulty: 3,
    expectedAnswer: "11",
    misconceptionResponses: {
      subtraction_order: "-11|The learner collected the x terms on the wrong side and lost the sign.",
      transfer_failure: "x = 7 - 4|The learner removed the x terms and combined only the constants.",
    },
  },
  {
    id: "lin-3",
    prompt: "Solve for x: -2x + 6 = -4",
    concepts: ["linear_equations", "negative_numbers"],
    difficulty: 4,
    expectedAnswer: "5",
    misconceptionResponses: {
      sign_on_distribution: "-5|The learner divided by -2 but reported the negative of the result.",
      subtraction_order: "1|The learner computed -4 - 6 as -2 and then divided incorrectly.",
      arithmetic_slip: "-1|The learner subtracted 6 with the wrong sign and kept the negative coefficient.",
    },
  },
  {
    id: "exp-1",
    prompt: "Expand: 3(x + 4)",
    concepts: ["expanding_brackets"],
    difficulty: 1,
    expectedAnswer: "3x + 12",
    misconceptionResponses: {
      incomplete_distribution: "3x + 4|The learner multiplied only the first term inside the bracket.",
    },
  },
  {
    id: "exp-2",
    prompt: "Expand: 2(x - 5)",
    concepts: ["expanding_brackets"],
    difficulty: 2,
    expectedAnswer: "2x - 10",
    misconceptionResponses: {
      incomplete_distribution: "2x - 5|The learner distributed to 2x but left -5 unchanged.",
      sign_on_distribution: "2x + 10|The learner multiplied 2 x 5 correctly but flipped the minus to a plus.",
    },
  },
  {
    id: "exp-3",
    prompt: "Expand: -3(x + 6)",
    concepts: ["expanding_brackets", "negative_numbers"],
    difficulty: 4,
    expectedAnswer: "-3x - 18",
    misconceptionResponses: {
      sign_on_distribution: "-3x + 18|The learner applied -3 to the x term but multiplied 3 x 6 without the negative sign.",
      incomplete_distribution: "-3x + 6|The learner distributed only to the first term.",
    },
  },
  {
    id: "wp-1",
    prompt:
      "Twice a number is increased by 5 and the result is 17. Write the equation and give the number.",
    concepts: ["word_problem_translation", "linear_equations"],
    difficulty: 2,
    expectedAnswer: "2x + 5 = 17, x = 6",
    misconceptionResponses: {
      wrong_operation_translation: "2x - 5 = 17, x = 11|The learner translated 'is increased by 5' as a subtraction.",
      transfer_failure: "x + 2 + 5 = 17, x = 10|The learner read 'twice a number' as 'a number plus two'.",
    },
  },
  {
    id: "wp-2",
    prompt:
      "A number is divided by 3 and then 4 is subtracted. The result is 2. Write the equation and give the number.",
    concepts: ["word_problem_translation", "linear_equations"],
    difficulty: 3,
    expectedAnswer: "x/3 - 4 = 2, x = 18",
    misconceptionResponses: {
      wrong_operation_translation: "3x + 4 = 2, x = -2/3|The learner turned 'divided by 3' into multiplication and 'subtracted' into addition.",
      transfer_failure: "x/3 + 4 = 2, x = -6|The learner kept the division but used the wrong sign for '4 is subtracted'.",
    },
  },
  {
    id: "wp-3",
    prompt:
      "Five more than three times a number equals -1. Write the equation and give the number.",
    concepts: ["word_problem_translation", "linear_equations", "negative_numbers"],
    difficulty: 4,
    expectedAnswer: "3x + 5 = -1, x = -2",
    misconceptionResponses: {
      wrong_operation_translation: "3x - 5 = -1, x = 4/3|The learner translated 'five more than' as a subtraction.",
      sign_on_distribution: "3x + 5 = -1, x = 2|The learner solved 3x = -6 and reported the positive value.",
      transfer_failure: "5x + 3 = -1, x = -8/5|The learner swapped the coefficients from 'five more than three times'.",
    },
  },
];

export function getQuestion(id: string): Question {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown question: ${id}`);
  return q;
}

export function questionsForConcept(concept: ConceptId): Question[] {
  return QUESTIONS.filter((q) => q.concepts.includes(concept));
}

/** Normalise a maths answer string for tolerant comparison. */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\u2212/g, "-") // unicode minus
    .replace(/x=/g, "")
    .replace(/^=/, "")
    .replace(/\+/g, " +") // keep expansion terms distinguishable
    .replace(/\^/g, "")
    .trim();
}

/** True when the student's answer matches the expected one. */
export function isCorrect(expected: string, answer: string): boolean {
  const e = normalizeAnswer(expected);
  const a = normalizeAnswer(answer);
  if (e === a) return true;
  // tolerate comma-separated parts in any order and per-part matching
  const ep = e.split(",").map(sortPart).sort();
  const ap = a.split(",").map(sortPart).sort();
  return ep.length === ap.length && ep.every((v, i) => v === ap[i]);
}

function sortPart(s: string): string {
  return s
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean)
    .sort()
    .join("+");
}
