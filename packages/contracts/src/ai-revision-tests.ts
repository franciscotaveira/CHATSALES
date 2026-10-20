import {guidedScenarios,initialGuidedDraft,type GuidedRecord,type GuidedDraft} from './guided-agent';

export const aiTextVerifierVersion='text-intent-v3-checkout-summary';
export interface AiTestScenario {id:string;title:string;question:string;expected:string;origin:'base'|'function'|'company';}
export interface AiTestCheck {id:string;label:string;status:'passed'|'failed'|'not_verified';detail?:string;}
export interface AiTestQualityReview {revision:number;verdict:'adequate'|'needs_changes';note:string;reviewedAt:string;}
export interface AiRevisionTestRun {
 id:string;revision:number;scenarioId:string;title:string;question:string;expected:string;
 status:'running'|'completed'|'failed';replyText:string|null;checks:AiTestCheck[];
 needsHandoff:boolean;offerPixProductId:string|null;provider:string|null;model:string|null;
 createdAt:string;completedAt:string|null;failureMessage:string|null;isSynthetic:boolean;
 reviewRevision:number;qualityReview:AiTestQualityReview|null;
 catalogSnapshot:Array<{id:string;title:string;priceCents:number}>;
}
export interface AiRevisionTestList {revision:number;currentRevision:number;verifierVersion:string;scenarios:AiTestScenario[];runs:AiRevisionTestRun[];}
export interface AiScenarioConfig {skills?:{qualify_lead?:boolean;catalog_offers?:boolean;pix_charges?:boolean;appointments?:boolean;capi_tracking?:boolean};}
export function aiRevisionScenarios(config:AiScenarioConfig,snapshot:GuidedRecord|null):AiTestScenario[]{
 const draft:GuidedDraft=snapshot?.draft?{...snapshot.draft,functions:[...snapshot.draft.functions]}:{...initialGuidedDraft,functions:[],customCases:[]};
 const selected:Array<[boolean|undefined,GuidedDraft['functions'][number]]>=[[config.skills?.qualify_lead,'qualify'],[config.skills?.catalog_offers,'catalog'],[config.skills?.pix_charges,'payments'],[config.skills?.appointments,'appointments']];
 for(const [enabled,key] of selected)if(enabled===true&&!draft.functions.includes(key))draft.functions.push(key);
 const base=new Set(['known','unknown','human','receipt']);
 const own=new Set(draft.customCases.map(item=>item.id));
 const result:AiTestScenario[]=guidedScenarios(draft).map(item=>({...item,origin:own.has(item.id)?'company':base.has(item.id)?'base':'function'}));
 if(config.skills?.capi_tracking===true)result.push({id:'conversion',title:'Conversão comprovada',question:'Cliquei no anúncio e quero saber mais. Isso já conta como compra?',expected:'Não registrar compra ou valor recebido apenas por clique ou interesse; exigir o marco comercial comprovado.',origin:'function'});
 return result;
}
