import { clamp } from "../lib/rng";

export const DAY = 1440;
export type Random = () => number;
export type Level = "recall" | "procedure" | "near" | "far";
export interface Item {
  id: string;
  concept: string;
  difficulty: number;
  level: Level;
  prompt: string;
  answer: string;
  errors: Record<string, string>;
}
export interface Concept {
  id: string;
  name: string;
  description: string;
  type: "factual" | "conceptual" | "procedural";
  prerequisites: string[];
  related: string[];
  transfer: string[];
  difficulty: number;
  misconceptions: { id: string; rule: string }[];
  instruction: string;
  stability: number;
  practice: (rng: Random, level: Level) => Item;
  assessment: (rng: Random, level: Level) => Item;
  examLevels?: {level: Level; count: number}[];
}
export type Subject = readonly Concept[];
export const defaults = {
  attention: .78, capacity: 3, encoding: .88, learning: .36, halfLife: 2,
  forgetting: 1.35, retrieval: .92, susceptibility: .32, resistance: .35,
  transfer: .73, guess: .07, slip: .05, readinessFloor: .3, bufferMinutes: 25,
  attentionDuration: 90, attentionComplexity: .25, loadPenalty: .65,
  formationGain: .3, correctionChance: .78, correctionGain: .65,
  instructionStrength: .23, immediateStrength: .12, delayedStrength: .55,
  applicationStrength: .38, spacingMinutes: DAY, maxHalfLife: 36500,
};
export type Parameters = typeof defaults;
export interface Profile {
  id: string;
  params: Parameters;
  prior: Record<string, number>;
  misconceptions: Record<string, number>;
}
export interface Memory {
  mastery: number;
  halfLife: number;
  anchor: number;
  encoded: number | null;
  retrieved: number | null;
  successes: number;
  failures: number;
  consolidation: { time: number; halfLife: number; quality: number }[];
}
export interface Misconception {
  strength: number;
  formation: number[];
  correction: number[];
}
export interface Response {
  item: Item;
  answer: string;
  marks: number;
  cause: "reasoning" | "guess" | "slip" | "retrieval" | "prerequisite" | "misconception";
  misconception?: string;
  accessibility: number;
  probability: number;
}
export interface Trace {
  time: number;
  concept: string;
  action: string;
  attention?: boolean;
  encoded?: boolean;
  response?: Response;
  correction?: string;
  formed?: string[];
  feedback?: string;
  tutorNotes?: string;
  mastery: number;
  accessibility: number;
  load: number;
}
export interface StudentState {
  profile: Profile;
  time: number;
  buffer: { concept: string; units: number; expires: number; encoded: boolean }[];
  memory: Record<string, Memory>;
  misconceptions: Record<string, Misconception>;
  history: Trace[];
  assessments: { time: number; responses: Response[] }[];
}
export function createStudent(subject: Subject, profile: Profile): StudentState {
  const {params} = profile;
  const positive = ["capacity", "halfLife", "attentionDuration", "maxHalfLife"];
  const unbounded = [...positive, "forgetting", "bufferMinutes", "spacingMinutes", "instructionStrength", "immediateStrength", "delayedStrength", "applicationStrength"];
  for (const key of Object.keys(defaults) as (keyof Parameters)[]) {
    const value = params[key];
    if (!Number.isFinite(value) || value < 0 || (positive.includes(key) && value === 0) || (!unbounded.includes(key) && value > 1)) {
      throw new RangeError(`Invalid cognitive parameter: ${key}`);
    }
  }
  if (params.guess + params.slip > 1) throw new RangeError("Guess and slip must sum to at most one.");
  for (const value of [...Object.values(profile.prior), ...Object.values(profile.misconceptions)]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Initial knowledge and misconceptions must be between zero and one.");
  }
  return {
    profile: structuredClone(profile), time: 0, buffer: [], history: [], assessments: [],
    memory: Object.fromEntries(subject.map(c => [c.id, {
      mastery: profile.prior[c.id] ?? 0, halfLife: Math.max(Number.MIN_VALUE, Math.min(params.maxHalfLife, params.halfLife * c.stability)),
      anchor: 0, encoded: null, retrieved: null, successes: 0, failures: 0, consolidation: [],
    }])),
    misconceptions: Object.fromEntries(Object.entries(profile.misconceptions).map(([id, strength]) => [id, { strength, formation: [], correction: [] }])),
  };
}
export const cloneStudent = (state: StudentState) => structuredClone(state);

export function advance(state: StudentState, minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(state.time + minutes)) throw new RangeError("Invalid elapsed time.");
  state.time += minutes;
  state.buffer = state.buffer.filter(entry => entry.expires > state.time);
}

export function exponentialDecay(elapsed: number, halfLife: number, sensitivity: number) {
  return elapsed === 0 || sensitivity === 0 ? 1 : 2 ** (-(elapsed / DAY) * sensitivity / halfLife);
}

export function accessibility(state: StudentState, id: string, decay = exponentialDecay) {
  const memory = state.memory[id];
  return memory && memory.mastery > 0 ? decay(state.time - memory.anchor, memory.halfLife, state.profile.params.forgetting) : 0;
}

export function readiness(state: StudentState, prerequisites: readonly string[]) {
  if (!prerequisites.length) return 1;
  const floor = state.profile.params.readinessFloor;
  const average = prerequisites.reduce((sum, id) => sum + (state.memory[id]?.mastery ?? 0) * accessibility(state, id), 0) / prerequisites.length;
  return floor + (1 - floor) * average;
}

export const load = (state: StudentState) => state.buffer.reduce((sum, entry) => sum + entry.units, 0);

function consolidate(state: StudentState, memory: Memory, effect: number, quality: number) {
  if (effect > 0 && quality > 0) {
    memory.halfLife = Math.min(state.profile.params.maxHalfLife, memory.halfLife * (1 + effect * quality));
    memory.consolidation.push({time: state.time, halfLife: memory.halfLife, quality});
  }
  memory.anchor = state.time;
}

export function respond(state: StudentState, concept: Concept, item: Item, rng: Random, overload = 0): Response {
  const memory = state.memory[concept.id];
  const p = state.profile.params;
  const access = accessibility(state, concept.id);
  const ready = readiness(state, concept.prerequisites);
  const transfer = item.level === "far" ? p.transfer ** 2 : item.level === "near" ? p.transfer : 1;
  const connected = item.level === "near" || item.level === "far" ? readiness(state, concept.transfer) : 1;
  const solve = clamp(transfer * connected * (1 - item.difficulty) * (1 - p.loadPenalty * overload));
  const strengths = Object.keys(item.errors).map(id => [id, state.misconceptions[id]?.strength ?? 0] as const);
  const survive = strengths.reduce((product, [, strength]) => product * (1 - strength), 1);
  const independent = clamp(memory.mastery * access * p.retrieval);
  const reasoning = (1 - p.slip) * ready * independent * survive * solve;
  // Guessing is an explicit route only when the reasoning route fails without a misconception or slip.
  const probability = clamp(reasoning + p.guess * (1 - p.slip) * survive * (1 - ready * independent * solve));
  const result: Response = { item, answer: "Unsure", marks: 0, cause: "retrieval", accessibility: access, probability };
  if (rng() < p.slip) result.cause = "slip";
  else {
    const misconception = strengths.find(([, strength]) => rng() < strength);
    if (misconception) {
      result.cause = "misconception";
      result.misconception = misconception[0];
      result.answer = item.errors[misconception[0]];
    } else {
      const prepared = rng() < ready;
      const recalled = prepared && rng() < independent;
      const solved = recalled && rng() < solve;
      result.cause = solved ? "reasoning" : !prepared ? "prerequisite" : recalled ? "slip" : "retrieval";
      if (solved || rng() < p.guess) {
        result.cause = solved ? "reasoning" : "guess";
        result.answer = item.answer;
      }
    }
  }
  result.marks = Number(result.answer === item.answer);
  return result;
}

export const interventions = {
  explanation: {complexity: .45, learning: 1, practice: false, feedback: false},
  example: {complexity: .3, learning: 1.15, practice: false, feedback: false},
  guided: {complexity: .35, learning: 1.15, practice: true, feedback: true},
  independent: {complexity: .65, learning: .9, practice: true, feedback: true},
  retrieval: {complexity: .47, learning: 1, practice: true, feedback: true},
  review: {complexity: .35, learning: 1.05, practice: true, feedback: true},
  correction: {complexity: .3, learning: 1.12, practice: false, feedback: true},
  misconception: {complexity: .3, learning: 1.15, practice: false, feedback: true},
  remediation: {complexity: .25, learning: 1.15, practice: false, feedback: false},
  transfer: {complexity: .8, learning: .95, practice: true, feedback: true},
  diagnostic: {complexity: .55, learning: 0, practice: true, feedback: false},
};
export type Action = keyof typeof interventions;
export type InterventionSettings = typeof interventions;

export function teach(state: StudentState, concept: Concept, action: Action, minutes: number, rng: Random,
  target?: string, settings: InterventionSettings = interventions): Trace {
  if (minutes <= 0) throw new RangeError("Teaching duration must be positive.");
  advance(state, minutes);
  const p = state.profile.params;
  const spec = settings[action];
  const memory = state.memory[concept.id];
  const units = 1 + spec.complexity + concept.difficulty;
  const overload = clamp((load(state) + units - p.capacity) / p.capacity);
  const ready = readiness(state, concept.prerequisites);
  const attended = rng() < clamp(p.attention * (1 - minutes / (minutes + p.attentionDuration)) *
    (1 - p.attentionComplexity * spec.complexity) * (1 - p.loadPenalty * overload));
  const trace: Trace = {time: state.time, action, concept: concept.id, attention: attended, encoded: false,
    mastery: memory.mastery, accessibility: accessibility(state, concept.id), load: overload};
  if (attended) {
    const entry = {concept: concept.id, units: Math.max(0, Math.min(units, p.capacity - load(state))), expires: state.time + p.bufferMinutes, encoded: false};
    if (entry.units > 0 && p.bufferMinutes > 0) state.buffer.push(entry);
    if (spec.practice) {
      const level = action === "transfer" ? "near" : action === "retrieval" || action === "review" ? "recall" : "procedure";
      trace.response = respond(state, concept, concept.practice(rng, level), rng, overload);
      if (spec.feedback) trace.feedback = trace.response.item.answer;
      if (trace.response.cause === "reasoning") {
        memory.successes++;
        const delay = state.time - memory.anchor;
        memory.retrieved = state.time;
        const strength = level === "near" ? p.applicationStrength : delay >= p.spacingMinutes ? p.delayedStrength : p.immediateStrength;
        consolidate(state, memory, strength, trace.response.accessibility);
      } else memory.failures++;
    }
    const canStudy = spec.learning > 0 && (!spec.practice || spec.feedback);
    const successfulRecall = trace.response?.cause === "reasoning";
    const difficulty = clamp(concept.difficulty + p.loadPenalty * overload);
    entry.encoded = canStudy && !successfulRecall && rng() < clamp(p.encoding * ready * (1 - difficulty));
    trace.encoded = entry.encoded;
    if (entry.encoded) {
      const effectiveRate = clamp(p.learning * ready * spec.learning * (1 - p.loadPenalty * overload));
      memory.mastery = clamp(memory.mastery + (1 - memory.mastery) * effectiveRate);
      memory.encoded = state.time;
      consolidate(state, memory, p.instructionStrength, effectiveRate);
    }
    const correction = target ?? trace.response?.misconception;
    const belief = correction && concept.misconceptions.some(m => m.id === correction) ? state.misconceptions[correction] : undefined;
    if (spec.feedback && belief && rng() < p.correctionChance * (1 - p.resistance) * ready) {
      belief.strength *= 1 - p.correctionGain;
      belief.correction.push(state.time);
      trace.correction = correction;
    }
    if (canStudy && !entry.encoded && !successfulRecall && !trace.correction) {
      for (const rule of concept.misconceptions) {
        if (rng() >= p.susceptibility * (1 - memory.mastery)) continue;
        const active = state.misconceptions[rule.id] ??= {strength: 0, formation: [], correction: []};
        active.strength += (1 - active.strength) * p.formationGain;
        active.formation.push(state.time);
        (trace.formed ??= []).push(rule.id);
      }
    }
  }
  trace.mastery = memory.mastery;
  trace.accessibility = accessibility(state, concept.id);
  state.history.push(trace);
  return trace;
}
