import { useMemo, useState } from "react";
import { PROFILES } from "../lib/profiles";
import { SCENARIOS } from "../lib/scenarios";
import { runAllScenarios, type EvaluationSummary } from "../lib/evaluation";
import { toJSON, download } from "../lib/export";
import { Metric, fmtPct, SimDisclaimer } from "./ui";

export default function Evaluation() {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const profileMap = useMemo(() => {
    const m: Record<string, (typeof PROFILES)[number]> = {};
    PROFILES.forEach((p) => (m[p.id] = p));
    return m;
  }, []);

  function run() {
    setBusy(true);
    setTimeout(() => {
      setSummary(runAllScenarios(profileMap));
      setBusy(false);
    }, 30);
  }

  return (
    <div>
      <div className="card">
        <h3>Scenario-based evaluation</h3>
        <p className="sub">
          A small set of manually authored scenarios encode what each <i>profile</i> says should happen.
          Both simulators are run against them and their outputs are compared step by step.
          These are synthetic ground-truth labels — passing them is <b>not</b> evidence the system predicts real students.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "running…" : `Run ${SCENARIOS.length} scenarios`}</button>
          <span className="spacer" />
          {summary && (
            <button className="btn btn-ghost" onClick={() => download("evaluation.json", toJSON(summary), "application/json")}>Export JSON</button>
          )}
        </div>
      </div>

      {summary && (
        <>
          <div className="metric-grid" style={{ marginTop: 16 }}>
            <Metric name="Baseline step pass rate" value={fmtPct(summary.baselinePassRate)} variant="base" hint="Mean per-scenario pass fraction." />
            <Metric name="Enhanced step pass rate" value={fmtPct(summary.enhancedPassRate)} variant="enh" hint="Mean per-scenario pass fraction." />
            <Metric name="Scenario runs" value={String(summary.results.length)} />
            <Metric name="Failed runs" value={String(summary.failures.length)} variant={summary.failures.length ? "ne" : undefined} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Individual cases (inspect, not just scores)</h3>
            {summary.results.map((r) => {
              const open = openId === r.scenarioId + r.simulator;
              return (
                <div key={r.scenarioId + r.simulator} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                  <div className="list-row" style={{ cursor: "pointer" }} onClick={() => setOpenId(open ? null : r.scenarioId + r.simulator)}>
                    <div>
                      <b>{r.title}</b>{" "}
                      <span className={`badge ${r.simulator === "enhanced" ? "sim" : ""}`}>{r.simulator}</span>
                    </div>
                    <div className="row">
                      <span className={`badge ${r.pass ? "correct" : "wrong"}`}>{fmtPct(r.passRate)}</span>
                      <span className="note">{open ? "▾" : "▸"}</span>
                    </div>
                  </div>
                  {open && (
                    <table style={{ marginBottom: 12 }}>
                      <thead>
                        <tr><th>Step</th><th>Expected</th><th>Student answer</th><th>Fired</th><th>Pass</th><th className="mono">note</th></tr>
                      </thead>
                      <tbody>
                        {r.steps.map((s, i) => (
                          <tr key={i}>
                            <td>{s.step.questionId}{s.step.intervention ? ` (${s.step.intervention})` : ""}</td>
                            <td>{s.step.expected}{s.step.expectedMisconception ? ` / ${s.step.expectedMisconception}` : ""}</td>
                            <td className="mono">{s.studentAnswer}</td>
                            <td>{s.firedMisconception ?? "—"}</td>
                            <td><span className={`badge ${s.pass ? "correct" : "wrong"}`}>{s.pass ? "✓" : "✗"}</span></td>
                            <td className="note">{s.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
            <SimDisclaimer />
          </div>

          <div className="card" style={{ marginTop: 16, borderColor: "var(--amber-soft)" }}>
            <h3 style={{ color: "var(--amber)" }}>Incorrect predictions &amp; inconsistency</h3>
            {summary.failures.length === 0 && <p className="note">No scenario failures for this run.</p>}
            {summary.failures.map((f) => (
              <div key={f.scenario.scenarioId + f.scenario.simulator} className="list-row">
                <div>
                  <b>{f.scenario.title}</b> <span className="note">· {f.scenario.simulator}</span>
                  <div className="note warn">
                    {f.scenario.steps.filter((s) => !s.pass).map((s) => s.note).join(" · ")}
                  </div>
                </div>
                <span className="mono note">{f.failedSteps} failed</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
