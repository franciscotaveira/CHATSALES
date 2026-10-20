export const aiCheckoutConfirmationPattern=/^CONFIRMAR\s+([A-F0-9]{10})[.!]?$/i;
export function parseAiCheckoutConfirmation(body:string){return body.trim().match(aiCheckoutConfirmationPattern)?.[1]?.toUpperCase()??null;}

export interface AiCheckoutSummary {
 id:string;productTitle:string;retailerId:string;quantity:number;unitPriceCents:number;totalCents:number;
 status:'pending'|'consumed'|'superseded'|'expired'|'cancelled';validUntil:string;createdAt:string;
 summarySent:boolean;confirmedAt:string|null;chargeId:string|null;stockPolicy:'review_required'|'not_required';
}
export interface AiCheckoutSummaryPage {items:AiCheckoutSummary[];nextCursor:string|null;}
