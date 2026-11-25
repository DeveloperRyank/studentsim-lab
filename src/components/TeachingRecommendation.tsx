import { useEffect, useRef, useState, type FormEvent } from "react";
import { benchmark, experienceLevels, observedErrors, readinessLevels, topicLevels, trainingBudgets, type LearnerOverview, type TeachingRecommendation, type TopicLevel } from "../cognition/recommendation";
import { calculus } from "../cognition/calculus";
import type { RecommendationMessage } from "../cognition/recommendation-worker";

const suggestions: Record<string,string> = {
  "Direct instruction":"Teach the concepts in prerequisite order. Explain each rule and its purpose, then ask the learner to solve problems independently.",
  "Worked examples":"Begin with a solved example. Ask the learner to explain each step, then move from guided practice to independent problems.",
  "Spaced retrieval":"Introduce each concept, then ask the learner to recall and apply it on later days before showing the solution.",
  "Adaptive teaching":"Start with an example and check understanding. If an answer shows a gap, revisit the relevant prerequisite or guide a similar problem before retesting.",
  "Misconception-driven":"Use short diagnostic questions to identify repeated errors. Explain the specific mistaken rule, then test it with a different problem.",
};
const topicEvidence: Record<string,string> = {
  algebra:"Solve a linear equation and rearrange a formula.",
  exponents:"Combine powers of the same base using exponent rules.",
  functions:"Evaluate a function from its formula or notation.",
  graphs:"Read coordinates and interpret the shape of a graph.",
  slope:"Find a straight line’s slope from two points.",
  limits:"Find the value a function approaches near a point.",
  average:"Calculate average change over an interval.",
  instantaneous:"Distinguish a rate at a point from a rate over an interval.",
  definition:"Use a difference quotient to find a derivative.",
  constant:"Differentiate a constant function.",
  power:"Differentiate a power of x.",
  sum:"Differentiate a sum term by term.",
  polynomial:"Differentiate a polynomial with several terms.",
  tangent:"Find the slope of a tangent at a chosen point.",
  applications:"Use derivatives to solve a rate-of-change problem in context.",
};
const score = (value:number) => `${(value*100).toFixed(1)}%`;

export default function TeachingRecommendation({openResearch}: {openResearch: ()=>void}) {
  const [foundations,setFoundations] = useState<LearnerOverview["foundations"]|"">("");
  const [experience,setExperience] = useState<LearnerOverview["calculus"]|"">("");
  const [topics,setTopics] = useState<Record<string,TopicLevel>>({});
  const [errors,setErrors] = useState<string[]>([]);
  const [result,setResult] = useState<TeachingRecommendation|null>(null);
  const [error,setError] = useState("");
  const [trainingHours,setTrainingHours] = useState<number>(trainingBudgets[0]);
  const [busy,setBusy] = useState(false);
  const workerRef = useRef<Worker|null>(null);
  useEffect(()=>()=>workerRef.current?.terminate(),[]);

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!foundations || !experience || workerRef.current) return;
    setResult(null);
    setError("");
    setTrainingHours(trainingBudgets[0]);
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
        if ("trainingHours" in data) {setTrainingHours(data.trainingHours); return;}
        finish();
        if ("error" in data) setError(data.error);
        else setResult(data.result);
      };
      worker.onerror = ()=>{finish();setError("The simulation stopped. Run it again to retry.");};
      worker.postMessage({foundations,calculus:experience,topics,observedErrors:errors} satisfies LearnerOverview);
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
      <details>
        <summary>Detailed learner background</summary>
        <p className="sub">Rate any topics you have evidence for. Unrated topics use the two general answers above.</p>
        {([["Math foundations",calculus.slice(0,5)],["Calculus skills",calculus.slice(5)]] as const).map(([title,concepts])=>
          <fieldset className="cog-background-section" key={title}><legend>{title}</legend>
            <div className="cog-grid">{concepts.map(concept=>
              <label className="cog-field" key={concept.id}>
                <strong>{concept.name}</strong>
                <small>{topicEvidence[concept.id]}</small>
                <select aria-label={concept.name} disabled={busy} value={topics[concept.id] ?? ""} onChange={event=>{
                  const value = event.target.value as TopicLevel | "";
                  setTopics(previous=>{
                    const next = {...previous};
                    if (value) next[concept.id] = value;
                    else delete next[concept.id];
                    return next;
                  });
                  setResult(null);setError("");
                }}>
                  <option value="">Use general background</option>
                  {topicLevels.map(({label})=><option key={label}>{label}</option>)}
                </select>
              </label>)}</div>
          </fieldset>)}
        <fieldset className="cog-background-section"><legend>Repeated errors you’ve observed</legend>
          <p className="sub">Select errors the learner has actually made. Leave the list blank if you haven’t seen their work.</p>
          <div className="cog-grid">{observedErrors.map(observed=>
            <label className="cog-observation" key={observed.id}>
              <input type="checkbox" disabled={busy} checked={errors.includes(observed.id)} onChange={event=>{
                setErrors(event.target.checked ? [...errors,observed.id] : errors.filter(id=>id!==observed.id));
                setResult(null);setError("");
              }}/>
              <span><strong>{observed.concept}</strong><small>{observed.rule}</small></span>
            </label>)}</div>
        </fieldset>
      </details>
      <div className="cog-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Training and testing…" : "Find a teaching method"}</button></div>
      <p className="sub">Methods start with {trainingBudgets[0]} simulated hours. If none average {Math.round(benchmark*100)}% on the calculus exam, StudentSim compares them again with a longer course.</p>
    </form>
    {busy && <p role="status">Testing a {trainingHours}-hour simulated course for each teaching method.</p>}
    {error && <p role="alert" className="cog-error">{error}</p>}
    {result && <section className="card cog-stack" aria-live="polite">
      {result.recommendation ? <>
        <h3>Recommended method · {result.recommendation.name}</h3>
        <p>{suggestions[result.recommendation.name]}</p>
      </> : <>
        <h3>More practice may help</h3>
        <p>{result.methods[0].name} led the simulation at {score(result.methods[0].summary.mean)}. It fell short of the {Math.round(result.benchmark*100)}% benchmark within the training time tested.</p>
        <p>{foundations === "Needs review"
          ? "Start with a brief check on exponents, function notation, and graph reading. Practice the skills that need review before introducing derivatives."
          : "Start with rates of change and the basic differentiation rules. Use a short quiz to see which topics need more practice before moving to applications."}</p>
      </>}
      {result.stages.length > 1 && <p>After {result.stages[0].instructionalHours} hours, the top average was {score(result.stages[0].methods[0].summary.mean)}. With {result.instructionalHours} hours, the top average was {score(result.methods[0].summary.mean)}.</p>}
      {(result.detailedTopics>0 || result.detailedErrors>0) &&
        <p className="sub">Starting profile used {result.detailedTopics} topic {result.detailedTopics===1 ? "rating" : "ratings"} and {result.detailedErrors} observed error {result.detailedErrors===1 ? "pattern" : "patterns"}.</p>}
      <p className="sub">{result.trials} trials per method · {result.instructionalHours} simulated teaching hours over {result.days} days · {result.examQuestions}-question exam</p>
      <div className="cog-scroll"><table className="cog-table"><thead><tr><th scope="col">Method</th><th scope="col">Average exam score</th><th scope="col">Benchmark</th></tr></thead>
        <tbody>{result.methods.map(method=><tr key={method.name}>
          <th scope="row">{method.name}</th><td>{score(method.summary.mean)}</td><td>{method.summary.mean>=result.benchmark ? "Passed" : "Below benchmark"}</td>
        </tr>)}</tbody></table></div>
      <p className="sub">The exam is standardized across the simulated methods. The scores do not predict how an individual learner will perform.</p>
    </section>}
    <div><button className="btn btn-ghost" onClick={openResearch} disabled={busy}>Open research tools</button></div>
  </div>;
}
