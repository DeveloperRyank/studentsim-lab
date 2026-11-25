import { calculus } from "./calculus";
import { defaults, type Profile } from "./engine";
import { compare, defaultExperiment } from "./experiment";
import { baselines } from "./policy";

export const readinessLevels = ["Needs review", "Comfortable", "Strong"] as const;
export const experienceLevels = ["New to calculus", "Some exposure", "Can differentiate simple functions"] as const;
export interface LearnerOverview {
  foundations: typeof readinessLevels[number];
  calculus: typeof experienceLevels[number];
}

export const benchmark = 0.60;

export function modelLearner(overview: LearnerOverview): Profile {
  const foundations = readinessLevels.indexOf(overview.foundations);
  const experience = experienceLevels.indexOf(overview.calculus);
  if (foundations < 0 || experience < 0) throw new RangeError("Choose a knowledge level for both areas.");
  const prerequisiteMastery = [0.3, 0.68, 0.9][foundations];
  const prior = Object.fromEntries(calculus.slice(0,5).map(concept => [concept.id,prerequisiteMastery]));
  const introduction = ["limits","average","instantaneous","definition","constant","power"];
  for (const concept of calculus.slice(5)) {
    prior[concept.id] = experience === 0 ? 0
      : experience === 1 ? (introduction.includes(concept.id) ? .25 : .08)
      : introduction.includes(concept.id) || concept.id === "polynomial" || concept.id === "sum" ? .65 : .25;
  }
  return {id:"Calculus learner",prior,misconceptions:{},params:{...defaults,halfLife:7,forgetting:1}};
}

export function selectTeachingMethod<T extends {summary: {mean: number}}>(rows: T[], target = benchmark) {
  return [...rows].sort((a,b)=>b.summary.mean-a.summary.mean).find(row=>row.summary.mean>=target) ?? null;
}

export function recommendTeaching(overview: LearnerOverview) {
  const profile = modelLearner(overview);
  const config = {...defaultExperiment(calculus),days:30,minutes:3600,delayDays:0,trials:32,seed:7301};
  const policies = baselines(calculus.map(concept=>concept.id));
  const comparison = compare(calculus,profile,config,policies);
  // Keep the first-run detail in the research lab. The guided results only need aggregate evidence.
  const methods = comparison.map(({policy,summary,transfer})=>({name:policy.name,summary,transfer}));
  return {methods,recommendation:selectTeachingMethod(methods),benchmark,days:config.days,
    instructionalHours:config.minutes/60,trials:config.trials,examQuestions:config.exam.blueprint.reduce((sum,row)=>sum+row.count,0)};
}

export type TeachingRecommendation = ReturnType<typeof recommendTeaching>;
