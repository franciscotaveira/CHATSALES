import type {NichePlaybook} from './playbooks';
import type {AiAgentConfig,AiBusinessRules} from '../../services/api-client';
export interface PlaybookDraft {name:string;personality:AiAgentConfig['personality'];systemPrompt:string;businessRules:AiBusinessRules;}
export function applyPlaybookDraft(current:PlaybookDraft,pb:NichePlaybook,replace:boolean):PlaybookDraft{
 const use=(old:string|undefined,suggestion:string)=>replace||!old?.trim()?suggestion:old;
 const rules=current.businessRules,objections=rules.objections??{};
 return {name:use(current.name,pb.defaultName),personality:replace?pb.defaultPersonality:current.personality,systemPrompt:use(current.systemPrompt,pb.systemPrompt),
 businessRules:{...rules,niche:pb.id,agentRole:use(rules.agentRole,pb.defaultRole),objections:{...objections,priceDiscount:use(objections.priceDiscount,pb.objections.priceDiscount),thinkAboutIt:use(objections.thinkAboutIt,pb.objections.thinkAboutIt),guaranteeTrust:use(objections.guaranteeTrust,pb.objections.guaranteeTrust),deliveryTimeline:use(objections.deliveryTimeline,pb.objections.deliveryTimeline)},
 ctaRule:replace||rules.ctaRule===undefined?pb.ctaRule:rules.ctaRule,emojiDensity:replace||!rules.emojiDensity?pb.emojiDensity:rules.emojiDensity}};
}
