import express from "express";
import cors from "cors";
import { store } from "./store.mjs";
import { llmStatus, narrateStudent } from "./llm.mjs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8787);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, llm: llmStatus() });
});

// ---- LLM narration (server-side key only) ----
app.post("/api/llm/narrate", async (req, res) => {
  const { persona, question, answer, correct, misconceptionLabel, observableExplanation } =
    req.body ?? {};
  if (!question || typeof answer !== "string") {
    return res.status(400).json({ ok: false, reason: "bad-request" });
  }
  const result = await narrateStudent({
    persona: persona || "a maths learner",
    question,
    answer,
    correct: Boolean(correct),
    misconceptionLabel,
    observableExplanation,
  });
  res.json(result);
});

// ---- Sessions ----
app.get("/api/sessions", (_req, res) => res.json(store.list("sessions")));
app.get("/api/sessions/:id", (req, res) => {
  const s = store.get("sessions", req.params.id);
  if (!s) return res.status(404).json({ error: "not-found" });
  res.json(s);
});
app.post("/api/sessions", (req, res) => {
  const s = req.body;
  if (!s?.id || !Array.isArray(s.attempts)) {
    return res.status(400).json({ error: "invalid-session" });
  }
  res.json(store.put("sessions", s));
});
app.delete("/api/sessions/:id", (req, res) => {
  store.remove("sessions", req.params.id);
  res.json({ ok: true });
});

// ---- Experiments ----
app.get("/api/experiments", (_req, res) => res.json(store.list("experiments")));
app.post("/api/experiments", (req, res) => {
  const e = req.body;
  if (!e?.id) return res.status(400).json({ error: "invalid-experiment" });
  res.json(store.put("experiments", e));
});

// ---- Scenario evaluation runs ----
app.get("/api/scenario-runs", (_req, res) => res.json(store.list("scenarioRuns")));
app.post("/api/scenario-runs", (req, res) => {
  const r = req.body;
  if (!r?.id) return res.status(400).json({ error: "invalid-run" });
  res.json(store.put("scenarioRuns", r));
});

app.listen(PORT, () => {
  console.log(`[StudentSim API] http://localhost:${PORT}  |  LLM: ${llmStatus().configured ? "configured" : "fallback (no key)"}`);
});
