import { useEffect, useRef, useState, type FormEvent } from "react";
import { benchmark, experienceLevels, readinessLevels, type LearnerOverview, type TeachingRecommendation } from "../cognition/recommendation";
import type { RecommendationMessage } from "../cognition/recommendation-worker";

const suggestions: Record<string,string> = {
  "Direct instruction":"Teach the concepts in prerequisite order. Explain each rule and its purpose, then ask the learner to solve problems independently.",
  "Worked examples":"Begin with a solved example. Ask the learner to explain each step, then move from guided practice to independent problems.",
  "Spaced retrieval":"Introduce each concept, then ask the learner to recall and apply it on later days before showing the solution.",
  "Adaptive teaching":"Start with an example and check understanding. If an answer shows a gap, revisit the relevant prerequisite or guide a similar problem before retesting.",
  "Misconception-driven":"Use short diagnostic questions to identify repeated errors. Explain the specific mistaken rule, then test it with a different problem.",
};
const score = (value:number) => `${(value*100).toFixed(1)}%`;

export default function TeachingRecommendation({openResearch}: {openResearch: ()=>void}) {
  const [foundations,setFoundations] = useState<LearnerOverview["foundations"]|"">("");
  const [experience,setExperience] = useState<LearnerOverview["calculus"]|"">("");
  const [result,setResult] = useState<TeachingRecommendation|null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const workerRef = useRef<Worker|null>(null);
  useEffect(()=>()=>workerRef.current?.terminate(),[]);

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!foundations || !experience || workerRef.current) return;
    setResult(null);
    setError("");
    setBusy(true);
    function finish() {
      workerRef.current?.terminate();
      workerRef.current = null;
      setBusy(false);
    }
    try {
      const worker = new Worker(new URL("../cognition/recommendation-worker.ts",import.meta.url),{type:"module"});
      workerRef.current = worker;
      worker.onmessage = ({data}:MessageEvent<RecommendationMessage>)=>{
        finish();
        if ("error" in data) setError(data.error);
        else setResult(data.result);
      };
      worker.onerror = ()=>{finish();setError("The simulation stopped. Run it again to retry.");};
      worker.postMessage({foundations,calculus:experience} satisfies LearnerOverview);
    } catch {
      finish();
      setError("The simulation could not start. Run it again to retry.");
    }
  }

  return <div className="cog-stack">
    <form className="card cog-stack" onSubmit={run}>
      <h3>What does the learner already know?</h3>
      <p className="sub">Subject: introductory calculus. Choose the descriptions that best match their current knowledge.</p>
      <div className="cog-grid">
        <label className="cog-field">Algebra, exponents, functions and graphs
          <select required disabled={busy} value={foundations} onChange={event=>{setFoundations(event.target.value as typeof foundations);setResult(null);setError("");}}>
            <option value="">Choose a level</option>{readinessLevels.map(level=><option key={level}>{level}</option>)}
          </select>
        </label>
        <label className="cog-field">Calculus experience
          <select required disabled={busy} value={experience} onChange={event=>{setExperience(event.target.value as typeof experience);setResult(null);setError("");}}>
            <option value="">Choose a level</option>{experienceLevels.map(level=><option key={level}>{level}</option>)}
          </select>
        </label>
      </div>
      <div className="cog-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Training and testing…" : "Find a teaching method"}</button></div>
      <p className="sub">Each method gets the same training time and a fresh calculus exam. A method must average at least {Math.round(benchmark*100)}% to qualify.</p>
    </form>
    {busy && <p role="status">Teaching simulated learners and scoring their exams.</p>}
    {error && <p role="alert" className="cog-error">{error}</p>}
    {result && <section className="card cog-stack" aria-live="polite">
      {result.recommendation ? <>
        <h3>Recommended method · {result.recommendation.name}</h3>
        <p>{suggestions[result.recommendation.name]}</p>
      </> : <>
        <h3>No method cleared the benchmark</h3>
        <p>The simulation did not identify a teaching method to recommend for this profile.</p>
      </>}
      <p className="sub">{result.trials} trials per method · {result.instructionalHours} simulated teaching hours over {result.days} days · {result.examQuestions}-question exam</p>
      <div className="cog-scroll"><table className="cog-table"><thead><tr><th scope="col">Method</th><th scope="col">Average exam score</th><th scope="col">Benchmark</th></tr></thead>
        <tbody>{[...result.methods].sort((a,b)=>b.summary.mean-a.summary.mean).map(method=><tr key={method.name}>
          <th scope="row">{method.name}</th><td>{score(method.summary.mean)}</td><td>{method.summary.mean>=result.benchmark ? "Passed" : "Below benchmark"}</td>
        </tr>)}</tbody></table></div>
      <p className="sub">The exam is standardized across the simulated methods. The scores do not predict how an individual learner will perform.</p>
    </section>}
    <div><button className="btn btn-ghost" onClick={openResearch} disabled={busy}>Open research tools</button></div>
  </div>;
}
