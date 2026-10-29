import { useCallback, useEffect, useState } from "react";
import type { Session } from "./lib/types";
import type { ExperimentRecord } from "./lib/experiment";
import { checkHealth, listRecords } from "./lib/api";
import LabOverview from "./components/LabOverview";
import StudentSimulator from "./components/StudentSimulator";
import ExperimentArena from "./components/ExperimentArena";
import BehaviorInspector from "./components/BehaviorInspector";
import Evaluation from "./components/Evaluation";

type Page = "overview" | "simulator" | "experiment" | "inspector" | "evaluation";

const NAV: { id: Page; label: string }[] = [
  { id: "overview", label: "Lab Overview" },
  { id: "simulator", label: "Student Simulator" },
  { id: "experiment", label: "Experiment Arena" },
  { id: "inspector", label: "Behavior Inspector" },
  { id: "evaluation", label: "Evaluation" },
];

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [llm, setLlm] = useState<{ configured: boolean; model: string | null }>({ configured: false, model: null });

  const reload = useCallback(async () => {
    const [s, e] = await Promise.all([
      listRecords<Session>("sessions"),
      listRecords<ExperimentRecord>("experiments"),
    ]);
    setSessions(s);
    setExperiments(e);
  }, []);

  useEffect(() => {
    checkHealth().then((h) => setLlm(h.llm));
    reload();
  }, [reload]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="tag">Research Lab</div>
          <h1>StudentSim Lab</h1>
        </div>
        {NAV.map((n, i) => (
          <button
            key={n.id}
            className={`nav-item ${page === n.id ? "active" : ""}`}
            onClick={() => setPage(n.id)}
          >
            <span className="idx">{i + 1}</span>
            {n.label}
          </button>
        ))}
        <div className="foot">
          <div className={`pill ${llm.configured ? "ok" : "off"}`}><span className="dot" />{llm.configured ? "LLM on" : "fallback"}</div>
          <div style={{ marginTop: 8 }}>Inspired by microsoft/StudentSim. Simplified rule-based baseline — not the original training method.</div>
        </div>
      </aside>

      <main className="main">
        <div className="page-head">
          <h2>{NAV.find((n) => n.id === page)?.label}</h2>
          <p>{subtitle(page)}</p>
        </div>
        {page === "overview" && (
          <LabOverview sessions={sessions} experiments={experiments} llm={llm} onNavigate={(p) => setPage(p as Page)} />
        )}
        {page === "simulator" && <StudentSimulator onLogged={reload} />}
        {page === "experiment" && <ExperimentArena onLogged={reload} />}
        {page === "inspector" && <BehaviorInspector sessions={sessions} />}
        {page === "evaluation" && <Evaluation />}
      </main>
    </div>
  );
}

function subtitle(page: Page): string {
  switch (page) {
    case "overview": return "What the simulator does, the available learner profiles, and recent experiments.";
    case "simulator": return "Run an interactive tutoring session and watch the simulated student's answers and estimated knowledge change.";
    case "experiment": return "Compare the baseline and enhanced simulators on the same questions and intervention strategy.";
    case "inspector": return "Review recorded answer histories, misconceptions, and unexpected behaviour.";
    case "evaluation": return "Scenario-based metrics and inspectable failure cases.";
  }
}
