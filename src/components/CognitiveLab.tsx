import { useEffect, useRef, useState } from "react";
import { download } from "../lib/export";
import { hashStringToSeed, makeRng } from "../lib/rng";
import { narrateResponse } from "../cognition/dialogue";
import { assess } from "../cognition/assessment";
import { calculus, presets } from "../cognition/calculus";
import { accessibility, advance, cloneStudent, createStudent, DAY, defaults, exponentialDecay, interventions, load, teach, type Action, type Profile } from "../cognition/engine";
import { defaultExperiment, objectives, type Evaluation, type SearchConfig } from "../cognition/experiment";
import { baselines } from "../cognition/policy";
import type { Job, Results, WorkerMessage } from "../cognition/worker";

const sections = ["Cognitive Lab","Teaching Arena","Knowledge Architecture","Multiverse Lab","Time Chamber","Strategy Optimizer","Experiment Results"] as const;
const presetStore = "studentsim2.profile";
const resultStore = "studentsim2.experiment";
const optimizationStore = "studentsim2.optimization";
const sweepStore = "studentsim2.sensitivity";
const defaultSearch: SearchConfig = {objective:"Delayed assessment",candidates:24,trials:8,target:.45};
const strategyList = baselines(calculus.slice(5).map(c => c.id));
const percent = (value: number) => (100*value).toFixed(1)+"%";
const day = (minutes: number) => (minutes/DAY).toFixed(2);
const names: Record<Action,string> = {
  explanation:"Direct explanation",example:"Worked example",guided:"Guided practice",independent:"Independent practice",
  retrieval:"Retrieval practice",review:"Spaced review",correction:"Corrective feedback",misconception:"Misconception-specific explanation",
  remediation:"Prerequisite remediation",transfer:"Transfer practice",diagnostic:"Diagnostic assessment",
};
type RecordSummary = {job: Job; result: Results};

function stored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T ?? fallback; }
  catch { return fallback; }
}
function Numeric({label,value,onChange,step = "any"}: {label:string;value:number;onChange:(value:number)=>void;step?:number|"any"}) {
  return <label className="cog-field">{label}<input type="number" value={Number.isFinite(value) ? value : ""} step={step} onChange={e=>onChange(e.currentTarget.valueAsNumber)}/></label>;
}
function Curve({values,label}: {values:number[];label:string}) {
  if (!values.length) return <p className="sub">No events recorded yet.</p>;
  return <svg className="cog-curve" viewBox="0 0 420 125" role="img" aria-label={label}>
    {[10,60,110].map(y=><line key={y} x1="30" y1={y} x2="415" y2={y}/>)}
    <text x="0" y="14">100</text><text x="8" y="64">50</text><text x="16" y="114">0</text>
    <polyline points={values.map((v,i)=>`${30 + 385*i/Math.max(1,values.length-1)},${110-100*v}`).join(" ")}/>
    {values.length === 1 && <circle cx="30" cy={110-100*values[0]} r="4"/>}
  </svg>;
}
export function ScoreTable({rows}: {rows:Evaluation[]}) {
  return <div className="cog-scroll"><table className="cog-table"><thead><tr>{["Policy","Minutes","Immediate","Delayed","Median","SD","95% CI","Retention","Mastery","Transfer","Misconceptions","Gain/min"].map(h=><th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(row=><tr key={row.policy.name}><th>{row.policy.name}</th><td>{row.budget}</td><td>{percent(row.immediate)}</td>
      <td>{percent(row.summary.mean)}</td><td>{percent(row.summary.median)}</td><td>{percent(row.summary.sd)}</td>
      <td>{row.summary.ci?.map(percent).join(" to ") ?? "—"}</td><td>{percent(row.retention)}</td><td>{percent(row.mastery)}</td>
      <td>{percent(row.transfer)}</td><td>{percent(row.misconceptions)}</td><td>{row.efficiency.toFixed(5)}</td></tr>)}</tbody></table></div>;
}
function Schedule({row}: {row:Evaluation}) {
  return <details><summary>Teaching schedule from first trial</summary><div className="cog-scroll"><table className="cog-table">
    <thead><tr><th>Day</th><th>Concept</th><th>Intervention</th><th>Minutes</th><th>Target</th></tr></thead>
    <tbody>{row.example.events.map((event,index)=><tr key={index}><td>{day(event.time)}</td><td>{calculus.find(c=>c.id===event.concept)?.name}</td>
      <td>{names[event.action]}</td><td>{event.duration}</td><td>{event.target ?? "—"}</td></tr>)}</tbody>
  </table></div></details>;
}
function ItemLog({row}: {row:Evaluation}) {
  return <details><summary>Delayed assessment items from first trial</summary><div className="cog-scroll"><table className="cog-table">
    <thead><tr><th>Item</th><th>Level</th><th>Difficulty</th><th>Student answer</th><th>Expected answer</th><th>Marks</th><th>Cause</th><th>Misconception</th><th>Accessibility</th></tr></thead>
    <tbody>{row.example.delayed.responses.map((r,index)=><tr key={index}><td>{r.item.prompt}</td><td>{r.item.level}</td><td>{percent(r.item.difficulty)}</td>
      <td>{r.answer}</td><td>{r.item.answer}</td><td>{r.marks}</td><td>{r.cause}</td><td>{r.misconception ?? "—"}</td><td>{percent(r.accessibility)}</td></tr>)}</tbody>
  </table></div></details>;
}

export default function CognitiveLab({llmConfigured}: {llmConfigured: boolean}) {
  const [section,setSection] = useState<typeof sections[number]>("Cognitive Lab");
  const [profile,setProfile] = useState(()=>stored(presetStore,presets[0]));
  const [student,setStudent] = useState(()=> {
    try {return createStudent(calculus,profile);} catch {return createStudent(calculus,presets[0]);}
  });
  const [config,setConfig] = useState(()=>defaultExperiment(calculus));
  const [search,setSearch] = useState<SearchConfig>(defaultSearch);
  const [sweepKey,setSweepKey] = useState<keyof Profile["params"]>("halfLife");
  const [sweepValues,setSweepValues] = useState("0.75, 2, 7");
  const [comparison,setComparison] = useState(()=>stored<RecordSummary|null>(resultStore,null));
  const [optimization,setOptimization] = useState(()=>stored<RecordSummary|null>(optimizationStore,null));
  const [sweep,setSweep] = useState(()=>stored<RecordSummary|null>(sweepStore,null));
  const [busy,setBusy] = useState<Job["kind"]|null>(null);
  const [progress,setProgress] = useState(0);
  const [message,setMessage] = useState("");
  const [failure,setFailure] = useState("");
  const runner = useRef<Worker|null>(null);
  const [selected,setSelected] = useState("power");
  const [selectedStrategies,setSelectedStrategies] = useState(strategyList.map(p=>p.name));
  const [action,setAction] = useState<Action>("explanation");
  const [target,setTarget] = useState("");
  const [minutes,setMinutes] = useState(10);
  const [dialogue,setDialogue] = useState<{event: number; text: string}|null>(null);
  const [narrating,setNarrating] = useState(false);
  const [tutorNotes,setTutorNotes] = useState("");
  const [hidden,setHidden] = useState(false);
  const [elapsed,setElapsed] = useState(2);
  const [unit,setUnit] = useState(DAY);
  const [branch,setBranch] = useState(0);
  const [frame,setFrame] = useState(0);
  const [playing,setPlaying] = useState(false);
  const [before,setBefore] = useState<number|null>(null);
  const [after,setAfter] = useState<number|null>(null);
  const concept = calculus.find(c=>c.id===selected)!;
  const memory = student.memory[selected];
  const rows = comparison?.result.comparison ?? [];
  const activeBranch = rows[branch];
  const trace = activeBranch?.example.state.history;
  const replay = trace?.[frame];

  useEffect(()=>()=>runner.current?.terminate(),[]);
  useEffect(()=>{
    if (!playing || section !== "Multiverse Lab" || !trace || frame >= trace.length-1) return;
    const timeout = setTimeout(()=>setFrame(frame+1),300);
    return ()=>clearTimeout(timeout);
  },[playing,section,trace,frame]);

  function inspect(id: string) {
    setSelected(id); setTarget(""); setBefore(null); setAfter(null);
  }
  function attempt(fn:()=>void) {
    setFailure(""); setMessage("");
    try {fn();} catch (error) {setFailure(error instanceof Error ? error.message : String(error));}
  }
  function reset(save: boolean) {
    attempt(()=>{
      const next = createStudent(calculus,profile);
      if (save) localStorage.setItem(presetStore,JSON.stringify(profile));
      setStudent(next); setDialogue(null); setBefore(null); setAfter(null);
      setMessage(save ? "Saved profile and created student." : "Created student from profile.");
    });
  }
  function apply(nextAction: Action = action) {
    attempt(()=>{
      const next = cloneStudent(student);
      const previous = accessibility(next,selected);
      const rng = makeRng(hashStringToSeed(`${config.seed}:${next.history.length}`));
      const specifiedTarget = nextAction === action ? target || undefined : undefined;
      const event = teach(next,concept,nextAction,minutes,rng,specifiedTarget,config.interventions);
      event.tutorNotes = tutorNotes.trim() || undefined;
      setTutorNotes(""); setDialogue(null);
      setBefore(previous); setAfter(accessibility(next,selected));
      setStudent(next);
    });
  }
  function tick() {
    attempt(()=>{
      const next = cloneStudent(student);
      advance(next,elapsed*unit); setStudent(next);
    });
  }
  function run(kind: Job["kind"]) {
    attempt(()=>{
      const policies = kind === "demo" ? strategyList : strategyList.filter(p=>selectedStrategies.includes(p.name));
      if (!policies.length) throw new Error("Select at least one baseline policy.");
      const values = sweepValues.split(",").map(text=>text.trim() === "" ? NaN : Number(text));
      if (kind === "sensitivity" && (values.length > 10 || values.some(value=>!Number.isFinite(value)))) throw new Error("Enter up to ten finite sensitivity values.");
      const job: Job = {kind,profile:kind === "demo" ? presets[0] : profile,config:kind === "demo" ? defaultExperiment(calculus) : config,policies,search:kind === "demo" ? defaultSearch : search,sweep:{key:sweepKey,values:kind === "sensitivity" ? values : []}};
      const worker = new Worker(new URL("../cognition/worker.ts",import.meta.url),{type:"module"});
      runner.current = worker; setBusy(kind); setProgress(0);
      const finish = ()=>{worker.terminate(); runner.current=null; setBusy(null);};
      worker.onerror = ()=>{finish(); setFailure("The simulation worker stopped unexpectedly.");};
      worker.onmessage = ({data}:MessageEvent<WorkerMessage>)=>{
        if ("progress" in data) {setProgress(data.progress); return;}
        finish();
        if ("error" in data) {setFailure(data.error); return;}
        const {comparison,optimized,sensitivity} = data.result;
        function save(key:string, record:RecordSummary) {
          try {localStorage.setItem(key,JSON.stringify(record));} catch {setMessage("Results are available in this session. Browser storage could not save them.");}
        }
        if (comparison) {
          const record = {job:{...job,kind:"compare" as const},result:{comparison}};
          setComparison(record); setBranch(0); setFrame(0); setPlaying(false);
          save(resultStore,record);
        }
        if (optimized) {
          const record = {job:{...job,kind:"optimize" as const},result:{optimized}};
          setOptimization(record); save(optimizationStore,record);
        }
        if (sensitivity) {
          const record = {job,result:{sensitivity}};
          setSweep(record); save(sweepStore,record);
        }
        if (kind === "demo") setMessage("Demo complete. Inspect the branches below and open Strategy Optimizer for held-out results.");
      };
      worker.postMessage(job);
    });
  }
  function csv() {
    const report = {comparison,optimization,sweep};
    const output = [["experiment","parameter","value","policy","trial_seed","delayed_score","mean","minutes","configuration"]];
    const add = (record:RecordSummary|null,evaluations:Evaluation[])=>{
      if (!record) return;
      for (const row of evaluations) row.summary.scores.forEach((score,index)=>output.push([
        record.job.kind,"","",row.policy.name,String(row.seeds[index]),String(score),String(row.summary.mean),String(row.budget),JSON.stringify(record.job),
      ]));
    };
    add(comparison,rows);
    if (optimization?.result.optimized) add(optimization,[optimization.result.optimized.best,...optimization.result.optimized.baselines]);
    for (const row of sweep?.result.sensitivity ?? []) for (const rank of row.ranking) output.push([
      "sensitivity",sweep!.job.sweep.key,String(row.value),rank.name,"","",String(rank.score),"",JSON.stringify(report.sweep?.job),
    ]);
    download("studentsim-results.csv",output.map(row=>row.map(value=>'"'+value.replace(/"/g,'""')+'"').join(",")).join("\n"),"text/csv");
  }

  const choice = <label className="cog-field">Concept<select value={selected} onChange={e=>inspect(e.target.value)}>
    {calculus.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
  </select></label>;
  const setup = <div className="card cog-stack">
    <h3>Experiment configuration</h3>
    <p className="sub">{profile.id} · New independent clones start from the profile editor values.</p>
    <div className="cog-grid">
      {([["days","Horizon (days)"],["minutes","Instruction (minutes)"],["trials","Comparison / holdout trials"],["seed","Random seed"],["delayDays","Extra assessment delay (days)"]] as const).map(([key,label])=>
        <Numeric key={key} label={label} value={config[key]} onChange={value=>setConfig({...config,[key]:value})}/>)}
      <Numeric label="Assessment difficulty offset" value={config.exam.difficulty} onChange={difficulty=>setConfig({...config,exam:{...config.exam,difficulty}})}/>
    </div>
    <fieldset className="cog-actions"><legend>Baseline policies</legend>{strategyList.map(p=><label key={p.name}><input type="checkbox" checked={selectedStrategies.includes(p.name)} onChange={e=>setSelectedStrategies(e.target.checked ? [...selectedStrategies,p.name] : selectedStrategies.filter(name=>name!==p.name))}/> {p.name}</label>)}</fieldset>
    <details><summary>Assessment blueprint</summary><div className="cog-grid">{config.exam.blueprint.map((row,index)=><Numeric key={index}
      label={`${calculus.find(c=>c.id===row.concept)?.name} · ${row.level}`} value={row.count} step={1}
      onChange={count=>setConfig({...config,exam:{...config.exam,blueprint:config.exam.blueprint.map((entry,i)=>i===index ? {...entry,count} : entry)}})}/>)}</div></details>
    <details><summary>Intervention assumptions</summary><div className="cog-grid">{(Object.keys(interventions) as Action[]).flatMap(key=>
      (["complexity","learning"] as const).map(property=><Numeric key={key+property} label={`${names[key]} · ${property}`} value={config.interventions[key][property]}
        onChange={value=>setConfig({...config,interventions:{...config.interventions,[key]:{...config.interventions[key],[property]:value}}})}/>))}</div></details>
  </div>;
  const latest = student.history[student.history.length-1];
  const optimized = optimization?.result.optimized;

  return <div className="cog-stack">
    <nav className="cog-actions" aria-label="Cognitive simulation labs">{sections.map(name=><button key={name} aria-pressed={section===name} onClick={()=>setSection(name)}>{name}</button>)}</nav>
    <p className="cog-notice">This application is a research-informed computational prototype of student learning. Its predictions depend on model assumptions and have not been validated as predictions of individual human learning outcomes.</p>
    {failure && <p role="alert" className="cog-error">{failure}</p>}
    {message && <p role="status">{message}</p>}
    {busy && <div role="status" className="cog-actions"><span>{busy==="optimize" || busy==="demo" ? `Searching · ${progress} candidates evaluated` : busy==="compare" ? "Running matched simulations" : "Running sensitivity sweep"}</span>
      <button onClick={()=>{runner.current?.terminate();runner.current=null;setBusy(null);setMessage("Run cancelled.");}}>Cancel run</button></div>}

    {section==="Cognitive Lab" && <>
      <div className="card cog-stack"><h3>Configure a student</h3>
        <div className="cog-actions"><label className="cog-field">Load preset<select value={presets.some(p=>p.id===profile.id) ? profile.id : "Custom"} onChange={e=>setProfile(structuredClone(presets.find(p=>p.id===e.target.value)!))}>
          {presets.map(p=><option key={p.id}>{p.id}</option>)}</select></label>
          <label className="cog-field">Student name<input value={profile.id} onChange={e=>setProfile({...profile,id:e.target.value})}/></label>
          <button onClick={()=>reset(false)}>Create student</button><button onClick={()=>reset(true)}>Save profile</button></div>
        <div className="cog-grid">{(["attention","capacity","learning","forgetting","halfLife","susceptibility","transfer"] as const).map(key=><Numeric key={key}
          label={key==="halfLife" ? "Initial half-life (days)" : key} value={profile.params[key]} onChange={value=>setProfile({...profile,params:{...profile.params,[key]:value}})}/>)}</div>
        <details><summary>All cognitive parameters</summary><div className="cog-grid">{(Object.keys(defaults) as (keyof Profile["params"])[]).map(key=><Numeric key={key} label={key} value={profile.params[key]}
          onChange={value=>setProfile({...profile,params:{...profile.params,[key]:value}})}/>)}</div></details>
        <details><summary>Prior knowledge and initial misconceptions</summary><div className="cog-grid">{calculus.map(c=><Numeric key={c.id} label={c.name} value={profile.prior[c.id]??0}
          onChange={value=>setProfile({...profile,prior:{...profile.prior,[c.id]:value}})}/>)}
          {calculus.flatMap(c=>c.misconceptions.map(m=><Numeric key={m.id} label={m.rule} value={profile.misconceptions[m.id]??0}
            onChange={value=>setProfile({...profile,misconceptions:{...profile.misconceptions,[m.id]:value}})}/>))}</div></details>
      </div>
      <div className="card"><h3>Live student · {student.profile.id}</h3><p>Day {day(student.time)} · Working memory {load(student).toFixed(2)} / {student.profile.params.capacity} units · {student.history.length} teaching events</p>
        <div className="cog-scroll"><table className="cog-table"><thead><tr><th>Concept</th><th>Mastery</th><th>Accessibility</th></tr></thead><tbody>{calculus.map(c=><tr key={c.id}>
          <th>{c.name}</th><td>{percent(student.memory[c.id].mastery)}</td><td>{percent(accessibility(student,c.id))}</td></tr>)}</tbody></table></div></div>
    </>}

    {section==="Teaching Arena" && <div className="card cog-stack">
      <div className="cog-actions"><span>Day {day(student.time)}</span><label><input type="checkbox" checked={hidden} onChange={e=>setHidden(e.target.checked)}/> Hide cognitive state in arena</label></div>
      <p className="sub">{llmConfigured ? "Optional narration voices the numerical response." : "Natural-language interaction is unavailable. Numerical responses are enabled."}</p>
      <div className="cog-grid">{choice}<label className="cog-field">Intervention<select value={action} onChange={e=>setAction(e.target.value as Action)}>
        {(Object.keys(names) as Action[]).map(key=><option key={key} value={key}>{names[key]}</option>)}</select></label>
        <Numeric label="Minutes" value={minutes} onChange={setMinutes}/>
        <label className="cog-field">Misconception target<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Automatic</option>
          {concept.misconceptions.map(m=><option key={m.id} value={m.id}>{m.rule}</option>)}</select></label></div>
      <p className="sub">{concept.instruction}</p>
      <label className="cog-field">Your explanation, example, or feedback notes<textarea rows={2} value={tutorNotes} onChange={e=>setTutorNotes(e.target.value)}/></label>
      <p className="sub">The selected intervention drives the model. Notes are kept in the teaching log.</p>
      <div className="cog-actions"><button onClick={()=>apply()}>Apply intervention</button><button onClick={()=>apply("guided")}>Give a hint and practice</button>
        <button onClick={()=>attempt(()=>{
          const next=cloneStudent(student);
          const result=assess(calculus,next,config.exam,hashStringToSeed(`${config.seed}:interactive:${next.assessments.length}`),0);
          next.assessments.push(result);setStudent(next);setMessage(`Assessment score: ${percent(result.score)}.`);
        })}>Assess student</button>
        <button onClick={tick}>Advance {elapsed} {unit===1 ? "minutes" : unit===60 ? "hours" : unit===DAY ? "days" : "weeks"}</button></div>
      {latest && <div className="cog-stack">
        <strong>{calculus.find(c=>c.id===latest.concept)?.name} · {names[latest.action as Action]}</strong>
        {latest.tutorNotes && <p>Tutor notes · {latest.tutorNotes}</p>}
        {latest.response && <div><p>{latest.response.item.prompt}</p><p>Student answer · {latest.response.answer} · {latest.response.marks ? "Correct" : "Incorrect"}</p>
          {latest.feedback && <p>Feedback · {latest.feedback}</p>}
          {llmConfigured && !hidden && <button disabled={narrating} onClick={async()=>{
            setNarrating(true);
            const text = await narrateResponse(student.profile,latest.response!,calculus.find(c=>c.id===latest.concept)!);
            setDialogue({event:latest.time,text:text ?? "Natural-language interaction unavailable for this response."});
            setNarrating(false);
          }}>{narrating ? "Generating narration…" : "Narrate response"}</button>}
          {dialogue?.event===latest.time && !hidden && <p className="spoken">{dialogue.text}</p>}</div>}
        {!hidden && <p>Attention {latest.attention ? "succeeded" : "failed"} · Encoding {latest.encoded ? "succeeded" : "did not occur"} · Mastery {percent(latest.mastery)} · {latest.response?.cause}</p>}
      </div>}
      {student.assessments.length>0 && <details><summary>Most recent assessment responses</summary>
        <ol>{student.assessments[student.assessments.length-1].responses.map((response,index)=><li key={index}>{response.item.prompt} · Answer {response.answer} · {response.marks}/1
          {!hidden && <span> · {response.cause} · Expected {response.item.answer}</span>}</li>)}</ol>
      </details>}
    </div>}

    {section==="Knowledge Architecture" && <div className="grid cols-2">
      <div className="card cog-stack"><h3>Calculus prerequisite graph</h3>{calculus.map(c=><button className="cog-node" key={c.id} aria-pressed={selected===c.id} onClick={()=>inspect(c.id)}>
        <span>{c.name}</span><small>{c.prerequisites.map(id=>calculus.find(entry=>entry.id===id)?.name).join(" + ") || "Foundation"}</small>
        <span className="cog-meters"><meter aria-label="Mastery" value={student.memory[c.id].mastery}/><meter aria-label="Accessibility" value={accessibility(student,c.id)}/></span>
      </button>)}<p className="sub">Bars show mastery and accessibility in that order.</p></div>
      <div className="card cog-stack"><h3>{concept.name}</h3><p>{concept.description}</p><p>{concept.type} · half-life {memory.halfLife.toFixed(2)} days</p>
        <p>Mastery {percent(memory.mastery)} · Accessibility {percent(accessibility(student,selected))}</p>
        {concept.misconceptions.map(m=><p key={m.id}>{m.rule} · Strength {percent(student.misconceptions[m.id]?.strength ?? 0)} · Formed {student.misconceptions[m.id]?.formation.length ?? 0} times · Corrected {student.misconceptions[m.id]?.correction.length ?? 0} times</p>)}
        <h3>Learning history</h3><Curve label="Concept mastery by teaching event" values={[student.profile.prior[selected]??0,...student.history.filter(e=>e.concept===selected).map(e=>e.mastery)]}/>
        <ul>{student.history.filter(e=>e.concept===selected).slice(-12).map((e,i)=><li key={i}>Day {day(e.time)} · {names[e.action as Action]} · {e.encoded ? "Encoded" : e.response?.cause ?? "No encoding"}</li>)}</ul>
      </div>
    </div>}

    {section==="Time Chamber" && <div className="card cog-stack">
      <div className="cog-grid">{choice}<Numeric label="Advance by" value={elapsed} onChange={setElapsed}/><label className="cog-field">Unit<select value={unit} onChange={e=>setUnit(Number(e.target.value))}>
        <option value={1}>Minutes</option><option value={60}>Hours</option><option value={DAY}>Days</option><option value={DAY*7}>Weeks</option></select></label></div>
      <div className="cog-actions"><button onClick={tick}>Advance time</button><button onClick={()=>apply("review")}>Review concept</button></div>
      <p>Day {day(student.time)} · Current accessibility {percent(accessibility(student,selected))} · Model half-life {memory.halfLife.toFixed(2)} days</p>
      <Curve label="Projected future retrieval accessibility" values={Array.from({length:31},(_,d)=>accessibility(student,selected)*exponentialDecay(d*DAY,memory.halfLife,student.profile.params.forgetting))}/>
      <p className="sub">Projected accessibility from now through the next 30 simulated days. Horizontal steps represent days.</p>
      {before!==null && after!==null && <p>Last intervention · Accessibility before {percent(before)} · After {percent(after)}</p>}
      <p>Retrieval history · {memory.successes} independent successes · {memory.failures} other outcomes</p>
      <ul>{student.history.filter(e=>e.concept===selected && e.response).slice(-12).map((e,i)=><li key={i}>Day {day(e.time)} · {e.response?.cause}</li>)}</ul>
    </div>}

    {section==="Multiverse Lab" && <>
      {setup}<div className="cog-actions"><button disabled={!!busy} onClick={()=>run("compare")}>Run baseline comparison</button>
        <button disabled={!!busy} onClick={()=>{setProfile(structuredClone(presets[0]));setConfig(defaultExperiment(calculus));setSearch(defaultSearch);setSelectedStrategies(strategyList.map(p=>p.name));setStudent(createStudent(calculus,presets[0]));setDialogue(null);setBefore(null);setAfter(null);run("demo");}}>Run Forgetful Student demo</button></div>
      {activeBranch && <div className="card cog-stack"><h3>{comparison?.job.profile.id} → independent branches</h3>
        <div className="cog-branches">{rows.map((row,i)=><button key={row.policy.name} aria-pressed={branch===i} onClick={()=>{setBranch(i);setFrame(0);setPlaying(false);}}>
          {row.policy.name}<small>Day {day(row.example.state.time)} · Exam {percent(row.summary.mean)}</small></button>)}</div>
        <ScoreTable rows={rows}/>
        {trace?.length ? <>
          <div className="cog-actions"><button onClick={()=>{if (frame>=trace.length-1) setFrame(0);setPlaying(!playing || frame>=trace.length-1);}}>{playing && frame<trace.length-1 ? "Pause replay" : "Play replay"}</button>
            <label>Event {frame+1} / {trace.length} <input aria-label="Replay event" type="range" min={0} max={trace.length-1} value={frame} onChange={e=>{setPlaying(false);setFrame(Number(e.target.value));}}/></label></div>
          {replay && <p>Day {day(replay.time)} · {calculus.find(c=>c.id===replay.concept)?.name} · {names[replay.action as Action]} · Attention {replay.attention ? "yes" : "no"} · Encoded {replay.encoded ? "yes" : "no"} · Mastery {percent(replay.mastery)} · Accessibility {percent(replay.accessibility)} {replay.response && `· ${replay.response.cause}`} {replay.formed?.length ? `· Formed ${replay.formed.join(", ")}` : ""} {replay.correction && `· Reduced ${replay.correction}`}</p>}
        </> : <p className="sub">This experiment has no teaching events to replay.</p>}
        <Schedule row={activeBranch}/><ItemLog row={activeBranch}/>
      </div>}
    </>}

    {section==="Strategy Optimizer" && <>{setup}<div className="card cog-stack"><h3>Random policy search</h3>
      <div className="cog-grid"><label className="cog-field">Objective<select value={search.objective} onChange={e=>setSearch({...search,objective:e.target.value as SearchConfig["objective"]})}>
        {objectives.map(objective=><option key={objective}>{objective}</option>)}</select></label>
        <Numeric label="Candidates" value={search.candidates} step={1} onChange={candidates=>setSearch({...search,candidates})}/>
        <Numeric label="Search trials per candidate" value={search.trials} step={1} onChange={trials=>setSearch({...search,trials})}/>
        {search.objective==="Least time to target" && <Numeric label="Target score (0–1)" value={search.target} onChange={target=>setSearch({...search,target})}/>}</div>
      <div><button disabled={!!busy} onClick={()=>run("optimize")}>Run policy search</button></div>
      {optimized && <><h3>Selected policy · {optimized.best.policy.name}</h3><p className="sub">Held-out comparison for {optimization.job.profile.id} · {optimization.job.search.objective} · {optimized.evaluationSeeds.length} trials per policy. The selected policy depends on the model assumptions and search constraints.</p>
        {optimization.job.search.objective==="Least time to target" && <p>Holdout target {percent(optimization.job.search.target)} · {optimized.best.summary.mean>=optimization.job.search.target ? "Reached" : "Missed"}</p>}
        <ScoreTable rows={[optimized.best,...optimized.baselines]}/><Schedule row={optimized.best}/><ItemLog row={optimized.best}/></>}
    </div></>}

    {section==="Experiment Results" && <>
      <div className="card cog-stack"><h3>Baseline results</h3>
        {activeBranch ? <><p>{comparison?.job.profile.id} · {comparison?.job.config.days} days · {comparison?.job.config.trials} matched trials · Seed {comparison?.job.config.seed}</p>
          <ScoreTable rows={rows}/><label className="cog-field">Inspect policy<select value={branch} onChange={e=>{setBranch(Number(e.target.value));setFrame(0);setPlaying(false);}}>{rows.map((r,i)=><option key={i} value={i}>{r.policy.name}</option>)}</select></label>
          <div className="grid cols-2"><div><h3>Delayed score distribution</h3><ol className="cog-hist">{Array.from({length:10},(_,i)=>{
            const count=activeBranch.summary.scores.filter(score=>Math.min(9,Math.floor(score*10))===i).length;
            return <li key={i}><span>{i*10}–{(i+1)*10}%</span><meter max={activeBranch.summary.scores.length} value={count}/><span>{count}</span></li>;
          })}</ol></div><div>{choice}<h3>First trial mastery by teaching event</h3>
            <Curve label="Mastery history" values={[comparison?.job.profile.prior[selected]??0,...activeBranch.example.state.history.filter(e=>e.concept===selected).map(e=>e.mastery)]}/>
            <h3>First trial projected accessibility · 30 days</h3><Curve label="Post-assessment forgetting curve" values={Array.from({length:31},(_,d)=>activeBranch.example.concepts[selected].accessibility*
              exponentialDecay(d*DAY,activeBranch.example.state.memory[selected].halfLife,activeBranch.example.state.profile.params.forgetting))}/></div></div>
          <div className="cog-scroll"><table className="cog-table"><thead><tr><th>Concept</th>{rows.map(r=><th key={r.policy.name}>{r.policy.name}<br/>Mastery / Accessibility</th>)}</tr></thead>
            <tbody>{calculus.map(c=><tr key={c.id}><th>{c.name}</th>{rows.map(r=><td key={r.policy.name}>{percent(r.concepts[c.id].mastery)} / {percent(r.concepts[c.id].accessibility)}</td>)}</tr>)}</tbody></table></div>
          <ItemLog row={activeBranch}/>
        </> : <p className="sub">Run a comparison in Multiverse Lab to populate baseline results.</p>}
        <div className="cog-actions"><button disabled={!comparison&&!optimization&&!sweep} onClick={()=>download("studentsim-results.json",JSON.stringify({comparison,optimization,sweep},null,2),"application/json")}>Export JSON</button>
          <button disabled={!comparison&&!optimization&&!sweep} onClick={csv}>Export CSV</button></div>
      </div>
      <div className="card cog-stack"><h3>Sensitivity analysis</h3><p className="sub">Sweeps use the current student profile and Multiverse experiment settings.</p>
        <div className="cog-grid"><label className="cog-field">Parameter<select value={sweepKey} onChange={e=>setSweepKey(e.target.value as keyof Profile["params"])}>
          {Object.keys(defaults).map(key=><option key={key}>{key}</option>)}</select></label>
          <label className="cog-field">Comma-separated values<input value={sweepValues} onChange={e=>setSweepValues(e.target.value)}/></label></div>
        <div><button disabled={!!busy} onClick={()=>run("sensitivity")}>Compare rankings</button></div>
        {sweep?.result.sensitivity && <div className="cog-scroll"><table className="cog-table"><thead><tr><th>{sweep.job.sweep.key}</th><th>Delayed score ranking</th></tr></thead>
          <tbody>{sweep.result.sensitivity.map((row,index)=><tr key={index}><td>{row.value}</td><td>{row.ranking.map(r=>`${r.name} ${percent(r.score)}`).join(" · ")}</td></tr>)}</tbody></table></div>}
      </div>
    </>}
    <details className="card"><summary>Model assumptions and current settings</summary>
      <p>Mastery uses M′ = M + (1 − M)L, inspired by Bayesian Knowledge Tracing. It represents a continuous estimate.</p>
      <p>Accessibility uses R = 2^(−elapsed × forgetting / half-life), inspired by Half-Life Regression. The clock starts at the last successful encoding or independent retrieval. Consolidation uses h′ = h(1 + αq).</p>
      <p>Attention depends on duration, complexity and buffer overload. Conditional encoding multiplies efficiency, prerequisite readiness and one minus effective difficulty. Responses sample slip, recognized misconception rules, prerequisite readiness, retrieval, task success and guessing. Transfer multiplies task success by a profile-specific factor and supporting concept readiness.</p>
      <p>Parameter values, strengthening rules, the item blueprint and intervention effects are illustrative assumptions. Intervals describe Monte Carlo variability under this configuration. See the README for equations and research references.</p>
      <details><summary>Current profile and experiment configuration</summary><pre className="cog-scroll">{JSON.stringify({profile,config},null,2)}</pre></details>
      {comparison && <details><summary>Recorded baseline configuration</summary><pre className="cog-scroll">{JSON.stringify(comparison.job,null,2)}</pre></details>}
    </details>
  </div>;
}
