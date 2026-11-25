# StudentSim Lab

## StudentSim 2.0 cognitive simulation

Run `npm ci` and `npm run dev`, then open `http://localhost:5173`. Run `npm test` for the algebra and calculus suites and `npm run build` to type-check and bundle the app. The older algebra labs remain in the sidebar. The calculus labs run in the browser. The Express API supplies optional narration and the original lab's record storage.

This application is a research-informed computational prototype of student learning. Its predictions depend on model assumptions and have not been validated as predictions of individual human learning outcomes.

### Teaching recommendation

The default view asks for two descriptions of the learner's current knowledge. The code maps these to initial concept mastery and uses the same documented model defaults for attention, memory, and learning across profiles. The guided simulation uses a seven-day initial calculus half-life and a forgetting sensitivity of one. No cognitive settings are required from the user.

The five methods initially get 60 simulated hours each within the same 30-day horizon. If none reaches the benchmark, the simulator runs a 120-hour course on new matched seeds within that horizon and reports both stages. These are modeled course budgets. For each method, 32 independently seeded clones study the calculus curriculum and sit an unseen, 37-question exam with the same item generation and scoring across methods. The method with the highest mean score is recommended only if its mean reaches 60%. This illustrative benchmark is applied to the simulation and is not a validated cutoff for learners. **Open research tools** exposes the separate configurable lab.

### The Forgetful Calculus Student

1. Open **Cognitive Simulation → Cognitive Lab** to inspect the default profile. Algebra and exponents start at 64% and 61% modeled mastery. All calculus targets start at zero. The newly learned calculus half-life parameter is two simulated days.
2. In **Teaching Arena**, choose Power rule and apply several direct explanations or worked examples. Inspect missed attention and encoding as well as successful events. In **Time Chamber**, advance two days and review the concept. A review can fail or restore accessibility, depending on that student's state and the seed.
3. In **Multiverse Lab**, select **Run Forgetful Student demo**. The demo uses the saved source defaults of five policies, 24 matched trials per policy, 30 days, 600 minutes, and seed 2026. It also searches 24 policies with eight search trials each and compares the selected policy and baselines on 24 held-out seeds. Replay the first trial of any branch. Replay records show the state changes that occurred in that branch.
4. Open **Strategy Optimizer** for the held-out comparison and representative schedule. Use **Experiment Results** for distributions, concept-level comparisons, forgetting curves, sensitivity sweeps and JSON/CSV exports. Try sweeping `halfLife` over 0.75, 2 and 7 days. Ranking changes describe sensitivity to assumptions.

### Architecture

| Layer | Implementation |
|---|---|
| Cognitive simulation | `src/cognition/engine.ts` holds state, attention, temporary buffer, encoding, acquisition, consolidation, forgetting, retrieval and misconception updates. |
| Subject definition | `calculus.ts` defines 15 knowledge components with explicit prerequisite edges and executable item templates. A subject supplies concepts and item generators through the same interface. |
| Teaching interventions | `engine.ts` applies eleven interventions through the same attention and encoding path. Each has an assumed complexity and learning multiplier, with settings for practice and feedback. |
| Experiment scheduling | `policy.ts` offers five baselines plus random policy generation. It receives curriculum metadata and observed answers or error patterns inferred from the practice items. `experiment.ts` advances simulated time and independently clones state. |
| Assessment and optimization | `assessment.ts` uses a configurable blueprint with its own question generators and random stream. `experiment.ts` computes Monte Carlo statistics, sensitivity and held-out optimizer evaluation. |
| Interactive lab | `CognitiveLab.tsx` integrates the seven labs into the existing React app. `worker.ts` keeps numerical experiments off the UI thread. The most recent results of each experiment type and one saved profile use browser storage. JSON exports include configurations, seeds, per-trial scores and one detailed trace per policy. CSV gives one row per score or sensitivity ranking. |

### Equations and assumptions

- **Attention and working memory.** The attention draw uses baseline attention × duration scale × complexity scale × overload scale. The duration scale is `attentionDuration / (attentionDuration + eventMinutes)`. The other scales are `1 − attentionComplexity × interventionComplexity` and `1 − loadPenalty × overload`. Overload is the excess of occupied plus incoming units above capacity, divided by capacity and clamped to [0, 1]. An event demands `1 + interventionComplexity + conceptDifficulty` units. The buffer takes available capacity and expires after `bufferMinutes`. These are hypothetical computational proxies motivated by cognitive-load research.
- **Readiness and encoding.** For a concept with prerequisites, readiness is `readinessFloor + (1 − readinessFloor) × mean(prerequisite mastery × accessibility)`. Missing prerequisites contribute zero and foundation concepts use 1. An attended event can encode with probability `encoding × readiness × (1 − clamp(conceptDifficulty + loadPenalty × overload))`. The readiness floor avoids an unintended hard gate. These formulas and coefficients are model assumptions.
- **Acquisition.** Successful encoding applies `M′ = M + (1 − M)L`, with `L = clamp(learning × readiness × interventionLearning × overloadScale)`. This is inspired by the learning transition in BKT. Mastery is a continuous estimate and the simulator does not perform the classical BKT posterior update from correctness. Successful independent retrieval can consolidate memory without changing mastery.
- **Accessibility and consolidation.** For a concept with positive mastery, accessibility is `2^(−elapsedDays × forgetting / halfLife)` from the latest successful encoding or independent retrieval. Unlearned concepts have zero accessibility. Reading accessibility never writes decay into the state. Successful encoding or independent retrieval can strengthen the half-life by `h′ = min(maxHalfLife, h(1 + αq))` and refresh the timestamp. Instruction quality is its effective learning rate; retrieval quality is the accessibility just before recall. Immediate recall, delayed recall, transfer and instruction have distinct configurable multipliers. Each subject supplies a stability multiplier; the five calculus prerequisites start at 25 times the profile half-life. Exponential accessibility is inspired by Half-Life Regression; the strengthening rule and parameters are illustrative.
- **Response and transfer.** The simulator samples slip, misconception activation, prerequisite readiness, retrieval and solving in order. Retrieval uses `mastery × accessibility × retrieval ability`. Solving uses `(1 − itemDifficulty) × overloadScale × transfer scale`. Transfer scale is 1 for recall and procedural questions, `transfer × related readiness` for near transfer and `transfer² × related readiness` for far transfer. Guessing applies if the prerequisite, retrieval, or solving check fails without a slip or misconception. It models a correct guess probability; other guesses are recorded as unsure. Authored error rules produce consistent mathematical answers and can override available correct knowledge.
- **Misconceptions.** Failed attended learning can activate a rule with probability `susceptibility × (1 − mastery)` and add `(1 − strength) × formationGain`. Feedback targeting an eligible rule succeeds with probability `correctionChance × (1 − resistance) × readiness` and reduces strength by the factor `1 − correctionGain`. Correct answers alone do not delete the rule. Strength is a proxy for activation probability, with shared student-level resistance.
- **Scheduling and evaluation.** Policies use ten-minute intervention blocks with a shortened final block when necessary. They spend identical budgets in the baseline comparison, with policy-specific spacing inside a common horizon. The immediate exam starts after a policy's last intervention; the delayed exam occurs at the configured horizon plus any extra delay. Both use fresh copies of the same pre-exam state, the same item seed and independent item and response random streams. Practice and exam generators use disjoint parameter ranges. The assessment is standardized within the experiment; it has not been calibrated on students. Scoring uses exact canonical outputs of the executable templates. The app has no open-ended symbolic answer parser.
- **Statistics and search.** Retention is mean mastery × accessibility across concepts. Misconception persistence is mean strength across authored rules, including inactive rules. Efficiency is mastery gain per teaching minute. Reported 95% intervals are normal approximations for the delayed score mean over 20 or more trials. They do not quantify measurement or parameter uncertainty. Uniform random search varies concept order, spacing and activity mix. The least-time objective samples budgets and prefers the smallest sampled budget meeting the target in search; the UI reports whether that target also held on the evaluation seeds. Search results only compare the sampled policies within this model.

### Scope and research foundations

Teaching is structured around authored problems and intervention settings. Tutor notes are recorded as text; they do not change the numerical model. Optional narration uses the existing API and accepts only a permitted rendering of the sampled answer or activated rule. This constrained narration is brief and may be unavailable. Numerical experiments never call the LLM. The knowledge graph is shown as a prerequisite list with linked detail, and branches replay their first trial. Browser storage keeps the last result in each category; use exports for archival or sharing.

- Corbett and Anderson (1994), *Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge*, motivates the acquisition transition.
- Settles and Meeder (2016), *A Trainable Spaced Repetition Model for Language Learning*, motivates exponential accessibility. This project does not fit half-lives to observations.
- Koedinger et al. (2023), *An Astonishing Regularity in Student Learning Rate*, motivates making learning rates explicit and testing sensitivity.
- Cepeda et al. (2006), *Distributed Practice in Verbal Recall Tasks*, and Roediger and Karpicke (2006), *Test-Enhanced Learning*, motivate the spacing and retrieval interventions. They do not establish the implemented effect sizes.
- Sweller (1988), *Cognitive Load During Problem Solving*, motivates load as a factor. Conceptual-change research motivates retaining incorrect rules after a correct response.


## Original algebra lab

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
frontend. With no key, `/api/llm/narrate` returns `{ok:false}`. The UI displays that dialogue is unavailable and continues to show numerical responses.

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
state machine; a separate numerical engine that runs without an LLM; and anomaly detection aimed at
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
