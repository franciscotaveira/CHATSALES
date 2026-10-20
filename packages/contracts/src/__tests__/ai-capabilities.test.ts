import {describe,it,expect} from 'vitest';
import {resolveAiCapabilities,aiCapabilitySignature} from '../ai-capabilities';
describe('Explicit AI capabilities',()=>{
 it.each([undefined,null,false,'true',1])('does not grant permission from %s',value=>{expect(resolveAiCapabilities({catalog_offers:value,pix_charges:value}).readCatalog).toBe(false);});
 it('distinguishes offers, billing and disabled catalog access',()=>{expect(resolveAiCapabilities({catalog_offers:true}).catalogAccess).toBe('offers');expect(resolveAiCapabilities({pix_charges:true}).catalogAccess).toBe('billing');expect(resolveAiCapabilities({catalog_offers:true,pix_charges:true}).catalogAccess).toBe('offers_and_billing');expect(resolveAiCapabilities(null).catalogAccess).toBe('none');});
 it('normalizes absent flags and detects effective permission changes',()=>{expect(aiCapabilitySignature({})).toBe(aiCapabilitySignature({pix_charges:false}));expect(aiCapabilitySignature({pix_charges:true})).not.toBe(aiCapabilitySignature({pix_charges:false}));});
});
