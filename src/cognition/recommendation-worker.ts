import { recommendTeaching, type LearnerOverview, type TeachingRecommendation } from "./recommendation";

export type RecommendationMessage = {result: TeachingRecommendation} | {error: string};

self.onmessage = ({data}:MessageEvent<LearnerOverview>) => {
  try {
    self.postMessage({result:recommendTeaching(data)} satisfies RecommendationMessage);
  } catch (error) {
    self.postMessage({error:error instanceof Error ? error.message : String(error)} satisfies RecommendationMessage);
  }
};
