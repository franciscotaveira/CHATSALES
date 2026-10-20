// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {MessageList} from '../pages/cockpit/Conversation/MessageList';import type {ThreadMessageSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();});
const message={id:'SIM-message',body:'SIM mensagem preservada',direction:'inbound',contentType:'text',createdAt:'2026-10-18T12:00:00Z'} as ThreadMessageSummary;
it('does not call an unsuccessful message query an empty conversation and allows an explicit read retry',async()=>{
 const retry=vi.fn();await act(async()=>root.render(<MessageList messages={[]} isLoading={false} error="SIM leitura indisponível" onRetry={retry}/>));expect(el.textContent).toContain('histórico ainda não foi confirmado');expect(el.textContent).not.toContain('Nenhuma mensagem nesta conversa');expect(el.textContent).not.toContain('Inicie a conversa');await act(async()=>el.querySelector('button')!.click());expect(retry).toHaveBeenCalledOnce();
 await act(async()=>root.render(<MessageList messages={[]} isLoading={false} onRetry={retry}/>));expect(el.textContent).toContain('Nenhuma mensagem nesta conversa');expect(el.querySelector('[role=alert]')).toBeNull();
});
it('retains messages after a failed refresh and identifies the last completed consultation',async()=>{
 const retry=vi.fn();await act(async()=>root.render(<MessageList messages={[message]} isLoading={false} error="SIM refresh falhou" onRetry={retry}/>));expect(el.textContent).toContain('SIM mensagem preservada');expect(el.textContent).toContain('última consulta concluída');expect(el.textContent).not.toContain('Nenhuma mensagem nesta conversa');await act(async()=>el.querySelector('button')!.click());expect(retry).toHaveBeenCalledOnce();
 await act(async()=>root.render(<MessageList messages={[message]} isLoading onRetry={retry} error="SIM refresh falhou"/>));expect(el.querySelector('button')!.disabled).toBe(true);
});
it('shows initial loading before an old query error instead of inviting a new message',async()=>{
 await act(async()=>root.render(<MessageList messages={[]} isLoading error="SIM erro anterior"/>));expect(el.textContent).not.toContain('Nenhuma mensagem nesta conversa');expect(el.querySelector('[role=alert]')).toBeNull();
});

it('preserves the reading position when a new message arrives and offers an explicit jump',async()=>{
 await act(async()=>root.render(<MessageList messages={[message]} isLoading={false}/>));const list=el.querySelector('[role="log"]') as HTMLDivElement;Object.defineProperty(list,'scrollHeight',{configurable:true,value:1000});Object.defineProperty(list,'clientHeight',{configurable:true,value:200});
 await act(async()=>{list.scrollTop=500;list.dispatchEvent(new Event('scroll'));});await act(async()=>root.render(<MessageList messages={[message,{...message,id:'SIM-new',body:'SIM nova mensagem'}]} isLoading={false}/>));
 expect(list.scrollTop).toBe(500);const jump=Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Ver novas mensagens')!;expect(jump).toBeDefined();await act(async()=>jump.click());expect(list.scrollTop).toBe(1000);expect(document.activeElement).toBe(list);expect(el.textContent).not.toContain('Ver novas mensagens');
});
it('follows the latest message only while the operator is already at the bottom',async()=>{
 await act(async()=>root.render(<MessageList messages={[message]} isLoading={false}/>));const list=el.querySelector('[role="log"]') as HTMLDivElement;let height=1000;Object.defineProperty(list,'scrollHeight',{configurable:true,get:()=>height});Object.defineProperty(list,'clientHeight',{configurable:true,value:200});
 await act(async()=>{list.scrollTop=800;list.dispatchEvent(new Event('scroll'));});height=1200;await act(async()=>root.render(<MessageList messages={[message,{...message,id:'SIM-new'}]} isLoading={false}/>));expect(list.scrollTop).toBe(1200);expect(el.textContent).not.toContain('Ver novas mensagens');
});
it('does not announce older prepended history as a new latest message',async()=>{
 await act(async()=>root.render(<MessageList messages={[message]} isLoading={false}/>));const list=el.querySelector('[role="log"]') as HTMLDivElement;Object.defineProperty(list,'scrollHeight',{configurable:true,value:1000});Object.defineProperty(list,'clientHeight',{configurable:true,value:200});await act(async()=>{list.scrollTop=400;list.dispatchEvent(new Event('scroll'));});
 await act(async()=>root.render(<MessageList messages={[{...message,id:'SIM-older'},message]} isLoading={false}/>));expect(list.scrollTop).toBe(400);expect(el.textContent).not.toContain('Ver novas mensagens');
});

it('follows delayed content and viewport resizing only when already at the latest message, disconnecting on cleanup',async()=>{
 let resize!:()=>void;const disconnect=vi.fn(),observe=vi.fn();vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resize=callback;}observe=observe;disconnect=disconnect;});
 await act(async()=>root.render(<MessageList messages={[message]} isLoading={false}/>));const list=el.querySelector('[role="log"]') as HTMLDivElement;let height=1000;Object.defineProperty(list,'scrollHeight',{configurable:true,get:()=>height});Object.defineProperty(list,'clientHeight',{configurable:true,value:200});
 expect(observe).toHaveBeenCalledTimes(2);await act(async()=>resize());expect(list.scrollTop).toBe(1000);
 await act(async()=>{list.scrollTop=300;list.dispatchEvent(new Event('scroll'));});height=1500;await act(async()=>resize());expect(list.scrollTop).toBe(300);
 await act(async()=>root.render(<MessageList messages={[]} isLoading={false}/>));expect(disconnect).toHaveBeenCalledOnce();
});
