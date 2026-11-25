import { calculus } from "./calculus";
import { compare, optimize, sensitivity, type ExperimentConfig, type SearchConfig } from "./experiment";
import type { Profile } from "./engine";
import type { Policy } from "./policy";

export interface Job {
  kind: "compare" | "optimize" | "sensitivity" | "demo";
  profile: Profile;
  config: ExperimentConfig;
  policies: Policy[];
  search: SearchConfig;
  sweep: {key: keyof Profile["params"]; values: number[]};
}
export interface Results {
  comparison?: ReturnType<typeof compare>;
  optimized?: ReturnType<typeof optimize>;
  sensitivity?: ReturnType<typeof sensitivity>;
}
export type WorkerMessage = {progress: number} | {error: string} | {result: Results};
self.onmessage = ({data}: MessageEvent<Job>) => {
  try {
    const {kind,profile,config,policies,search,sweep} = data;
    let result: Results;
    switch (kind) {
      case "demo": result = {comparison:compare(calculus,profile,config,policies),
        optimized:optimize(calculus,profile,config,policies,search,progress => self.postMessage({progress}))}; break;
      case "compare": result = {comparison:compare(calculus,profile,config,policies)}; break;
      case "optimize": result = {optimized:optimize(calculus,profile,config,policies,search,progress => self.postMessage({progress}))}; break;
      case "sensitivity": result = {sensitivity:sensitivity(calculus,profile,config,policies,sweep.key,sweep.values)}; break;
    }
    self.postMessage({result});
  } catch (error) {
    self.postMessage({error:error instanceof Error ? error.message : String(error)});
  }
};
