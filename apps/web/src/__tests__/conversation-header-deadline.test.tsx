// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ConversationHeader} from '../pages/cockpit/Conversation/ConversationHeader';
import type {CommercialThreadSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.useRealTimers();});
const view=(fepExpiresAt:string|null)=><ConversationHeader thread={{id:'SIM-thread',contactName:'SIM cliente',contactPhone:'+5500000000001',fepExpiresAt} as CommercialThreadSummary}/>;
it('places mobile opening focus on the conversation heading',async()=>{
 await act(async()=>root.render(<ConversationHeader isMobile thread={{id:'SIM-thread',contactName:'SIM cliente',contactPhone:'+5500000000001'} as CommercialThreadSummary}/>));
 expect(document.activeElement).toBe(el.querySelector('h2'));expect(document.activeElement?.textContent).toBe('SIM cliente');
});
it('preserves another active control when a mobile conversation finishes loading',async()=>{
 const other=document.createElement('button');document.body.append(other);other.focus();
 try{await act(async()=>root.render(<ConversationHeader isMobile thread={{id:'SIM-thread',contactName:'SIM cliente',contactPhone:'+5500000000001'} as CommercialThreadSummary}/>));expect(document.activeElement).toBe(other);}finally{other.remove();}
});
it.each([null,undefined,'','   '])('does not invent a handoff reason when absent: %s',async handoffReason=>{
 await act(async()=>root.render(<ConversationHeader thread={{id:'SIM-thread',contactName:'SIM cliente',contactPhone:'+5500000000001',status:'waiting_human',handoffReason} as CommercialThreadSummary}/>));
 expect(el.textContent).toContain('Cliente aguardando atendimento humano');
 expect(el.textContent).toContain('Motivo não informado.');
 expect(el.textContent).not.toContain('ausente do catálogo/FAQ');
});
it('shows the recorded handoff reason without replacing it with a generic explanation',async()=>{
 await act(async()=>root.render(<ConversationHeader thread={{id:'SIM-thread',contactName:'SIM cliente',contactPhone:'+5500000000001',status:'waiting_human',handoffReason:'Cliente pediu para falar com a equipe.'} as CommercialThreadSummary}/>));
 expect(el.textContent).toContain('Cliente pediu para falar com a equipe.');
 expect(el.textContent).not.toContain('Motivo não informado.');
});
it('shows the precise provider deadline even when only five minutes remain',async()=>{
 await act(async()=>root.render(view('2026-10-18T12:05:00Z')));expect(el.textContent).toContain('Anúncio · até');const time=el.querySelector('time')!;expect(time.dateTime).toBe('2026-10-18T12:05:00.000Z');expect(time.textContent).toMatch(/2026.*\d{2}:\d{2}/);expect(time.parentElement?.title).toContain('não autoriza envio');expect(el.textContent).not.toContain('1 dia');
});
it.each([null,'invalid-date','2026-10-18T11:59:59Z','2026-10-18T12:00:00Z'])('does not show an invalid or expired deadline as future: %s',async value=>{
 await act(async()=>root.render(view(value)));expect(el.querySelector('time')).toBeNull();expect(el.textContent).not.toContain('Anúncio · até');expect(el.textContent).toContain('SIM cliente');
});

it('removes an elapsed announcement deadline without waiting for a parent refresh',async()=>{
 await act(async()=>root.render(view('2026-10-18T12:05:00Z')));expect(el.querySelector('time')).not.toBeNull();
 await act(async()=>vi.advanceTimersByTime(5*60*1000));expect(el.querySelector('time')).toBeNull();expect(el.textContent).not.toContain('Anúncio · até');
});
it('clears its deadline timer when the conversation no longer has an announcement deadline',async()=>{
 await act(async()=>root.render(view('2026-10-18T12:05:00Z')));expect(vi.getTimerCount()).toBe(1);await act(async()=>root.render(view(null)));expect(vi.getTimerCount()).toBe(0);
});
it('supports distant deadlines without overflowing the browser timer range',async()=>{
 await act(async()=>root.render(view('2026-12-18T12:00:00Z')));await act(async()=>vi.advanceTimersByTime(2147483647));expect(el.querySelector('time')).not.toBeNull();expect(vi.getTimerCount()).toBe(1);
});
