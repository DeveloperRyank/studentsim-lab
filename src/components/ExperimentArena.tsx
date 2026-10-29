import { useMemo, useState } from "react";
import { PROFILES, getProfile, CONCEPT_LABELS } from "../lib/profiles";
import { QUESTIONS } from "../lib/questions";
import type { ConceptId } from "../lib/types";
import {
  STRATEGY_LABELS,
  runExperiment,
  type ExperimentRecord,
  type Strategy,
} from "../lib/experiment";
import { saveRecord } from "../lib/api";
import { experimentToCSV, toJSON, download } from "../lib/export";
import { fmtPct, fmtNum, SimDisclaimer } from "./ui";


export default function ExperimentArena({ onLogged }: { onLogged: () => void }) {
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [strategy, setStrategy] = useState<Strategy>("on_error_hint");
  const [repeats, setRepeats] = useState(3);
  const [scope, setScope] = useState<"all" | ConceptId>("all");
  const [exp, setExp] = useState<ExperimentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const pool = useMemo(
    () => (scope === "all" ? QUESTIONS : QUESTIONS.filter((q) => q.concepts.includes(scope as ConceptId))),
    [scope],
  );

  function run() {
    setBusy(true);
    // synchronous but yield so the loading state paints
    setTimeout(() => {
      const profile = getProfile(profileId);
      const result = runExperiment({
        profile,
        questionIds: pool.map((q) => q.id),
        strategy,
        repeats: Math.max(1, repeats),
        id: `exp-${Date.now().toString(36)}`,
      });
      setExp(result);
      saveRecord("experiments", result);
      onLogged();
      setBusy(false);
    }, 30);
  }

  const bm = exp?.baseline.metrics;
  const em = exp?.enhanced.metrics;

  return (
    <div>
      <div className="card">
        <div className="grid cols-3">
          <div>
            <label className="field">Learner profile</label>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field">Intervention strategy</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((s) => (
                <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Topic / repeat count</label>
            <div className="row">
              <select value={scope} onChange={(e) => setScope(e.target.value as "all" | ConceptId)} style={{ flex: 2 }}>
                <option value="all">All topics</option>
                {(Object.keys(CONCEPT_LABELS) as ConceptId[]).map((c) => (
                  <option key={c} value={c}>{CONCEPT_LABELS[c]}</option>
                ))}
              </select>
              <input
                type="number" min={1} max={10} value={repeats}
                onChange={(e) => setRepeats(Number(e.target.value))}
                style={{ width: 70 }} title="repeats (for consistency)"
              />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? "running…" : "Run both simulators"}
          </button>
          <span className="note">{pool.length} questions × {repeats} repeat(s)</span>
          <span className="spacer" />
          {exp && (
            <>
              <button className="btn btn-ghost" onClick={() => download(`${exp.id}.csv`, experimentToCSV(exp), "text/csv")}>Export CSV</button>
              <button className="btn btn-ghost" onClick={() => download(`${exp.id}.json`, toJSON(exp), "application/json")}>Export JSON</button>
            </>
          )}
        </div>
      </div>

      {exp && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Metrics — computed from recorded events</h3>
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Baseline</th>
                  <th>Enhanced</th>
                  <th>Meaning / limitation</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow name="Accuracy" b={fmtPct(bm?.accuracy)} e={fmtPct(em?.accuracy)}
                  note="Share of simulated answers matching the expected answer. Synthetic, not human accuracy." />
                <MetricRow name="Misconception reproduction" b={fmtPct(bm?.misconceptionReproductionRate)} e={fmtPct(em?.misconceptionReproductionRate)}
                  note="When wrong, how often the documented profile misconception actually fired." />
                <MetricRow name="Responsiveness to tutoring" b={signed(bm?.responsivenessToTutoring)} e={signed(em?.responsivenessToTutoring)}
                  note="Accuracy after an intervention minus accuracy without one. Baseline has no persistent state." />
                <MetricRow name="Avg attempts to correct / concept" b={fmtNum(bm?.avgAttemptsToCorrectPerConcept)} e={fmtNum(em?.avgAttemptsToCorrectPerConcept)}
                  note="Attempts before the first correct answer per concept." />
                <MetricRow name="Consistency across runs" b={fmtPct(bm?.consistencyAcrossRuns)} e={fmtPct(em?.consistencyAcrossRuns)}
                  note="Correct/incorrect agreement across repeated seeds. Needs ≥2 repeats." />
              </tbody>
            </table>
            <SimDisclaimer />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Question-by-question comparison</h3>
            <table>
              <thead>
                <tr>
                  <th>Question</th><th>Baseline</th><th>Enhanced</th>
                </tr>
              </thead>
              <tbody>
                {exp.comparison.map((r) => (
                  <tr key={r.questionId}>
                    <td>
                      <div>{r.prompt}</div>
                      <div className="note">{r.questionId}</div>
                    </td>
                    <td>
                      <span className={`badge ${r.baselineCorrect ? "correct" : "wrong"}`}>{r.baselineCorrect ? "✓" : "✗"}</span>
                      {r.baselineMisconception && <div className="note warn">{r.baselineMisconception}</div>}
                    </td>
                    <td>
                      <span className={`badge ${r.enhancedCorrect ? "correct" : "wrong"}`}>{r.enhancedCorrect ? "✓" : "✗"}</span>
                      {r.enhancedMisconception && <div className="note warn">{r.enhancedMisconception}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <div className="card">
              <h3>Baseline attempt log</h3>
              <AttemptList attempts={exp.baseline.attempts} />
            </div>
            <div className="card">
              <h3>Enhanced attempt log</h3>
              <AttemptList attempts={exp.enhanced.attempts} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricRow({ name, b, e, note }: { name: string; b: string; e: string; note: string }) {
  return (
    <tr>
      <td>{name}<div className="note">{note}</div></td>
      <td className="mono">{b}</td>
      <td className="mono" style={{ color: "var(--cyan)" }}>{e}</td>
      <td className="note" style={{ maxWidth: "32ch" }}>{note}</td>
    </tr>
  );
}

function signed(v?: number | null): string {
  if (v === null || v === undefined) return "Not evaluated";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)} pts`;
}

function AttemptList({ attempts }: { attempts: ExperimentRecord["baseline"]["attempts"] }) {
  return (
    <div>
      {attempts.map((a) => (
        <div key={a.sequence} className="list-row">
          <span className="mono note">#{a.sequence} {a.questionId}</span>
          <span className={`badge ${a.correct ? "correct" : "wrong"}`}>{a.studentAnswer}</span>
        </div>
      ))}
    </div>
  );
}
