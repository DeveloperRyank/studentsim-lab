# StudentSim Lab

An interactive **AI student-simulation research lab** for secondary-school mathematics.
It simulates how different learners answer questions, make characteristic mistakes, and
respond to tutoring interventions — with an explicit, inspectable knowledge-state model.

> Inspired by Microsoft's open-source [`microsoft/StudentSim`](https://github.com/microsoft/StudentSim).
> This is a **simplified, transparent baseline**, **not** a reproduction of the original's
> training methodology (see [Relationship to the original](#relationship-to-the-original)).

---

## Quick start

```bash
npm install
npm run dev          # web on http://localhost:5173 (falls to next free port), API on :8787
```

Open the printed `Local:` URL. **The app works immediately with no API key** — it runs on the
deterministic rule-based simulator.

Optional LLM narration (natural-language student voice):

```bash
cp .env.example .env
# fill LLM_API_KEY / LLM_BASE_URL / LLM_MODEL  (any OpenAI-compatible endpoint)
```

The key is read **only** by the Express server (`server/llm.mjs`) and is never bundled into the
frontend. With no key, `/api/llm/narrate` returns `{ok:false}` and the UI uses template narration.

Other scripts:

```bash
npm run build        # type-check + production bundle (dist/)
npm start            # run the API server only (serves nothing else in dev; use `build` + a static host)
npm test             # Vitest: simulation rules, state updates, metrics
```

---

## The five views

1. **Lab Overview** — what the simulator does, the three learner profiles, recent experiments, and an
   honest note on the relationship to the original repo.
2. **Student Simulator** — an interactive tutoring session. Pick a learner, topic and simulator kind;
   present questions one at a time; attach a tutoring intervention; get the student's response; watch
   the skill timeline and attempt history update.
3. **Experiment Arena** — run **baseline vs enhanced** on the same question set and intervention strategy,
   with metrics computed from recorded events, a question-by-question comparison, and CSV/JSON export.
4. **Behavior Inspector** — review any saved session's full attempt history and surface
   profile-contradicting behaviour (anomaly detection).
5. **Evaluation** — run manually authored scenarios against both simulators, inspect individual
   failures, and export results.

---

## Architecture

```
src/lib/            ← simulation logic, no React, fully unit-tested
  types.ts          domain model (profiles, questions, attempts, state)
  profiles.ts       3 learner profiles + concept labels
  questions.ts      question bank + answer normalisation / checking
  misconceptions.ts documented misconception catalogue
  rng.ts            seeded PRNG (mulberry32) → reproducible runs
  engine.ts         the knowledge-state rules engine (DEFAULT_CONFIG is the tunable rule set)
  interventions.ts  builds the 4 tutoring interventions per learner+question
  session.ts        orchestrates a run: attempt → state update → narration
  experiment.ts     baseline-vs-enhanced runner with strategies + repeats
  metrics.ts        every displayed metric, computed from AttemptRecords
  evaluation.ts     scenario harness + anomaly detection
  export.ts         CSV/JSON serialisation
  api.ts            client → Express API, with a localStorage fallback

server/
  index.mjs         Express micro-server: /api/health, /api/llm/narrate, sessions, experiments
  llm.mjs           provider-agnostic OpenAI-compatible adapter (server-side key only)
  store.mjs         JSON-file persistence (server/data/db.json)

src/components/     the five pages + small UI helpers (SkillTimeline, Metric, …)
```

**Separation of concerns:** the rules engine owns every decision. The LLM is used *only* to phrase a
student's answer in first person after the outcome is already decided — it cannot alter mastery.

### The learner model

A profile carries: initial skill estimates per concept (0–1), a set of misconceptions with severity,
error patterns, **difficulty sensitivity**, and **response variability**.

`engine.simulateAttempt` computes, for a question:

```
baseSkill  = mean skill over the question's concepts
p(correct) = clamp(baseSkill − difficultySensitivity·(difficulty−1)/4·weight + variabilityNoise)
```

On a failure it fires one of the learner's misconceptions that the question maps to, weighted by
`severity × (1 − concept-scoped correctionBoost)`. The wrong answer and its concise,
*observable* explanation come from the question's authored `misconceptionResponses`
(no hidden chain-of-thought is produced).

### Explicit, configurable state-update rules (`DEFAULT_CONFIG`)

- Correct answers nudge skill toward 1 via EWMA (`learningRate`); errors pull it down more weakly.
- A **targeted hint** raises a `correctionBoost` for **that one misconception**, and only suppresses
  it on questions whose concepts **overlap** — an unrelated concept gets no free benefit.
- A **direct explanation** gives a small, capped skill nudge; it **does not** mark the learner as having
  mastered the concept (see the test *"does NOT mark a learner as having learned a concept after a single explanation"*).
- A **socratic prompt** helps proportionally to existing foundational skill (weak learners gain little).
- Boosts **decay** each turn.

All state changes are labelled **simulated estimates**, never measured learning.

---

## Relationship to the original

| microsoft/StudentSim (real) | StudentSim Lab (this prototype) |
|---|---|
| Per-user models **fine-tuned** on real classroom logs via Azure OpenAI | Hand-authored profiles + rule-based state engine |
| **RL** optimises hints against frozen student environments | Fixed, inspectable, tunable intervention rules (`DEFAULT_CONFIG`) |
| Holdout evals against real human data | Scenario evals against **synthetic** ground truth |
| Chess / L2-essay / algebra corpora | Small algebra question bank |
| LLM = the learner | LLM = narration only; **rules** = the learner |

**Ideas we borrow:** the notion of a personalized behavioral learner proxy, "responsiveness to tutoring"
as a first-class property, and side-by-side baseline-vs-enhanced benchmarking.

**Our original simplifications:** structured skill estimates + misconception tracking as an explicit
state machine; a deterministic fallback so the app runs without any model; and anomaly detection aimed at
profile-contradicting behaviour.

---

## Evaluation methodology & limitations

- **Metrics** (accuracy, misconception reproduction rate, responsiveness to tutoring, avg attempts to
  correct per concept, consistency across runs) are computed from recorded `AttemptRecord` events — never
  hardcoded. If a metric can't be computed (e.g. consistency with <2 repeats) it shows **"Not evaluated"**.
- **Scenarios** (`src/lib/scenarios.ts`) are manually authored expectations of what each *profile* should do.
- **Anomaly detection** (`src/lib/evaluation.ts`) flags: sudden over-performance at low skill, a
  misconception persisting after a targeted hint, a "flat" profile that ignores its documented variety, and
  improve-then-fail on a closely related question.

**Limitations — stated plainly:**
- Passing synthetic scenarios is **not** evidence the system predicts **real** students.
- Profiles, question difficulty values and misconception answers are hand-authored priors, not fit from data.
- "Responsiveness" measures internal model behaviour under our rules, not validated human learning.
- The Enhanced simulator is deliberately more responsive to tutoring than the Baseline; that difference is a
  property of the design, not an empirical finding.

---

## Extension points for future research

1. **Replace the answer model.** `engine.simulateAttempt` is the single seam — swap the rule for a fine-tuned
   or retrieval model while keeping the same `AttemptRecord` contract.
2. **Real knowledge-tracing.** Point `updateStateAfterAttempt` at BKT/DKT-style updates; the rest of the app is agnostic.
3. **More datasets.** Add a domain by supplying `Question[]` + `Misconception` + `LearnerProfile` arrays (chess, L2 writing…).
4. **Per-user profiles from data.** Fit `initialSkills`/`misconceptions` from logs to move toward StudentSim's per-user idea.
5. **Tutoring policy.** The Experiment Arena already runs an intervention `Strategy`; a learned policy could replace the fixed heuristics.
6. **Human study harness.** The scenario/eval structure is a template for comparing simulations against recorded human sessions.

---

## Tests

```bash
npm test
```

Covers reproducibility, misconception firing fidelity, skill bounds, concept-scoped hint boosts,
the "explanation ≠ mastery" invariant, and every metric's calculation.
