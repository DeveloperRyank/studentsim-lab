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

it("runs the unseen calculus exam and supports both recommendation outcomes", () => {
  const beginner = recommendTeaching({foundations:"Needs review",calculus:"New to calculus"});
  expect(beginner.recommendation).toBeNull();
  const experienced = recommendTeaching({foundations:"Strong",calculus:"Can differentiate simple functions"});
  expect(experienced.recommendation?.summary.mean).toBe(Math.max(...experienced.methods.map(row=>row.summary.mean)));
  expect(experienced.recommendation!.summary.mean).toBeGreaterThanOrEqual(benchmark);
  expect(experienced.examQuestions).toBe(37);
  expect(experienced.methods).toHaveLength(5);
  expect(experienced.methods.every(method=>method.summary.scores.length===experienced.trials)).toBe(true);
});
