import {it,expect} from 'vitest';import {canUseCommand,canCreateCompany} from '../utils/command-access';
it('does not borrow an owner role from another company for contextual commands',()=>{
 const ownsAnother=canCreateCompany([{role:'operator'},{role:'owner'}],'operator');expect(ownsAnother).toBe(true);expect(canUseCommand('act-create-workspace','operator',ownsAnother)).toBe(true);expect(canUseCommand('act-whatsapp-instances','operator',ownsAnother)).toBe(false);expect(canUseCommand('act-new-product','operator',ownsAnother)).toBe(true);
});
it('does not confuse administration with the server owner-only company provisioning rule',()=>{
 expect(canCreateCompany([{role:'admin'}],'admin')).toBe(false);expect(canCreateCompany([],'owner')).toBe(true);expect(canUseCommand('act-create-workspace','admin',false)).toBe(false);
});
it('fails closed for contextual commands with missing or unknown roles but keeps personal recovery actions',()=>{
 for(const role of [undefined,'analyst','__proto__','SIM-unknown']){expect(canUseCommand('act-new-broadcast',role,false)).toBe(false);expect(canUseCommand('act-new-product',role,false)).toBe(false);expect(canUseCommand('act-whatsapp-instances',role,false)).toBe(false);expect(canUseCommand('act-logout',role,false)).toBe(true);expect(canUseCommand('act-sync-session',role,false)).toBe(true);}
 expect(canUseCommand('act-not-registered','owner',true)).toBe(false);
});
