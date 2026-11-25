import { requestNarration } from "../lib/api";
import type { Concept, Profile, Response } from "./engine";

/** Finite surface forms let the caller validate the full output, including the answer. */
export function permittedNarration(response: Response, concept: Concept) {
  const answer = response.answer;
  if (answer === "Unsure") return ["I'm not sure.", "I don't have an answer yet."];
  if (response.cause === "guess") return [`My guess is ${answer}.`, `I'd guess ${answer}.`];
  const rule = concept.misconceptions.find(m => m.id === response.misconception);
  if (rule) return [`I used this rule: ${rule.rule} My answer is ${answer}.`, `My answer is ${answer}. I used this rule: ${rule.rule}`];
  return [`My answer is ${answer}.`, `I got ${answer}.`];
}
export async function narrateResponse(profile: Profile, response: Response, concept: Concept) {
  const allowedUtterances = permittedNarration(response,concept);
  const text = await requestNarration({persona:profile.id,question:response.item.prompt,answer:response.answer,
    correct:Boolean(response.marks),allowedUtterances});
  return text && allowedUtterances.includes(text) ? text : null;
}
