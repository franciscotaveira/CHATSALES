import type {AiRevisionTestList,AiRevisionTestRun} from "@sos-sales/contracts";
const invalid=()=>{throw new Error("Os resultados recebidos não correspondem a testes válidos desta revisão. Consulte os resultados antes de continuar.");};
export function readAiTestRun(run:AiRevisionTestRun,revision:number,scenarioId?:string,runId?:string):AiRevisionTestRun{
 if(!run||typeof run!=="object"||typeof run.id!=="string"||!run.id||run.revision!==revision||typeof run.scenarioId!=="string"||!run.scenarioId||(scenarioId!==undefined&&run.scenarioId!==scenarioId)||(runId!==undefined&&run.id!==runId))return invalid();
 if(!["running","completed","failed"].includes(run.status)||typeof run.isSynthetic!=="boolean"||!Number.isSafeInteger(run.reviewRevision)||run.reviewRevision<0)return invalid();
 if(!Array.isArray(run.checks)||run.checks.some(check=>!check||typeof check.id!=="string"||typeof check.label!=="string"||!["passed","failed","not_verified"].includes(check.status)))return invalid();
 if(run.qualityReview&&(!["adequate","needs_changes"].includes(run.qualityReview.verdict)||typeof run.qualityReview.note!=="string"))return invalid();
 return run;
}
export function readAiTestList(value:AiRevisionTestList,revision:number):AiRevisionTestList{
 if(!value||value.revision!==revision||!Number.isSafeInteger(value.currentRevision)||value.currentRevision<1||!Array.isArray(value.scenarios)||!Array.isArray(value.runs))return invalid();
 const scenarios=new Set<string>(),runs=new Set<string>();
 for(const scenario of value.scenarios){if(!scenario||typeof scenario.id!=="string"||!scenario.id||scenarios.has(scenario.id)||[scenario.title,scenario.question,scenario.expected].some(text=>typeof text!=="string"))return invalid();scenarios.add(scenario.id);}
 for(const run of value.runs){readAiTestRun(run,revision);if(runs.has(run.id)||!scenarios.has(run.scenarioId))return invalid();runs.add(run.id);}
 return value;
}
