import { describe, expect, it, vi } from "vitest";
import { assess } from "../src/cognition/assessment";
import { calculus, presets } from "../src/cognition/calculus";
import { narrateResponse, permittedNarration } from "../src/cognition/dialogue";
import { accessibility, advance, cloneStudent, createStudent, DAY, load, readiness, respond, teach } from "../src/cognition/engine";
import { compare, defaultExperiment, optimize, sensitivity, trial, validate } from "../src/cognition/experiment";
import { baselines } from "../src/cognition/policy";
import { makeRng } from "../src/lib/rng";

const power = calculus.find(c=>c.id==="power")!;
const profile = () => structuredClone(presets[0]);
const forced = () => ({...profile(),params:{...profile().params,attention:1,encoding:1,capacity:20,readinessFloor:1}});
const policies = baselines(calculus.slice(5).map(c=>c.id));
const configuration = () => ({...defaultExperiment(calculus), minutes:137, trials:3, days:7});

describe("cognitive state", () => {
  it("learns, forgets accessibility, and relearns without lowering mastery", () => {
    const state = createStudent(calculus,forced());
    expect(teach(state,power,"explanation",10,()=>0).encoded).toBe(true);
    const firstMastery = state.memory.power.mastery;
    const firstHalfLife = state.memory.power.halfLife;
    const atEncoding = cloneStudent(state);
    advance(state,DAY);
    expect(load(state)).toBe(0);
    expect(accessibility(state,"power")).toBeLessThan(1);
    advance(state,DAY);
    advance(atEncoding,2*DAY);
    expect(accessibility(state,"power")).toBe(accessibility(atEncoding,"power"));
    expect(state.memory.power.mastery).toBe(firstMastery);
    teach(state,power,"explanation",10,()=>0);
    expect(state.memory.power.mastery).toBeGreaterThan(firstMastery);
    expect(state.memory.power.halfLife).toBeGreaterThan(firstHalfLife);
    expect(accessibility(state,"power")).toBe(1);
  });

  it("records missed attention and failed encoding without raising mastery", () => {
    const absent = forced();
    absent.params.attention = 0;
    const first = createStudent(calculus,absent);
    expect(teach(first,power,"explanation",10,()=>0)).toMatchObject({attention:false,encoded:false,mastery:0});
    const inefficient = forced();
    inefficient.params.encoding = 0;
    const second = createStudent(calculus,inefficient);
    expect(teach(second,power,"explanation",10,()=>0)).toMatchObject({attention:true,encoded:false,mastery:0});
  });

  it("handles missing prerequisites, zero prior, full mastery and overload", () => {
    const model = forced();
    model.prior = {power:1};
    model.params.readinessFloor = .3;
    model.params.capacity = 1;
    const state = createStudent(calculus,model);
    expect(readiness(state,["missing"])).toBe(.3);
    expect(state.memory.exponents.mastery).toBe(0);
    expect(teach(state,power,"explanation",1,()=>0).load).toBeGreaterThan(0);
    expect(load(state)).toBeLessThanOrEqual(1);
    expect(state.memory.power.mastery).toBe(1);
  });

  it("keeps probabilities and mastery bounded under repeated mixed activity", () => {
    const state = createStudent(calculus,profile());
    const rng = makeRng(13);
    for (let i=0;i<300;i++) {
      const concept = calculus[i%calculus.length];
      const step = teach(state,concept,"guided",5,rng);
      expect(step.mastery).toBeGreaterThanOrEqual(0);
      expect(step.mastery).toBeLessThanOrEqual(1);
      const response = step.response ?? respond(state,concept,concept.practice(rng,"far"),rng);
      expect(response.probability).toBeGreaterThanOrEqual(0);
      expect(response.probability).toBeLessThanOrEqual(1);
    }
  });

  it("preserves consistent modeled rules and permits probabilistic correction", () => {
    const model = forced();
    model.params.slip = 0;
    model.params.resistance = 0;
    model.misconceptions = {no_multiplier:1};
    const state = createStudent(calculus,model);
    for (const seed of [1,2,3]) {
      const item = power.practice(makeRng(seed),"procedure");
      const response = respond(state,power,item,()=>0);
      expect(response).toMatchObject({answer:item.errors.no_multiplier, marks:0, cause:"misconception"});
      expect(permittedNarration(response,power).every(text=>text.includes(item.errors.no_multiplier))).toBe(true);
    }
    teach(state,power,"misconception",10,()=>0,"no_multiplier");
    expect(state.misconceptions.no_multiplier.strength).toBeLessThan(1);
    expect(state.misconceptions.no_multiplier.correction).toEqual([10]);
  });

  it("handles extremely rapid forgetting and independently mutable clones", () => {
    const model = forced();
    model.params.halfLife = Number.MIN_VALUE;
    const state = createStudent(calculus,model);
    const copy = cloneStudent(state);
    teach(copy,power,"explanation",10,()=>0);
    advance(copy,100*DAY);
    expect(accessibility(copy,"power")).toBe(0);
    expect(state.memory.power.mastery).toBe(0);
    expect(state.history).toHaveLength(0);
    expect(copy.history).toHaveLength(1);
    expect(state.memory.power.consolidation).toHaveLength(0);
  });

  it("rejects invalid parameters and elapsed time", () => {
    const model = profile();
    model.params.capacity = 0;
    expect(()=>createStudent(calculus,model)).toThrow(RangeError);
    expect(()=>advance(createStudent(calculus,profile()),-1)).toThrow(RangeError);
    expect(()=>validate({...configuration(),minutes:NaN})).toThrow(RangeError);
  });
});

describe("experiments", () => {
  it("reproduces independent runs with matched examination items and exact budgets", () => {
    const config = configuration();
    const rows = compare(calculus,profile(),config,policies);
    expect(compare(calculus,profile(),config,policies)).toEqual(rows);
    const expected = rows[0].example.delayed.responses.map(r=>r.item.id);
    for (const {example,budget,summary} of rows) {
      expect(example.events.reduce((sum,e)=>sum+e.duration,0)).toBe(budget);
      expect(example.events.every((e,i)=>i===0 || e.time >= example.events[i-1].time+example.events[i-1].duration-1e-8)).toBe(true);
      expect(example.state.time).toBe(config.days*DAY);
      expect(example.delayed.responses.map(r=>r.item.id)).toEqual(expected);
      expect(example.observations.every(o=>!("cause" in o) && !("probability" in o) && !("accessibility" in o))).toBe(true);
      expect(summary.scores[0]).toBe(example.delayed.score);
    }
  });

  it("keeps practice and exam item generation separate and independent of earlier testing", () => {
    const config = configuration();
    const state = createStudent(calculus,forced());
    teach(state,power,"retrieval",10,()=>0);
    const before = cloneStudent(state);
    expect(assess(calculus,state,config.exam,42,DAY)).toEqual(assess(calculus,state,config.exam,42,DAY));
    expect(state).toEqual(before);
    for (const concept of calculus) for (const level of ["recall","procedure","near","far"] as const) {
      const bank = new Set(Array.from({length:50},(_,i)=>concept.practice(makeRng(i),level).prompt));
      expect(Array.from({length:50},(_,i)=>concept.assessment(makeRng(i),level).prompt).some(prompt=>bank.has(prompt))).toBe(false);
    }
  });

  it("returns defined results for no instruction and empty assessments", () => {
    const config = {...configuration(),minutes:0,exam:{difficulty:0,blueprint:[]}};
    const initial = createStudent(calculus,profile());
    const result = trial(calculus,initial,policies[0],config,55);
    expect(result.events).toHaveLength(0);
    expect(result.delayed).toMatchObject({score:0,transfer:0,responses:[]});
    expect(result.mastery).toBeGreaterThanOrEqual(result.retention);
    expect(result.state.memory).toEqual(initial.memory);
  });

  it("holds out unseen seeds, enforces budgets and never queries the LLM during numerical work", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch",fetch);
    try {
      const result = optimize(calculus,profile(),configuration(),policies,{objective:"Least time to target",target:.2,candidates:5,trials:3});
      expect(result.searchSeeds.some(seed=>result.evaluationSeeds.includes(seed))).toBe(false);
      expect(result.best.seeds).toEqual(result.evaluationSeeds);
      expect(result.baselines.every(row=>row.seeds===result.evaluationSeeds)).toBe(true);
      expect(result.best.budget).toBeLessThanOrEqual(configuration().minutes);
      expect(sensitivity(calculus,profile(),configuration(),policies,"halfLife",[1,10])).toHaveLength(2);
      expect(fetch).not.toHaveBeenCalled();
    } finally {vi.unstubAllGlobals();}
  });

  it("rejects narration that contradicts or adds to the numerical response", async () => {
    const model = forced();
    model.params.slip = 0;
    model.misconceptions = {no_multiplier:1};
    const state = createStudent(calculus,model);
    const result = respond(state,power,power.practice(()=>0,"recall"),()=>0);
    const allowed = permittedNarration(result,power)[0];
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({
      ok:true,json:vi.fn().mockResolvedValueOnce({ok:true,text:"I changed my answer."}).mockResolvedValueOnce({ok:true,text:allowed}),
    }));
    try {
      await expect(narrateResponse(model,result,power)).resolves.toBeNull();
      await expect(narrateResponse(model,result,power)).resolves.toBe(allowed);
    } finally {vi.unstubAllGlobals();}
  });
});
