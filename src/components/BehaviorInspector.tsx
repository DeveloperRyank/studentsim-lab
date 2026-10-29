import { useMemo, useState } from "react";
import type { Session } from "../lib/types";
import { getProfile, CONCEPT_LABELS } from "../lib/profiles";
import { detectAnomalies, anomalyLabel } from "../lib/evaluation";
import { MISCONCEPTIONS } from "../lib/misconceptions";
import { SkillTimeline, SimDisclaimer } from "./ui";

export default function BehaviorInspector({ sessions }: { sessions: Session[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(sessions[0]?.id ?? null);
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;

  const anomalies = useMemo(() => {
    if (!selected) return [];
    try {
      return detectAnomalies(selected.attempts, getProfile(selected.learnerId));
    } catch {
      return [];
    }
  }, [selected]);

  if (!selected) {
    return (
      <div className="card">
        <h3>No sessions recorded yet</h3>
        <p className="note">Run a tutoring session in the Student Simulator and it will be saved here for inspection.</p>
      </div>
    );
  }

  const profile = getProfile(selected.learnerId);

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <label className="field">Saved session</label>
            <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)} style={{ minWidth: 320 }}>
              {sessions.map((s) => {
                const p = safeName(s.learnerId);
                return (
                  <option key={s.id} value={s.id}>
                    {new Date(s.createdAt).toLocaleString()} · {p} · {s.simulator} · {s.attempts.length} attempts{s.usedLlm ? " · LLM" : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="metric-grid" style={{ minWidth: 160 }}>
            <div className="metric"><div className="val base">{selected.attempts.length}</div><div className="name">attempts</div></div>
          </div>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="card" style={{ marginTop: 16, borderColor: "var(--amber-soft)" }}>
          <h3 style={{ color: "var(--amber)" }}>Unexpected behaviour ({anomalies.length})</h3>
          {anomalies.map((a, i) => (
            <div key={i} className="list-row">
              <div>
                <span className="badge warn">{anomalyLabel(a.kind)}</span>
                <div className="note" style={{ marginTop: 4 }}>{a.message}</div>
              </div>
              <span className="mono note">#{a.sequences.join(", #")}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Skill timeline</h3>
          <SkillTimeline attempts={selected.attempts} />
          <div className="sub" style={{ marginTop: 12 }}>Learner: <b>{profile.name}</b> — {profile.description}</div>
          <SimDisclaimer />
        </div>
        <div className="card">
          <h3>Documented misconceptions</h3>
          {profile.misconceptions.map((m) => (
            <div key={m.id} className="list-row">
              <div>{MISCONCEPTIONS[m.id].label}<div className="note">{MISCONCEPTIONS[m.id].description}</div></div>
              <span className="mono note">sev {m.severity}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Full attempt history</h3>
        <table>
          <thead>
            <tr>
              <th className="mono">#</th><th>Q</th><th>Concept</th><th>Expected</th><th>Student</th>
              <th>✓/✗</th><th>Misconception</th><th>Intervention</th><th className="mono">skill est</th>
            </tr>
          </thead>
          <tbody>
            {selected.attempts.map((a) => {
              const skill = avg(a.skillSnapshot);
              return (
                <tr key={a.sequence}>
                  <td className="mono">{a.sequence}</td>
                  <td>{a.questionId}</td>
                  <td>{CONCEPT_LABELS[a.concept]}</td>
                  <td className="mono">{a.expectedAnswer}</td>
                  <td className="mono">{a.studentAnswer}</td>
                  <td><span className={`badge ${a.correct ? "correct" : "wrong"}`}>{a.correct ? "✓" : "✗"}</span></td>
                  <td>{a.misconceptionId ? MISCONCEPTIONS[a.misconceptionId].label : "—"}</td>
                  <td>{a.priorIntervention?.kind ?? "—"}</td>
                  <td className="mono">{skill == null ? "—" : `${(skill * 100).toFixed(0)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function safeName(id: string): string {
  try { return getProfile(id).name; } catch { return id; }
}
function avg(obj: Record<string, number | undefined>): number | null {
  const vals = Object.values(obj).filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
