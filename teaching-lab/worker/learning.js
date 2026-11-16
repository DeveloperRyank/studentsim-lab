export function evaluateState(previous, evidence, difficulty, kind, elapsedDays) {
 const next=structuredClone(previous); let gain=0;
 if(evidence.assessed && evidence.demonstratedUnderstanding && evidence.correct && evidence.independent && evidence.evidence.length>15){
  gain=Math.min(0.08,(1-next.mastery)*0.12*(difficulty/3));
  next.mastery=Math.min(0.98,next.mastery+gain);
 }
 if(evidence.assessed && !evidence.correct) next.mastery=Math.max(0.02,next.mastery-0.025);
 if(evidence.assessed) next.observations=(next.observations||0)+1;
 if(kind==='retention' && elapsedDays>=1 && evidence.assessed) next.retention=evidence.correct && evidence.independent ? 'Demonstrated' : 'Needs practice';
 if(kind==='transfer' && evidence.assessed) next.transfer=evidence.correct && evidence.demonstratedUnderstanding && evidence.independent ? 'Demonstrated' : 'Needs practice';
 return {next,gain,xp:gain>0?Math.round(gain*250):0};
}
export function validateStudent(x){return x && typeof x.response==='string' && x.response.length>0 && x.response.length<12000 && typeof x.evidence==='string' && typeof x.confidence==='number' && x.confidence>=0 && x.confidence<=1 && typeof x.needsClarification==='boolean';}
export function validateEvaluation(x){return x && ['assessed','correct','demonstratedUnderstanding','independent'].every(k=>typeof x[k]==='boolean') && typeof x.evidence==='string' && Array.isArray(x.misconceptions) && x.misconceptions.every(m=>typeof m==='string');}
