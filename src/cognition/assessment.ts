import { clamp, makeRng } from "../lib/rng";
import { advance, cloneStudent, respond, type Level, type StudentState, type Subject } from "./engine";

export interface ExamConfig {
  difficulty: number;
  blueprint: { concept: string; level: Level; count: number }[];
}
export const average = (values: number[]) => values.length ? values.reduce((a,b) => a+b,0)/values.length : 0;

export function assess(subject: Subject, initial: StudentState, config: ExamConfig, seed: number, delay: number) {
  const state = cloneStudent(initial);
  advance(state, delay);
  if (!Number.isFinite(config.difficulty) || Math.abs(config.difficulty) > 1) throw new RangeError("Invalid assessment difficulty.");
  const rng = makeRng(seed);
  const responsesRng = makeRng(seed ^ 0x761d42b3);
  const responses = config.blueprint.flatMap(row => {
    const concept = subject.find(c => c.id === row.concept);
    if (!concept || !Number.isSafeInteger(row.count) || row.count < 0 || row.count > 50 ||
      !["recall","procedure","near","far"].includes(row.level)) throw new RangeError("Invalid assessment blueprint.");
    return Array.from({length:row.count}, () => {
      const item = concept.assessment(rng,row.level);
      item.difficulty = clamp(item.difficulty + config.difficulty);
      return respond(state,concept,item,makeRng(responsesRng() * 2 ** 32));
    });
  });
  return {time:state.time, responses, score:average(responses.map(r => r.marks)),
    transfer:average(responses.filter(r => r.item.level === "far" || r.item.level === "near").map(r => r.marks))};
}
