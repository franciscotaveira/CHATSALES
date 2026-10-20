// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,vi} from 'vitest';import {ErrorBoundary} from '../components/ErrorBoundary';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('offers explicit recovery without exposing a failed module URL or stack',async()=>{
 const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});const node=document.createElement('div');document.body.appendChild(node);const root:Root=createRoot(node);
 function Broken():never{throw new Error('Failed to fetch dynamically imported module: https://SIM.invalid/private-module?token=SIM-sensitive');}
 try{await act(async()=>root.render(<ErrorBoundary><Broken/></ErrorBoundary>));expect(document.querySelector('[role=alert]')).not.toBeNull();expect(node.textContent).toContain('Recarregar página');expect(node.textContent).toContain('alterações que ainda não foram salvas');expect(node.textContent).not.toContain('SIM-sensitive');expect(node.textContent).not.toContain('private-module');expect(node.querySelector('pre')).toBeNull();}
 finally{await act(async()=>root.unmount());node.remove();errorLog.mockRestore();}
});
