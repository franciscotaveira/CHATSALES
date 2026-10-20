import {describe,it,expect} from 'vitest';
import {parseAiCheckoutConfirmation} from '../ai-checkout';
describe('Explicit customer confirmation syntax',()=>{
 it.each(['sim','quero','tenho interesse','CONFIRMAR','CONFIRMAR ABC','talvez CONFIRMAR AABBCCDDEE'])('does not treat %s as bound confirmation',body=>{expect(parseAiCheckoutConfirmation(body)).toBeNull();});
 it('accepts a complete code while preserving its exact binding',()=>{expect(parseAiCheckoutConfirmation(' confirmar aabbccddee! ')).toBe('AABBCCDDEE');});
});
