import { describe, it, expect } from "vitest";
import {
  accuracy,
  consistencyAcrossRuns,
  misconceptionReproductionRate,
  responsivenessToTutoring,
} from "../src/lib/metrics";
import type { AttemptRecord } from "../src/lib/types";
import { getProfile } from "../src/lib/profiles";
import { QUESTIONS } from "../src/lib/questions";

function mk(partial: Partial<AttemptRecord>): AttemptRecord {
  return {
    sequence: 0,
    sessionId: "s",
    learnerId: "sign-confuser",
    simulator: "enhanced",
    questionId: "exp-3",
    concept: "expanding_brackets",
    expectedAnswer: "-3x - 18",
    studentAnswer: "-3x + 18",
    correct: false,
    misconceptionId: "sign_on_distribution",
    observableExplanation: "",
    priorIntervention: null,
    skillSnapshot: {},
    seed: 0,
    timestamp: 0,
    ...partial,
  };
}

describe("metrics", () => {
  const qmap = new Map(QUESTIONS.map((q) => [q.id, q]));

  it("accuracy is computed from events", () => {
    const atts = [mk({ correct: true }), mk({ correct: false }), mk({ correct: true })];
    expect(accuracy(atts)).toBeCloseTo(2 / 3);
    expect(accuracy([])).toBeNull();
  });

  it("misconception reproduction rate only counts profile-mapped wrongs", () => {
    const profile = getProfile("sign-confuser");
    const atts = [
      mk({ correct: false, misconceptionId: "sign_on_distribution" }),
      mk({ correct: false, misconceptionId: "sign_on_distribution" }),
    ];
    expect(misconceptionReproductionRate(atts, profile, qmap)).toBe(1);
  });

  it("responsiveness is post-intervention minus no-intervention accuracy", () => {
    const atts = [
      mk({ correct: true, priorIntervention: { kind: "targeted_hint", text: "", concepts: [] } }),
      mk({ correct: false }),
    ];
    const r = responsivenessToTutoring(atts)!;
    expect(r).toBeCloseTo(1 - 0);
  });

  it("consistency across runs measures vector agreement", () => {
    expect(consistencyAcrossRuns([[true, false], [true, false]])).toBe(1);
    expect(consistencyAcrossRuns([[true, true], [false, false]])).toBe(0);
    expect(consistencyAcrossRuns([[true]])).toBeNull();
  });
});
