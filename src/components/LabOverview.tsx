import type { ExperimentRecord } from "../lib/experiment";
import type { Session } from "../lib/types";
import { PROFILES } from "../lib/profiles";
import { MISCONCEPTIONS } from "../lib/misconceptions";

export default function LabOverview({
  sessions,
  experiments,
  llm,
  onNavigate,
}: {
  sessions: Session[];
  experiments: ExperimentRecord[];
  llm: { configured: boolean; model: string | null };
  onNavigate: (page: string) => void;
}) {
  const recent = [...experiments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  return (
    <div>
      <div className="card" style={{ borderLeft: "3px solid var(--cyan)" }}>
        <h2 style={{ margin: "0 0 6px" }}>Simulate how learners answer, err, and respond to tutoring</h2>
        <p className="sub" style={{ maxWidth: "80ch" }}>
          StudentSim Lab runs <b>structured learner profiles</b> through a maths question bank and explicit
          knowledge-state rules. Each profile has initial skill estimates, documented misconceptions, difficulty
          sensitivity and response variability. The rules engine — not a language model — decides correctness and
          which misconception fires; an optional LLM only voices the answer in natural language. Knowledge-state
          changes are <b>simulated estimates</b>, never measured learning, and never a claim about a real student.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <span className={`pill ${llm.configured ? "ok" : "off"}`}><span className="dot" />{llm.configured ? `LLM narration: ${llm.model}` : "LLM: deterministic fallback (no key)"}</span>
          <span className="pill">{sessions.length} sessions</span>
          <span className="pill">{experiments.length} experiments</span>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => onNavigate("simulator")}>Start a session →</button>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 16 }}>
        {PROFILES.map((p) => (
          <div className="card" key={p.id}>
            <h3>{p.name}</h3>
            <p className="note">{p.description}</p>
            <label className="field">Initial skill estimates</label>
            {Object.entries(p.initialSkills).map(([c, v]) => (
              <SkillBar key={c} concept={c.replace(/_/g, " ")} value={v as number} />
            ))}
            <label className="field">Key misconceptions</label>
            <div className="row">
              {p.misconceptions.map((m) => (
                <span key={m.id} className="pill" title={MISCONCEPTIONS[m.id].description}>{MISCONCEPTIONS[m.id].label} · {m.severity}</span>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="note">difficulty sensitivity {p.difficultySensitivity} · variability {p.variability}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Recent experiments</h3>
        {recent.length === 0 && <p className="note">None yet — run a baseline-vs-enhanced comparison in the Experiment Arena.</p>}
        {recent.map((e) => (
          <div className="list-row" key={e.id}>
            <div>
              <b>{e.learnerName}</b> <span className="note">· {e.strategy} · {e.questionIds.length} questions · {e.repeats}×</span>
            </div>
            <div className="row">
              <span className="mono note">base acc {(e.baseline.metrics.accuracy ?? 0) * 100 | 0}%</span>
              <span className="mono note" style={{ color: "var(--cyan)" }}>enh acc {(e.enhanced.metrics.accuracy ?? 0) * 100 | 0}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Relationship to microsoft/StudentSim</h3>
        <p className="sub">
          The original StudentSim fine-tunes per-user models on real classroom logs (via Azure OpenAI) and optimises
          hints with reinforcement learning against frozen student environments. This prototype does <b>not</b>
          reproduce that training methodology. It is a simplified, transparent baseline: hand-authored profiles, an
          explicit rule-based knowledge-state engine, and an optional LLM for phrasing only.
        </p>
      </div>
    </div>
  );
}

function SkillBar({ concept, value }: { concept: string; value: number }) {
  return (
    <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span className="note" style={{ width: 150, textTransform: "capitalize" }}>{concept}</span>
      <div style={{ flex: 1, height: 8, background: "var(--bg-elev-2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${value * 100}%`, height: "100%", background: "var(--teal)" }} />
      </div>
      <span className="mono note">{(value * 100).toFixed(0)}</span>
    </div>
  );
}
