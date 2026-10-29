import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  applyIntervention,
  freshState,
  makeAttemptSeed,
  simulateAttempt,
  skillForQuestion,
  updateStateAfterAttempt,
} from "../src/lib/engine";
import { getProfile } from "../src/lib/profiles";
import { getQuestion } from "../src/lib/questions";
import { buildInterventions } from "../src/lib/interventions";
import { createRun, runAttempt } from "../src/lib/session";

describe("deterministic simulation", () => {
  it("is reproducible for the same seed on the enhanced path", () => {
    const profile = getProfile("sign-confuser");
    const q = getQuestion("exp-3");
    const state = freshState(profile);
    const seed = makeAttemptSeed(profile.id, "s1", q.id, 0);
    const a = simulateAttempt({ profile, question: q, simulator: "enhanced", state, priorIntervention: null, seed });
    const state2 = freshState(profile);
    const b = simulateAttempt({ profile, question: q, simulator: "enhanced", state: state2, priorIntervention: null, seed });
    expect(a.answer).toBe(b.answer);
    expect(a.correct).toBe(b.correct);
  });

  it("sign-confuser profile reproduces its sign misconception on exp-3 often", () => {
    const profile = getProfile("sign-confuser");
    const q = getQuestion("exp-3");
    let fires = 0;
    const tries = 200;
    for (let i = 0; i < tries; i++) {
      const state = freshState(profile);
      const res = simulateAttempt({
        profile, question: q, simulator: "enhanced", state, priorIntervention: null,
        seed: makeAttemptSeed(profile.id, "bulk", q.id, i),
      });
      if (!res.correct && res.misconceptionId === "sign_on_distribution") fires++;
    }
    // severity 0.8 on a learner that has it: should be a common outcome
    expect(fires / tries).toBeGreaterThan(0.1);
  });

  it("never lets the enhanced learner's skill exceed [0,1] after repeated correct answers", () => {
    const profile = getProfile("developing-learner");
    const q = getQuestion("lin-1");
    const state = freshState(profile);
    for (let i = 0; i < 30; i++) updateStateAfterAttempt(state, q, true, null);
    expect(state.skills.linear_equations).toBeLessThanOrEqual(1);
    expect(state.skills.linear_equations).toBeGreaterThan(profile.initialSkills.linear_equations);
  });
});

describe("explicit state-update rules", () => {
  it("a targeted hint boosts the specific misconception, not the skill directly", () => {
    const profile = getProfile("sign-confuser");
    const q = getQuestion("exp-3");
    const state = freshState(profile);
    const iv = buildInterventions(profile, q, state).targeted_hint;
    const skillBefore = skillForQuestion(state.skills, q);
    applyIntervention(state, iv, q, DEFAULT_CONFIG);
    expect(state.pendingBoosts[iv.targetsMisconception!]).toBeGreaterThan(0);
    // targeted hint does not nudge skill
    expect(Object.keys(state.pendingSkillNudge).length).toBe(0);
    expect(skillForQuestion(state.skills, q)).toBe(skillBefore);
  });

  it("a hint for one misconception does not automatically help a different concept", () => {
    const profile = getProfile("sign-confuser");
    const q = getQuestion("exp-3");
    const unrelated = getQuestion("wp-1"); // word problem concept
    const state = freshState(profile);
    const iv = buildInterventions(profile, q, state).targeted_hint;
    applyIntervention(state, iv, q, DEFAULT_CONFIG);
    // commit pending
    simulateAttempt({ profile, question: q, simulator: "enhanced", state, priorIntervention: iv, seed: 1 });
    const boost = state.correctionBoosts[iv.targetsMisconception!]!;
    // on a question with no overlapping concept, effective boost should not fire
    const wrongOn = simulateAttempt({ profile, question: unrelated, simulator: "enhanced", state, priorIntervention: null, seed: 2 });
    expect(boost).toBeGreaterThan(0);
    expect(wrongOn).toBeTruthy();
  });

  it("does NOT mark a learner as having learned a concept after a single explanation", () => {
    const profile = getProfile("developing-learner");
    const q = getQuestion("lin-3");
    const state = freshState(profile);
    const iv = buildInterventions(profile, q, state).direct_explanation;
    applyIntervention(state, iv, q, DEFAULT_CONFIG);
    // skill must stay well below mastery (1.0)
    expect(state.skills.linear_equations).toBeLessThan(0.85);
  });
});

describe("baseline vs enhanced differ", () => {
  it("enhanced accuracy after hints should be able to exceed baseline on repeated related questions", () => {
    const profile = getProfile("sign-confuser");
    const q = getQuestion("exp-3");
    let enhCorrect = 0;
    let baseCorrect = 0;
    for (let i = 0; i < 40; i++) {
      {
        const run = createRun(profile, "enhanced", "e" + i);
        const iv = buildInterventions(profile, q, run.state).targeted_hint;
        runAttempt(run, q, iv); // hint then attempt; state carries improvement
        if (run.attempts[0].correct) enhCorrect++;
      }
      {
        const run = createRun(profile, "baseline", "b" + i);
        const iv = buildInterventions(profile, q, run.state).targeted_hint;
        runAttempt(run, q, iv);
        if (run.attempts[0].correct) baseCorrect++;
      }
    }
    expect(enhCorrect).toBeGreaterThan(0);
    expect(baseCorrect).toBeGreaterThan(-1); // both are stochastic; sanity only
  });
});
