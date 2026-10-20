import type { PoolClient } from "pg";
import { createOrGetContact } from "./messaging";

export interface BroadcastAudienceSelection {
  type: "ALL_CONTACTS" | "BY_STAGE" | "MANUAL" | "IMPORT_LIST" | "SMART_FILTER";
  stage?: string;
  smartFilter?: string;
  customPhoneNumbers?: string[];
  importedContacts?: Array<{phoneE164:string;name?:string|null}>;
}
export interface BroadcastTarget {phone_e164:string;name?:string|null;contact_id?:string}
export interface BroadcastCandidate extends BroadcastTarget {opt_out:boolean}

/** Read-only when preparing. A frozen phone list only narrows the original selection. */
export async function resolveBroadcastAudience(client:PoolClient,workspaceId:string,audience:BroadcastAudienceSelection,frozen?:BroadcastTarget[],createMissing=false):Promise<BroadcastCandidate[]> {
  const values:unknown[]=[workspaceId];
  const clauses=["c.workspace_id=$1","c.phone_e164 IS NOT NULL"];
  const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
  const explicit=audience.type==="MANUAL" ? (audience.customPhoneNumbers||[]).map(phoneE164=>({phoneE164,name:undefined as string|undefined|null})) : audience.type==="IMPORT_LIST" ? audience.importedContacts||[] : null;
  if(explicit)clauses.push(`c.phone_e164=ANY(${bind(explicit.map(item=>item.phoneE164))}::text[])`);
  if(frozen)clauses.push(`c.phone_e164=ANY(${bind(frozen.map(item=>item.phone_e164))}::text[])`);
  if(audience.type==="BY_STAGE")clauses.push(`EXISTS(SELECT 1 FROM public.commercial_journeys j WHERE j.workspace_id=c.workspace_id AND j.contact_id=c.id AND LOWER(j.stage)=LOWER(${bind(audience.stage||"")}))`);
  if(audience.type==="SMART_FILTER") {
    const paid="EXISTS(SELECT 1 FROM public.pix_charges p WHERE p.workspace_id=c.workspace_id AND p.contact_id=c.id AND p.status='PAID')";
    switch(audience.smartFilter){
      case "NON_BUYERS":clauses.push("NOT EXISTS(SELECT 1 FROM public.commercial_journeys j WHERE j.workspace_id=c.workspace_id AND j.contact_id=c.id AND LOWER(j.stage)='won')",`NOT ${paid}`);break;
      case "PIX_ABANDONED":clauses.push("EXISTS(SELECT 1 FROM public.pix_charges p WHERE p.workspace_id=c.workspace_id AND p.contact_id=c.id AND p.status IN ('EXPIRED','PENDING'))",`NOT ${paid}`);break;
      case "INACTIVE_30_DAYS":clauses.push("NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.workspace_id=c.workspace_id AND m.contact_id=c.id AND m.created_at>=now()-interval '30 days')");break;
      case "CTWA_RESCUE":clauses.push("EXISTS(SELECT 1 FROM public.commercial_journeys j WHERE j.workspace_id=c.workspace_id AND j.contact_id=c.id AND j.attribution_source='ctwa_meta' AND LOWER(j.stage) IN ('lead','qualified'))");break;
      default:throw new Error("Critério de público inválido");
    }
  }
  const rows=(await client.query<BroadcastCandidate>(`SELECT c.phone_e164,c.name,c.id AS contact_id,c.opt_out FROM public.contacts c WHERE ${clauses.join(" AND ")} ORDER BY c.phone_e164 LIMIT 1000`,values)).rows;
  const byPhone=new Map(rows.map(row=>[row.phone_e164,row]));
  if(explicit)for(const item of explicit){
    if(byPhone.has(item.phoneE164))continue;
    if(frozen&&!frozen.some(target=>target.phone_e164===item.phoneE164&&!target.contact_id))continue;
    if(createMissing){
      const contact=await createOrGetContact(client,{workspaceId,phoneE164:item.phoneE164,name:item.name||undefined});
      byPhone.set(item.phoneE164,{phone_e164:contact.phone_e164,name:contact.name,contact_id:contact.id,opt_out:contact.opt_out});
    }else byPhone.set(item.phoneE164,{phone_e164:item.phoneE164,name:item.name,opt_out:false});
  }
  const candidates=Array.from(byPhone.values()).sort((a,b)=>a.phone_e164.localeCompare(b.phone_e164));
  if(!frozen)return candidates;
  return candidates.filter(candidate=>frozen.some(target=>target.phone_e164===candidate.phone_e164&&(!target.contact_id||target.contact_id===candidate.contact_id)));
}
