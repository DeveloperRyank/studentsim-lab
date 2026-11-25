import { expect, it } from "vitest";
import { benchmark, modelLearner, recommendTeaching, selectTeachingMethod } from "../src/cognition/recommendation";

it("maps the learner's two knowledge descriptions to initial subject knowledge", () => {
  const beginner = modelLearner({foundations:"Needs review",calculus:"New to calculus"});
  const experienced = modelLearner({foundations:"Strong",calculus:"Can differentiate simple functions"});
  expect(beginner.prior.power).toBe(0);
  expect(experienced.prior.power).toBeGreaterThan(0);
  expect(experienced.prior.algebra).toBeGreaterThan(beginner.prior.algebra);
  expect(experienced.params).toEqual(beginner.params);
});

it("selects the highest mean above the benchmark and accepts the exact cutoff", () => {
  const scores = [.15,benchmark,.78].map(mean=>({summary:{mean}}));
  expect(selectTeachingMethod(scores)).toBe(scores[2]);
  expect(selectTeachingMethod(scores.slice(0,2))).toBe(scores[1]);
  expect(selectTeachingMethod(scores.slice(0,1))).toBeNull();
});

it("tries a longer course for a new calculus learner with strong foundations", () => {
  const stages: number[] = [];
  const beginner = recommendTeaching({foundations:"Strong",calculus:"New to calculus"},hours=>stages.push(hours));
  expect(stages).toEqual([60,120]);
  expect(beginner.stages[0].recommendation).toBeNull();
  expect(beginner.recommendation?.name).toBe("Spaced retrieval");
  expect(beginner.recommendation!.summary.mean).toBeGreaterThanOrEqual(benchmark);
  expect(beginner.methods.every(method=>method.summary.scores.length===beginner.trials)).toBe(true);
});

it("runs the unseen exam and stops when the first course qualifies", () => {
  const experienced = recommendTeaching({foundations:"Strong",calculus:"Can differentiate simple functions"});
  expect(experienced.recommendation?.summary.mean).toBe(Math.max(...experienced.methods.map(row=>row.summary.mean)));
  expect(experienced.recommendation!.summary.mean).toBeGreaterThanOrEqual(benchmark);
  expect(experienced.stages).toHaveLength(1);
  expect(experienced.examQuestions).toBe(37);
  expect(experienced.methods).toHaveLength(5);
  expect(experienced.methods.every(method=>method.summary.scores.length===experienced.trials)).toBe(true);
});
