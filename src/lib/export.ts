import type { AttemptRecord } from "./types";
import type { ExperimentRecord } from "./experiment";

export function toJSON(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function esc(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function attemptsToCSV(attempts: AttemptRecord[]): string {
  const header = [
    "sequence",
    "simulator",
    "learnerId",
    "questionId",
    "concept",
    "expectedAnswer",
    "studentAnswer",
    "correct",
    "misconception",
    "priorIntervention",
    "interventionTarget",
    "skillSnapshot",
    "seed",
    "timestamp",
  ];
  const rows = attempts.map((a) =>
    [
      a.sequence,
      a.simulator,
      a.learnerId,
      a.questionId,
      a.concept,
      a.expectedAnswer,
      a.studentAnswer,
      a.correct,
      a.misconceptionId ?? "",
      a.priorIntervention?.kind ?? "",
      a.priorIntervention?.targetsMisconception ?? "",
      JSON.stringify(a.skillSnapshot),
      a.seed,
      a.timestamp,
    ].map(esc).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function experimentToCSV(exp: ExperimentRecord): string {
  const header = [
    "simulator",
    "sequence",
    "questionId",
    "concept",
    "studentAnswer",
    "expectedAnswer",
    "correct",
    "misconception",
    "priorIntervention",
    "skillSnapshot",
  ];
  const rows: string[] = [];
  (["baseline", "enhanced"] as const).forEach((sim) => {
    exp[sim].attempts.forEach((a) => {
      rows.push(
        [
          sim,
          a.sequence,
          a.questionId,
          a.concept,
          a.studentAnswer,
          a.expectedAnswer,
          a.correct,
          a.misconceptionId ?? "",
          a.priorIntervention?.kind ?? "",
          JSON.stringify(a.skillSnapshot),
        ].map(esc).join(","),
      );
    });
  });
  return [header.join(","), ...rows].join("\n");
}

export function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
