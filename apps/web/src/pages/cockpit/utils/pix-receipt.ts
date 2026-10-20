import type {PixChargeSummary,PixSettlementPatch} from "../../../services/api-client";
export function hasVerifiedPixReceipt(charge:PixChargeSummary):boolean{
 return charge.status==="PAID"&&Number.isFinite(Date.parse(charge.verifiedAt??""))&&(charge.verificationMethod==="BANK_WEBHOOK"||charge.verificationMethod==="MANUAL_CASHIER"&&Boolean(charge.verifiedByUserId));
}

export function readConversationPixCharges(value:unknown,workspaceId:string,threadId:string):PixChargeSummary[]{
 if(!Array.isArray(value)||value.some(charge=>!charge||typeof charge!=="object"||typeof charge.id!=="string"||!charge.id||charge.workspaceId!==workspaceId||charge.threadId!==threadId))throw new Error("A consulta não retornou cobranças válidas desta conversa. Atualize antes de continuar.");
 return value as PixChargeSummary[];
}

export function pixChargeStateLabel(charge:PixChargeSummary,now=Date.now()):string{
 if(charge.status==="PAID")return hasVerifiedPixReceipt(charge)?"Pago — confirmação registrada":"Pagamento informado — revisar confirmação";
 if(charge.status==="EXPIRED")return "Expirada";
 if(charge.status==="CANCELLED")return "Cancelada";
 if(charge.status!=="PENDING")return "Estado não reconhecido";
 const expiry=Date.parse(charge.expiresAt);
 return !Number.isFinite(expiry)?"Validade para revisar":expiry<=now?"Validade vencida neste dispositivo":"Pendente";
}

export function confirmedPixSettlement(original:PixChargeSummary,patch:PixSettlementPatch):PixChargeSummary{
 if(!patch||patch.id!==original.id||patch.status!=="PAID"||!Number.isSafeInteger(patch.amountCents)||patch.amountCents<0||typeof patch.amountFormatted!=="string"||!patch.amountFormatted.trim())throw new Error("A resposta não confirmou um recebimento válido. Consulte as cobranças antes de repetir.");
 const confirmed:PixChargeSummary={...original,status:patch.status,amountCents:patch.amountCents,amountFormatted:patch.amountFormatted,paidAt:patch.paidAt,verificationMethod:patch.verificationMethod??null,verifiedAt:patch.verifiedAt??null,verifiedByUserId:patch.verifiedByUserId??null,verificationNotes:patch.verificationNotes??null};
 if(!hasVerifiedPixReceipt(confirmed))throw new Error("A resposta não confirmou um recebimento válido. Consulte as cobranças antes de repetir.");
 return confirmed;
}
