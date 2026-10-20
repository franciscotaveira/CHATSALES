import {describe,it,expect} from 'vitest';
import {applyPlaybookDraft,type PlaybookDraft} from '../pages/settings/ai-playbook-draft';
import {NICHE_PLAYBOOKS} from '../pages/settings/playbooks';
const current:PlaybookDraft={name:'SIM nome',personality:'direto_objetivo',systemPrompt:'SIM instruções aprovadas',businessRules:{companyName:'SIM empresa',generalRules:'SIM regras aprovadas',valueProposition:'SIM proposta',agentRole:'SIM papel',openingHours:'SIM horário',objections:{priceDiscount:'SIM desconto autorizado'},customField:'SIM extensão',ctaRule:true,emojiDensity:'expressive'}};
describe('Apply niche model to draft',()=>{
 it('keeps approved fields and extensions while adding missing guidance without mutating input',()=>{
  const before=JSON.stringify(current),next=applyPlaybookDraft(current,NICHE_PLAYBOOKS.ecommerce!,false);
  expect(next).toMatchObject({name:current.name,personality:current.personality,systemPrompt:current.systemPrompt,businessRules:{...current.businessRules,niche:'ecommerce',objections:expect.objectContaining({priceDiscount:'SIM desconto autorizado'})}});
  expect(next.businessRules.objections?.deliveryTimeline).toContain('prazos atuais e aprovados');expect(JSON.stringify(current)).toBe(before);
 });
 it('replaces only the previewed fields after explicit choice',()=>{
  const next=applyPlaybookDraft(current,NICHE_PLAYBOOKS.clinic!,true);
  expect(next.name).toBe('Camila');expect(next.systemPrompt).toContain('não faça diagnóstico');
  expect(next.businessRules).toMatchObject({companyName:'SIM empresa',generalRules:'SIM regras aprovadas',valueProposition:'SIM proposta',openingHours:'SIM horário',customField:'SIM extensão'});
 });
});
