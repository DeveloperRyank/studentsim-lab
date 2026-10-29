import type { AttemptRecord } from "../lib/types";

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "Not evaluated";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "Not evaluated";
  return v.toFixed(digits);
}

export function Metric({
  name,
  value,
  variant,
  hint,
}: {
  name: string;
  value: string;
  variant?: "enh" | "base" | "ne";
  hint?: string;
}) {
  const notEval = value === "Not evaluated";
  return (
    <div className="metric">
      <div className={`val ${notEval ? "ne" : variant ?? ""}`}>{value}</div>
      <div className="name">{name}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/** Compact per-attempt skill timeline. Bars are coloured by correctness. */
export function SkillTimeline({ attempts }: { attempts: AttemptRecord[] }) {
  if (!attempts.length) return <div className="note">No attempts yet.</div>;
  return (
    <div>
      <div className="timeline">
        {attempts.map((a) => {
          const skills = Object.values(a.skillSnapshot) as number[];
          const s = skills.length ? skills.reduce((x, y) => x + y, 0) / skills.length : 0;
          return (
            <div
              key={a.sequence}
              className={`bar ${a.correct ? "" : "wrong"}`}
              style={{ height: `${Math.max(4, s * 100)}%` }}
              title={`#${a.sequence} ${a.questionId} — skill ${(s * 100).toFixed(0)}%, ${a.correct ? "correct" : "wrong"}`}
            >
              <span className="cap">{a.sequence}</span>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--teal)" }} /> correct</span>
        <span><i style={{ background: "var(--red)" }} /> incorrect</span>
        <span className="note">Bar height = simulated skill estimate (not measured learning).</span>
      </div>
    </div>
  );
}

export const SimDisclaimer = () => (
  <p className="note warn">
    Simulated estimates only — this is a synthetic learner model, not measured learning and not a claim about any real student.
  </p>
);
