const blockLabels={
 CAMPAIGN_CONTEXT_MISSING:'Vínculo da campanha ou do destinatário não encontrado',
 CAMPAIGN_STOPPED:'Campanha fora de um estado que permite novos envios',
 CHANNEL_UNAVAILABLE:'Canal não está ativo e conectado',
 CONTACT_UNAVAILABLE:'Contato ou preferência comercial não pôde ser confirmado',
 CONTACT_OPTED_OUT:'Contato bloqueou comunicações comerciais',
 AUDIENCE_INELIGIBLE:'Contato deixou de corresponder ao público aprovado',
 TEMPLATE_APPROVAL_UNAVAILABLE:'Aprovação atual do modelo não foi confirmada para este canal Meta',
 BILLING_NOT_DECLARED:'Faturamento Meta não foi declarado para este canal',
} as const;
export type BroadcastBlockCode=keyof typeof blockLabels;
export interface BroadcastGuardObservation {status:string;channel_active:boolean;channel_status:string;contact_id:string|null;opt_out:boolean|null;eligible:boolean;provider:string;verified:boolean|null;billing_declared:boolean;}
/** Classifies only observed pre-dispatch conditions, never provider error text. */
export function broadcastBlockCodes(guard:BroadcastGuardObservation|undefined):BroadcastBlockCode[]{
 if(!guard)return ['CAMPAIGN_CONTEXT_MISSING'];
 const codes:BroadcastBlockCode[]=[];
 if(!['queued','partial','processing'].includes(guard.status))codes.push('CAMPAIGN_STOPPED');
 if(!guard.channel_active||guard.channel_status!=='connected')codes.push('CHANNEL_UNAVAILABLE');
 if(!guard.contact_id||guard.opt_out===null)codes.push('CONTACT_UNAVAILABLE');
 else if(guard.opt_out===true)codes.push('CONTACT_OPTED_OUT');
 else if(!guard.eligible)codes.push('AUDIENCE_INELIGIBLE');
 if(guard.provider==='meta_waba'){
  if(!guard.verified)codes.push('TEMPLATE_APPROVAL_UNAVAILABLE');
  if(!guard.billing_declared)codes.push('BILLING_NOT_DECLARED');
 }
 return codes;
}
export function encodeBroadcastBlockReason(codes:BroadcastBlockCode[]):string{return 'CAMPAIGN_BLOCKED: '+[...new Set(codes)].join(',');}
/** Allowlist projection: raw logs, credentials and unknown provider text never reach the UI. */
export function describeBroadcastBlockReason(raw:string|null|undefined):string|null{
 if(!raw?.startsWith('CAMPAIGN_BLOCKED:'))return null;
 const tokens=raw.slice('CAMPAIGN_BLOCKED:'.length).split(',').map(value=>value.trim());
 const recognized=[...new Set(tokens.filter((code):code is BroadcastBlockCode=>Object.hasOwn(blockLabels,code)))];
 if(!recognized.length)return 'Envio bloqueado pela revisão de campanha, canal, público, faturamento ou aprovação do modelo. O registro não discrimina qual dessas condições causou o bloqueio.';
 const unknown=tokens.some(code=>!Object.hasOwn(blockLabels,code));
 return 'Bloqueio registrado: '+recognized.map(code=>blockLabels[code]).join('; ')+'.'+(unknown?' Há outro motivo sem detalhamento reconhecido neste registro.':'');
}
