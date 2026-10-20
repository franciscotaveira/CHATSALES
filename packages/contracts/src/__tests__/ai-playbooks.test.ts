import {describe,it,expect} from 'vitest';
import {NICHE_PLAYBOOKS} from '../ai-playbooks';
describe('Niche suggestions do not manufacture company policies',()=>{
 it('contains guidance rather than invented conditions or FAQ answers',()=>{
  expect(Object.keys(NICHE_PLAYBOOKS)).toEqual(['ecommerce','clinic','infoproduct','services']);
  for(const model of Object.values(NICHE_PLAYBOOKS)){
   expect(model.valueProposition).toBe('');expect(model.faq).toEqual([]);expect(model.ctaRule).toBe(false);
   const text=JSON.stringify(model);expect(text).not.toMatch(/5%|23h59|24 horas|48 horas|90 dias|5 pacientes|1 ano|12x|garantia incondicional|total segurança/);
   expect(model.systemPrompt).toContain('somente informações aprovadas');expect(model.objections.priceDiscount).toContain('Não conceda desconto');
  }
 });
});
