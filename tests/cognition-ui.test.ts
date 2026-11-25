import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ScoreTable } from "../src/components/CognitiveLab";
import { calculus, presets } from "../src/cognition/calculus";
import { compare, defaultExperiment } from "../src/cognition/experiment";
import { baselines } from "../src/cognition/policy";

it("renders the run's actual budget and immediate, delayed and transfer scores", () => {
  const config = {...defaultExperiment(calculus),trials:3,minutes:137};
  const policies = baselines(calculus.slice(5).map(concept => concept.id));
  const rows = compare(calculus,presets[0],config,policies);
  const table = renderToStaticMarkup(createElement(ScoreTable,{rows}));
  const percent = (value:number) => (100*value).toFixed(1)+"%";
  for (const row of rows) {
    expect(table).toContain(`<th>${row.policy.name}</th><td>${row.budget}</td><td>${percent(row.immediate)}</td><td>${percent(row.summary.mean)}</td>`);
    expect(table).toContain(`<td>${percent(row.mastery)}</td><td>${percent(row.transfer)}</td><td>${percent(row.misconceptions)}</td>`);
  }
});
