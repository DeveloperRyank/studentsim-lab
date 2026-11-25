import { hashStringToSeed, makeRng } from "../lib/rng";
import { assess, average, type ExamConfig } from "./assessment";
import { accessibility, advance, cloneStudent, createStudent, DAY, interventions, teach, type InterventionSettings, type Profile, type StudentState, type Subject } from "./engine";
import { candidate, schedule, type Observation, type Policy, type TeachingEvent } from "./policy";

export interface ExperimentConfig {
  days: number;
  minutes: number;
  trials: number;
  seed: number;
  delayDays: number;
  exam: ExamConfig;
  interventions: InterventionSettings;
}
export function defaultExperiment(subject: Subject): ExperimentConfig {
  return {days:30,minutes:600,trials:24,seed:2026,delayDays:0,interventions:structuredClone(interventions),
    exam:{difficulty:0,blueprint:subject.flatMap(c =>
      (c.examLevels ?? [{level:"recall" as const,count:2}]).map(row => ({...row,concept:c.id})))}};
}
export function validate(config: ExperimentConfig) {
  const {days, minutes, trials, seed, delayDays} = config;
  if (!Number.isFinite(days) || days <= 0 || days > 3650 || !Number.isSafeInteger(minutes) || minutes < 0 ||
    minutes > Math.min(days*DAY,6000) || !Number.isSafeInteger(trials) || trials < 1 || trials > 2000 ||
    !Number.isSafeInteger(seed) || !Number.isFinite(delayDays) || delayDays < 0 || delayDays > 3650) throw new RangeError("Invalid experiment settings.");
  for (const key of Object.keys(interventions) as (keyof InterventionSettings)[]) {
    const spec = config.interventions[key];
    if (!spec || !Number.isFinite(spec.complexity) || spec.complexity < 0 || spec.complexity > 1 ||
      !Number.isFinite(spec.learning) || spec.learning < 0 || spec.learning > 5 ||
      typeof spec.practice !== "boolean" || typeof spec.feedback !== "boolean") throw new RangeError(`Invalid intervention: ${key}`);
  }
}

export function trial(subject: Subject, initial: StudentState, policy: Policy, config: ExperimentConfig, seed: number, budget = config.minutes) {
  const state = cloneStudent(initial);
  const start = state.time;
  const observations: Observation[] = [];
  const events: TeachingEvent[] = [];
  const curriculum = subject.map(c => ({id:c.id,prerequisites:c.prerequisites,misconceptionIds:c.misconceptions.map(m => m.id)}));
  const byId = new Map(subject.map(c => [c.id,c]));
  if (!policy.order.length || !policy.activities.length || !Number.isFinite(policy.spacing) || policy.spacing < 0 || policy.spacing > 1 ||
    policy.order.some(id => !byId.has(id)) || policy.activities.some(action => !Object.prototype.hasOwnProperty.call(interventions,action)) ||
    !Number.isSafeInteger(budget) || budget < 0 || budget > config.minutes) throw new RangeError("Invalid teaching policy or budget.");
  const next = schedule(policy,curriculum,budget,config.days*DAY,() => observations);
  for (let index = 0; index < Math.ceil(budget/10); index++) {
    const event = next(index);
    advance(state,Math.max(0,start+event.time-state.time));
    const trace = teach(state,byId.get(event.concept)!,event.action,event.duration,
      makeRng(hashStringToSeed(`${seed}:teaching:${index}`)),event.target,config.interventions);
    events.push(event);
    const response = trace.response;
    if (response) {
      const feedback = trace.feedback;
      observations.push({concept:event.concept,prompt:response.item.prompt,answer:response.answer,correct:Boolean(response.marks),feedback,
        misconception:Object.keys(response.item.errors).find(id => response.item.errors[id] === response.answer)});
    }
  }
  const examSeed = hashStringToSeed(`${seed}:exam`);
  const immediate = assess(subject,state,config.exam,examSeed,0);
  const remaining = Math.max(0,start+(config.days+config.delayDays)*DAY-state.time);
  const delayed = assess(subject,state,config.exam,examSeed,remaining);
  state.assessments.push({time:immediate.time,responses:immediate.responses},{time:delayed.time,responses:delayed.responses});
  advance(state,remaining);
  const concepts = Object.fromEntries(subject.map(c => [c.id,{mastery:state.memory[c.id].mastery,accessibility:accessibility(state,c.id)}]));
  const initialKnowledge = average(Object.values(initial.memory).map(m => m.mastery));
  const mastery = average(Object.values(concepts).map(c => c.mastery));
  return {state,events,observations,immediate,delayed,concepts,budget,mastery,
    retention:average(Object.values(concepts).map(c => c.mastery*c.accessibility)),
    misconceptions:average(subject.flatMap(c => c.misconceptions.map(m => state.misconceptions[m.id]?.strength ?? 0))),
    efficiency:budget ? (mastery-initialKnowledge)/budget : 0};
}
export type Trial = ReturnType<typeof trial>;
export const trialSeeds = (seed: number, split: "comparison" | "search" | "evaluation", count: number) =>
  Array.from({length:count},(_, i) => (hashStringToSeed(String(seed)) + i*4 + ["comparison","search","evaluation"].indexOf(split)) >>> 0);

export function summarize(values: number[]) {
  const sorted = [...values].sort((a,b) => a-b);
  const mean = average(values);
  const sd = values.length > 1 ? Math.sqrt(values.reduce((sum,value) => sum+(value-mean)**2,0)/(values.length-1)) : 0;
  const margin = 1.96*sd/Math.sqrt(values.length);
  return {mean,median:average(sorted.slice(Math.floor((sorted.length-1)/2),Math.floor(sorted.length/2)+1)),sd,
    ci:values.length >= 20 ? [Math.max(0,mean-margin),Math.min(1,mean+margin)] : null, scores:values};
}
export function evaluate(subject: Subject, initial: StudentState, config: ExperimentConfig, policy: Policy, seeds: number[], budget = config.minutes) {
  const scores: number[] = [];
  const totals = {immediate:0, transfer:0, retention:0, mastery:0, misconceptions:0, efficiency:0};
  const concepts = Object.fromEntries(subject.map(c => [c.id,{mastery:0,accessibility:0}]));
  let example: Trial | undefined;
  for (const seed of seeds) {
    const run = trial(subject,initial,policy,config,seed,budget);
    example ??= run;
    scores.push(run.delayed.score);
    totals.immediate += run.immediate.score;
    totals.transfer += run.delayed.transfer;
    for (const key of ["retention","mastery","misconceptions","efficiency"] as const) totals[key] += run[key];
    for (const [id,stat] of Object.entries(run.concepts)) {
      concepts[id].mastery += stat.mastery/seeds.length;
      concepts[id].accessibility += stat.accessibility/seeds.length;
    }
  }
  if (!example) throw new RangeError("At least one trial is required.");
  for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] /= seeds.length;
  return {policy,budget,seeds,summary:summarize(scores),...totals,concepts,example};
}
export type Evaluation = ReturnType<typeof evaluate>;

export function compare(subject: Subject, profile: Profile, config: ExperimentConfig, policies: Policy[]) {
  validate(config);
  const initial = createStudent(subject,profile);
  const seeds = trialSeeds(config.seed,"comparison",config.trials);
  return policies.map(policy => evaluate(subject,initial,config,policy,seeds));
}

export const objectives = ["Delayed assessment","Retention","Transfer","Fewer misconceptions","Learning per minute","Least time to target"] as const;
export type Objective = typeof objectives[number];
export interface SearchConfig { objective: Objective; candidates: number; trials: number; target: number }
export function optimize(subject: Subject, profile: Profile, config: ExperimentConfig, policies: Policy[],
  search: SearchConfig, progress: (completed: number) => void = () => {}) {
  validate(config);
  if (!objectives.includes(search.objective) || !Number.isSafeInteger(search.candidates) || search.candidates < 1 || search.candidates > 300 ||
    !Number.isSafeInteger(search.trials) || search.trials < 2 || search.trials > 100 || !Number.isFinite(search.target) ||
    search.target < 0 || search.target > 1) throw new RangeError("Invalid search settings.");
  const initial = createStudent(subject,profile);
  const searchSeeds = trialSeeds(config.seed,"search",search.trials);
  const evaluationSeeds = trialSeeds(config.seed,"evaluation",Math.max(2,config.trials));
  const rng = makeRng(hashStringToSeed(`${config.seed}:policies`));
  const variableTime = search.objective === "Least time to target" || search.objective === "Learning per minute";
  function value(row: Evaluation) {
    switch (search.objective) {
      case "Retention": return row.retention;
      case "Transfer": return row.transfer;
      case "Fewer misconceptions": return -row.misconceptions;
      case "Learning per minute": return row.efficiency;
      case "Least time to target": return row.summary.mean >= search.target ? 2-row.budget/(config.minutes || 1) : row.summary.mean;
      default: return row.summary.mean;
    }
  }
  const targets = policies[0]?.order ?? subject.map(c => c.id);
  let best: Evaluation | undefined;
  for (let i = 0; i < search.candidates; i++) {
    const budget = variableTime ? Math.round(config.minutes*(i === 0 ? 1 : rng())) : config.minutes;
    const run = evaluate(subject,initial,config,candidate(targets,rng,i),searchSeeds,budget);
    if (!best || value(run) > value(best)) best = run;
    progress(i+1);
  }
  const selected = best!;
  return {searchSeeds,evaluationSeeds, searchScore:value(selected),
    best:evaluate(subject,initial,config,selected.policy,evaluationSeeds,selected.budget),
    baselines:policies.map(policy => evaluate(subject,initial,config,policy,evaluationSeeds))};
}

export function sensitivity(subject: Subject, profile: Profile, config: ExperimentConfig, policies: Policy[], key: keyof Profile["params"], values: number[]) {
  return values.map(value => {
    const adjusted = {...profile,params:{...profile.params,[key]:value}};
    const ranking = compare(subject,adjusted,config,policies).map(row => ({name:row.policy.name,score:row.summary.mean}))
      .sort((a,b) => b.score-a.score);
    return {value,ranking};
  });
}
