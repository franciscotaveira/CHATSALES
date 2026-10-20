import type {ContactSummary} from '../../services/api-client';
export const hasEstimatedValue=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export const hasRecurringIndication=(contact?:ContactSummary):boolean=>contact?.metadata?.isRecurring===true||(Number.isSafeInteger(contact?.metadata?.totalOrders)&&Number(contact?.metadata?.totalOrders)>0)||(Array.isArray(contact?.metadata?.tags)&&contact.metadata.tags.includes('cliente_recorrente'));
export const isInRecentPeriod=(date:string,days:number,now=Date.now()):boolean=>{const created=new Date(date).getTime();return Number.isFinite(created)&&created<=now&&created>=now-days*86400000;};

export function summarizeEstimates(values:unknown[]){
 const known=values.filter(hasEstimatedValue);const total=known.reduce((sum,value)=>sum+value,0);
 return {knownCount:known.length,missingCount:values.length-known.length,totalCents:Number.isSafeInteger(total)?total:null};
}
