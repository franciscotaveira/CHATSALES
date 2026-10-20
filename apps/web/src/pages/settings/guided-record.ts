import {guidedDraftSchema,type GuidedRecord} from "@sos-sales/contracts";
export function readGuidedRecord(value:unknown):GuidedRecord|null{
 if(value===null)return null;
 const fail=()=>{throw new Error("O plano recebido tem dados incompatíveis. Consulte novamente antes de configurar ou aprovar a IA.");};
 if(!value||typeof value!=="object"||Array.isArray(value))return fail();
 const record=value as Record<string,unknown>;
 const parsedDraft=guidedDraftSchema.safeParse(record.draft);
 if(!Number.isSafeInteger(record.revision)||Number(record.revision)<0||!parsedDraft.success)return fail();
 if(!record.reviews||typeof record.reviews!=="object"||Array.isArray(record.reviews)||Object.values(record.reviews).some(note=>typeof note!=="string"))return fail();
 if(record.approvedRevision!==null&&(!Number.isSafeInteger(record.approvedRevision)||Number(record.approvedRevision)<0))return fail();
 if(record.approvedBy!==null&&typeof record.approvedBy!=="string"||record.approvedAt!==null&&typeof record.approvedAt!=="string")return fail();
 return {...record,draft:parsedDraft.data,reviews:Object.fromEntries(Object.entries(record.reviews).map(([id,note])=>[id,(note as string).trim()]))} as GuidedRecord;
}
