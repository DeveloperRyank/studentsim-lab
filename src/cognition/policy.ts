import type { Action, Random } from "./engine";

export interface Observation {
  concept: string;
  prompt: string;
  answer: string;
  correct: boolean;
  feedback?: string;
  misconception?: string;
}
export interface CurriculumEntry {id: string; prerequisites: string[]; misconceptionIds: string[]}
export interface TeachingEvent {time: number; duration: number; concept: string; action: Action; target?: string}
export interface Policy {
  name: string;
  order: string[];
  activities: Action[];
  spacing: number;
  adaptive?: "performance" | "misconception";
}
export function baselines(targets: string[]): Policy[] {
  return [
    {name:"Direct instruction",order:targets,activities:["explanation","explanation","independent"],spacing:.18},
    {name:"Worked examples",order:targets,activities:["example","guided","independent"],spacing:.25},
    {name:"Spaced retrieval",order:targets,activities:["explanation","retrieval","review","retrieval"],spacing:1},
    {name:"Adaptive teaching",order:targets,activities:["example","diagnostic","guided","retrieval"],spacing:.85,adaptive:"performance"},
    {name:"Misconception-driven",order:targets,activities:["explanation","diagnostic","misconception","review"],spacing:.85,adaptive:"misconception"},
  ];
}
export function schedule(policy: Policy, curriculum: readonly CurriculumEntry[], budget: number, horizon: number, observation: () => readonly Observation[]) {
  const count = Math.ceil(budget / 10);
  return function event(index: number): TeachingEvent {
    const cycle = Math.floor(index/policy.order.length);
    const duration = Math.min(10, budget - index*10);
    const time = index*10 + (horizon-budget)*policy.spacing*(count <= 1 ? 0 : index/(count-1));
    let concept = policy.order[index%policy.order.length];
    let action = policy.activities[cycle%policy.activities.length];
    let target: string | undefined;
    if (cycle > 0 && policy.adaptive) {
      const latest = [...observation()].reverse().find(row => row.concept === concept);
      if (latest && !latest.correct) {
        const entry = curriculum.find(c => c.id === concept);
        if (policy.adaptive === "misconception" && latest.misconception) {
          target = latest.misconception;
          action = "misconception";
        } else if (entry?.prerequisites.length && policy.adaptive === "performance" && cycle%2 === 0) {
          concept = entry.prerequisites[cycle%entry.prerequisites.length];
          action = "remediation";
        } else action = "guided";
      }
    }
    if (action === "misconception" && !target) action = "diagnostic";
    return {time,duration,concept,action,target};
  };
}
const practiceActions: Action[] = ["guided","independent","retrieval","review","transfer","diagnostic","correction","misconception","example"];
export function candidate(targets: string[], rng: Random, index: number): Policy {
  const order = [...targets];
  for (let i = order.length-1; i > 0; i--) {
    const j = Math.floor(rng()*(i+1));
    [order[i],order[j]] = [order[j],order[i]];
  }
  const adaptive = rng();
  return {name:`Candidate ${index+1}`, order, spacing:rng(),
    activities:[rng() < .5 ? "explanation" : "example", ...Array.from({length:4}, () => practiceActions[Math.floor(rng()*practiceActions.length)])],
    adaptive: adaptive < .33 ? "performance" : adaptive < .66 ? "misconception" : undefined};
}
