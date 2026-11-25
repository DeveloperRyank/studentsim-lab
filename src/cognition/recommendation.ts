import { calculus } from "./calculus";
import { defaults, type Profile } from "./engine";
import { compare, defaultExperiment } from "./experiment";
import { baselines } from "./policy";

export const readinessLevels = ["Needs review", "Comfortable", "Strong"] as const;
export const experienceLevels = ["New to calculus", "Some exposure", "Can differentiate simple functions"] as const;
export const topicLevels = [
  {label:"New to this",mastery:0},
  {label:"Recognizes it",mastery:.2},
  {label:"Can do it with help",mastery:.45},
  {label:"Can do it independently",mastery:.75},
  {label:"Can explain and apply it in a new problem",mastery:.95},
] as const;
export type TopicLevel = typeof topicLevels[number]["label"];

export const observedErrors = calculus.flatMap(concept =>
  concept.misconceptions.map(error => ({...error,concept:concept.name})));

export interface LearnerOverview {
  foundations: typeof readinessLevels[number];
  calculus: typeof experienceLevels[number];
  topics?: Record<string,TopicLevel>;
  observedErrors?: string[];
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
  for (const [id,level] of Object.entries(overview.topics ?? {})) {
    const rating = topicLevels.find(item=>item.label===level);
    if (!rating || !calculus.some(concept=>concept.id===id)) throw new RangeError("Unknown topic or knowledge level.");
    prior[id] = rating.mastery;
  }
  const misconceptions: Profile["misconceptions"] = {};
  for (const id of overview.observedErrors ?? []) {
    if (!observedErrors.some(error=>error.id===id)) throw new RangeError("Unknown observed error.");
    misconceptions[id] = .55;
  }
  return {id:"Calculus learner",prior,misconceptions,params:{...defaults,halfLife:7,forgetting:1}};
}

export function selectTeachingMethod<T extends {summary: {mean: number}}>(rows: T[], target = benchmark) {
  return [...rows].sort((a,b)=>b.summary.mean-a.summary.mean).find(row=>row.summary.mean>=target) ?? null;
}

export const trainingBudgets = [60, 120] as const;

export function recommendTeaching(overview: LearnerOverview, onStage: (hours: number) => void = () => {}) {
  const profile = modelLearner(overview);
  const config = {...defaultExperiment(calculus),days:30,delayDays:0,trials:32};
  const policies = baselines(calculus.map(concept=>concept.id));
  const stages = [];
  for (const instructionalHours of trainingBudgets) {
    onStage(instructionalHours);
    const minutes = instructionalHours * 60;
    const seed = 7301 + (instructionalHours-trainingBudgets[0])*120;
    const methods = compare(calculus,profile,{...config,minutes,seed},policies)
      .map(({policy,summary,transfer})=>({name:policy.name,summary,transfer}))
      .sort((a,b)=>b.summary.mean-a.summary.mean);
    const recommendation = selectTeachingMethod(methods);
    stages.push({instructionalHours,methods,recommendation});
    if (recommendation) break;
  }
  const finalStage = stages[stages.length-1];
  return {...finalStage,stages,benchmark,days:config.days,
    detailedTopics:Object.keys(overview.topics ?? {}).length,
    detailedErrors:Object.keys(profile.misconceptions).length,
    trials:config.trials,examQuestions:config.exam.blueprint.reduce((sum,row)=>sum+row.count,0)};
}

export type TeachingRecommendation = ReturnType<typeof recommendTeaching>;
