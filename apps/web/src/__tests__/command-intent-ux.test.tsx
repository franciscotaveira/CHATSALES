// @vitest-environment happy-dom
import {act,StrictMode} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {TemplatesPage} from '../pages/templates/TemplatesPage';import {ProductsPage} from '../pages/products/ProductsPage';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
vi.mock('../pages/templates/BroadcastTemplateDialog',()=>({BroadcastTemplateDialog:({isOpen}:any)=>isOpen?<div>SIM Campaign Composer</div>:null}));vi.mock('../pages/products/CreateProductDialog',()=>({CreateProductDialog:({isOpen}:any)=>isOpen?<div>SIM Product Composer</div>:null}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const session=(id='SIM-a')=>({activeWorkspace:{id,role:'owner'},token:'SIM-token'} as UseSessionReturn);
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[]} as never);vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);vi.spyOn(apiClient,'getProducts').mockResolvedValue({products:[]} as never);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('opens a campaign intent under StrictMode and does not carry it into another company',async()=>{
 await act(async()=>root.render(<StrictMode><TemplatesPage session={session()} broadcastRequest={1} broadcastRequestScope="SIM-a:SIM-token:owner"/></StrictMode>));expect(el.textContent).toContain('SIM Campaign Composer');
 await act(async()=>root.render(<StrictMode><TemplatesPage session={session('SIM-b')} broadcastRequest={1} broadcastRequestScope="SIM-a:SIM-token:owner"/></StrictMode>));expect(el.textContent).not.toContain('SIM Campaign Composer');
 await act(async()=>root.render(<StrictMode><TemplatesPage session={session('SIM-b')} broadcastRequest={2} broadcastRequestScope="SIM-b:SIM-token:owner"/></StrictMode>));expect(el.textContent).toContain('SIM Campaign Composer');
});
it('does not carry a product creation intent into another company',async()=>{
 await act(async()=>root.render(<StrictMode><ProductsPage session={session()} createRequest={1} createRequestScope="SIM-a:SIM-token:owner"/></StrictMode>));expect(el.textContent).toContain('SIM Product Composer');
 await act(async()=>root.render(<StrictMode><ProductsPage session={session('SIM-b')} createRequest={1} createRequestScope="SIM-a:SIM-token:owner"/></StrictMode>));expect(el.textContent).not.toContain('SIM Product Composer');
});
