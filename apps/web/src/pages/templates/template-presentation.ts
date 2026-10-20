import type {MessageTemplateSummary} from "../../services/api-client";
export function templateStatus(template:MessageTemplateSummary){
 if(!template.metaTemplateId)return {label:"Rascunho local",variant:"neutral" as const};
 if(!template.metaVerifiedAt||!template.metaVerifiedChannelId||!Number.isFinite(Date.parse(template.metaVerifiedAt)))return {label:"Meta — verificação pendente",variant:"neutral" as const};
 switch(template.status){
  case "APPROVED":return {label:"Aprovado na Meta",variant:"action" as const};
  case "REJECTED":return {label:"Rejeitado na Meta",variant:"danger" as const};
  case "PAUSED":return {label:"Pausado na Meta",variant:"warning" as const};
  default:return {label:"Em análise na Meta",variant:"neutral" as const};
 }
}
export const templateCategory=(category:string)=>({UTILITY:"Utilidade",MARKETING:"Marketing",AUTHENTICATION:"Autenticação"}[category]??category);
