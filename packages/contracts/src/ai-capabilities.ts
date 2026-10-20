/** Flags are explicit permissions, never truthy coercions or proof of execution. */
export function resolveAiCapabilities(skills?:Record<string,unknown>|null){
 const catalogOffers=skills?.catalog_offers===true,pixCharges=skills?.pix_charges===true;
 return {catalogOffers,pixCharges,qualifyLead:skills?.qualify_lead===true,appointments:skills?.appointments===true,capiTracking:skills?.capi_tracking===true,
 readCatalog:catalogOffers||pixCharges,catalogAccess:catalogOffers?(pixCharges?'offers_and_billing':'offers'):(pixCharges?'billing':'none')} as const;
}
export function aiCapabilitySignature(skills?:Record<string,unknown>|null){return JSON.stringify(resolveAiCapabilities(skills));}
