import "dotenv/config";

// Provider-agnostic OpenAI-compatible chat adapter.
// The API key lives ONLY here (server side, from process.env). It is never
// shipped to the frontend. If no key is configured the caller falls back to
// deterministic templates and the app still fully works.

const apiKey = process.env.LLM_API_KEY?.trim();
const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const model = process.env.LLM_MODEL || "gpt-4o-mini";

export function llmStatus() {
  return {
    configured: Boolean(apiKey),
    baseUrl,
    model: apiKey ? model : null,
  };
}

/**
 * Ask the model to voice a *already-decided* student response in natural
 * first-person language. The rules engine has already chosen correctness, the
 * answer and the misconception — the LLM must NOT alter mastery.
 */
export async function narrateStudent(input) {
  if (!apiKey) return { ok: false, reason: "not-configured" };

  const system = [
    "You role-play a simulated secondary-school maths learner for a research prototype.",
    "You are given the DECIDED outcome (correct or a specific misconception) and the",
    "learner's answer. Voice it as 1-2 short first-person sentences in the learner's",
    "own words. Do NOT change whether the answer is right or wrong, do NOT reveal the",
    "correct solution if the learner is wrong, and do NOT output hidden chain-of-thought.",
    `Learner persona: ${input.persona}`,
  ].join(" ");

  const user = JSON.stringify({
    question: input.question,
    answerGiven: input.answer,
    outcome: input.correct ? "correct" : "incorrect",
    misconception: input.misconceptionLabel ?? null,
    observableReason: input.observableExplanation,
  });

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: 120,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `http-${res.status}`, detail: await res.text() };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, reason: "empty-response" };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, reason: "network-error", detail: String(err) };
  }
}
