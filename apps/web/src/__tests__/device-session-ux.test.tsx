// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DangerSection} from '../pages/settings/DangerSection';
import type {UseSessionReturn} from '../hooks/useSession';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('leaves authentication untouched when the operator cancels sign-out',async()=>{
 vi.stubGlobal('confirm',vi.fn().mockReturnValue(false));const logout=vi.fn(),remove=vi.spyOn(Storage.prototype,'removeItem');
 await act(async()=>root.render(<DangerSection session={{logout} as unknown as UseSessionReturn}/>));
 await act(async()=>el.querySelector('button')!.click());expect(logout).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(el.querySelector('[role="alert"]')).toBeNull();
});
it('continues attempting other keys and clears memory when one stored credential cannot be removed',async()=>{
 vi.stubGlobal('confirm',vi.fn().mockReturnValue(true));const logout=vi.fn();
 const original=Storage.prototype.removeItem;const remove=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(function(this:Storage,key:string){if(key==='sos_sales_auth_token')throw new Error('SIM blocked');return original.call(this,key);});
 await act(async()=>root.render(<DangerSection session={{logout} as unknown as UseSessionReturn}/>));
 await act(async()=>el.querySelector('button')!.click());expect(remove).toHaveBeenCalledTimes(8);expect(logout).toHaveBeenCalledOnce();expect(el.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível confirmar a limpeza completa');expect(el.querySelector('button')!.disabled).toBe(false);
});
