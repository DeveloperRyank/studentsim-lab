import { useEffect, useMemo, useRef, useState } from "react";
import type { AttemptRecord, ConceptId, InterventionKind, SimulatorKind } from "../lib/types";
import { PROFILES, getProfile, CONCEPT_LABELS } from "../lib/profiles";
import { QUESTIONS } from "../lib/questions";
import { createRun, runAttempt, narrateAttempt, toSession, type Run } from "../lib/session";
import { buildInterventions, INTERVENTION_LABELS } from "../lib/interventions";
import { MISCONCEPTIONS } from "../lib/misconceptions";
import { saveRecord } from "../lib/api";
import { SkillTimeline, SimDisclaimer } from "./ui";

type Scope = "all" | ConceptId;

export default function StudentSimulator({ onLogged }: { onLogged: () => void }) {
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [simulator, setSimulator] = useState<SimulatorKind>("enhanced");
  const [scope, setScope] = useState<Scope>("all");
  const [runKey, setRunKey] = useState(0);

  const profile = getProfile(profileId);
  const pool = useMemo(
    () => (scope === "all" ? QUESTIONS : QUESTIONS.filter((q) => q.concepts.includes(scope as ConceptId))),
    [scope],
  );

  const runRef = useRef<Run>(createRun(profile, simulator, makeId()));
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [intervention, setIntervention] = useState<InterventionKind | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<AttemptRecord | null>(null);

  // Rebuild the run when key settings change.
  useEffect(() => {
    runRef.current = createRun(getProfile(profileId), simulator, makeId());
    setAttempts([]);
    setQIndex(0);
    setIntervention(null);
    setSpoken(null);
    setLastAttempt(null);
  }, [profileId, simulator, runKey]);

  const question = pool[qIndex % pool.length];
  const ivs = buildInterventions(profile, question, runRef.current.state);

  function reset() {
    setRunKey((k) => k + 1);
  }

  async function answer() {
    setBusy(true);
    setSpoken(null);
    const run = runRef.current;
    const iv = intervention ? ivs[intervention] : null;
    const attempt = runAttempt(run, question, iv);
    setAttempts([...run.attempts]);
    setLastAttempt(attempt);
    try {
      const text = await narrateAttempt(run, attempt, question);
      setSpoken(text);
    } finally {
      setBusy(false);
    }
    await saveRecord("sessions", toSession(run));
    onLogged();
  }

  function nextQuestion() {
    setIntervention(null);
    setSpoken(null);
    setLastAttempt(null);
    setQIndex((i) => i + 1);
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>Session setup</h3>
        <label className="field">Simulated learner</label>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {PROFILES.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <label className="field">Simulator</label>
        <select value={simulator} onChange={(e) => setSimulator(e.target.value as SimulatorKind)}>
          <option value="enhanced">Enhanced (persistent skill + misconception state)</option>
          <option value="baseline">Baseline (static profile + history only)</option>
        </select>
        <label className="field">Question topic</label>
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          <option value="all">All topics</option>
          {(Object.keys(CONCEPT_LABELS) as ConceptId[]).map((c) => (
            <option key={c} value={c}>{CONCEPT_LABELS[c]}</option>
          ))}
        </select>
        <div style={{ marginTop: 12 }}>
          <div className="sub">{profile.description}</div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={reset}>Reset session</button>
          <span className="spacer" />
          <span className="note">{attempts.length} attempt(s)</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <h3>Simulated skill timeline</h3>
          <SkillTimeline attempts={attempts} />
        </div>
        <SimDisclaimer />
      </div>

      <div>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Question {question.id}</h3>
            <span className="badge sim">difficulty {question.difficulty}/5</span>
          </div>
          <div className="question-box" style={{ marginTop: 12 }}>{question.prompt}</div>

          <label className="field">Tutoring intervention (optional, applied before the answer)</label>
          <div className="intervene-grid">
            {(Object.keys(ivs) as InterventionKind[]).map((k) => (
              <div
                key={k}
                className={`intervene-opt card ${intervention === k ? "selected" : ""}`}
                style={{ padding: "10px 12px" }}
                onClick={() => setIntervention(intervention === k ? null : k)}
              >
                <div className="k">{INTERVENTION_LABELS[k]}</div>
                <div className="t">{ivs[k].text}</div>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={answer} disabled={busy}>
              {busy ? <span className="skeleton">simulating…</span> : "Get student response"}
            </button>
            <button className="btn btn-ghost" onClick={nextQuestion}>Next question →</button>
          </div>

          {lastAttempt && (
            <div style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className={`badge ${lastAttempt.correct ? "correct" : "wrong"}`}>
                  {lastAttempt.correct ? "correct" : "incorrect"}
                </span>
                <span className="answer-line">answer: {lastAttempt.studentAnswer}</span>
              </div>
              <div className="note" style={{ marginTop: 6 }}>expected: {lastAttempt.expectedAnswer}</div>
              {lastAttempt.misconceptionId && (
                <div className="note warn" style={{ marginTop: 6 }}>
                  misconception: <b>{MISCONCEPTIONS[lastAttempt.misconceptionId].label}</b> — {lastAttempt.observableExplanation}
                </div>
              )}
              {!lastAttempt.misconceptionId && (
                <div className="note" style={{ marginTop: 6 }}>{lastAttempt.observableExplanation}</div>
              )}
              {busy && !spoken && <div className="skeleton" style={{ marginTop: 8 }}>writing response…</div>}
              {spoken && <div className="spoken">“{spoken}”</div>}
              <div className="row" style={{ marginTop: 10 }}>
                <span className="pill off">skill est: {fmtSkill(lastAttempt)}</span>
                {lastAttempt.priorIntervention && (
                  <span className="pill ok">after: {INTERVENTION_LABELS[lastAttempt.priorIntervention.kind]}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>Attempt history</h3>
          {!attempts.length && <div className="note">No attempts yet — present a question and get a response.</div>}
          {[...attempts].reverse().map((a) => (
            <div key={a.sequence} className={`history-item ${a.correct ? "correct" : "wrong"}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="mono note">#{a.sequence} · {a.questionId}</span>
                <span className={`badge ${a.correct ? "correct" : "wrong"}`}>{a.correct ? "✓" : "✗"}</span>
              </div>
              <div className="answer-line">{a.studentAnswer}{a.misconceptionId ? ` — ${MISCONCEPTIONS[a.misconceptionId].label}` : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtSkill(a: AttemptRecord): string {
  const vals = Object.values(a.skillSnapshot) as number[];
  if (!vals.length) return "—";
  return `${((vals.reduce((x, y) => x + y, 0) / vals.length) * 100).toFixed(0)}%`;
}

function makeId(): string {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
