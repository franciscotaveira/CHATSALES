// @vitest-environment happy-dom
import {act,useState} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {Composer} from '../pages/cockpit/Conversation/Composer';import {channelSendBlockReason} from '../pages/cockpit/utils/channelSendAvailability';import type {ChannelSummary,CommercialThreadSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
const channel={id:'SIM-channel',provider:'waha',isActive:true,status:'connected'} as ChannelSummary;
const thread={channelInstanceId:'SIM-channel'} as CommercialThreadSummary;
it.each([{checking:true},{error:'SIM query error'},{channels:[]},{channel:{...channel,isActive:false}},{channel:{...channel,status:'unconfigured'}},{access:true}])('does not infer send availability from an incomplete or unavailable channel state: %j',args=>{
 const state=args as {checking?:boolean;error?:string;channels?:ChannelSummary[];channel?:ChannelSummary;access?:boolean};expect(channelSendBlockReason(thread,state.channels??[state.channel??channel],Boolean(state.checking),state.error??null,Boolean(state.access))).toBeTruthy();
});
it('recognizes an active connected channel without treating the observation as delivery proof',()=>{expect(channelSendBlockReason(thread,[channel],false,null)).toBeNull();});
it('keeps the composer editable, blocks click and Enter, and preserves the draft when availability recovers',async()=>{
 const send=vi.fn(),refresh=vi.fn();function Harness({blocked=true}:{blocked?:boolean}){const [draft,setDraft]=useState('SIM rascunho');return <Composer draft={draft} onDraftChange={setDraft} onSend={send} isSending={false} windowInfo={{isOpen:true,hoursRemaining:0,badgeText:'SIM estado',badgeVariant:'danger',sendBlockedReason:blocked?'SIM canal desconectado':undefined}} onOpenTemplates={()=>{}} onRefreshChannel={refresh}/>;}
 await act(async()=>root.render(<Harness/>));const field=el.querySelector('textarea')!;const button=()=>Array.from(el.querySelectorAll('button')).find(node=>node.textContent==='Enviar')!;expect(field.disabled).toBe(false);expect(button().disabled).toBe(true);await act(async()=>{field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));button().click();});expect(send).not.toHaveBeenCalled();await act(async()=>Array.from(el.querySelectorAll('button')).find(node=>node.textContent==='Atualizar disponibilidade')!.click());expect(refresh).toHaveBeenCalledOnce();
 await act(async()=>root.render(<Harness blocked={false}/>));expect(field.value).toBe('SIM rascunho');expect(button().disabled).toBe(false);await act(async()=>button().click());expect(send).toHaveBeenCalledOnce();
});

it('does not suggest sending a template to solve an unavailable channel even when the Meta window is closed',async()=>{
 await act(async()=>root.render(<Composer draft="SIM conteúdo" onDraftChange={()=>{}} onSend={vi.fn()} isSending={false} windowInfo={{isOpen:false,hoursRemaining:0,badgeText:'SIM janela',badgeVariant:'danger',sendBlockedReason:'SIM canal indisponível'}} onOpenTemplates={vi.fn()}/>));expect(el.querySelector('textarea')?.value).toBe('SIM conteúdo');expect(el.textContent).toContain('SIM canal indisponível');expect(el.textContent).not.toContain('Janela de 24h fechada');expect(Array.from(el.querySelectorAll('button')).find(node=>node.textContent==='Enviar Modelo')).toBeUndefined();expect(Array.from(el.querySelectorAll('button')).find(node=>node.textContent==='Enviar')?.disabled).toBe(true);
});

it('does not send while confirming composed text, holding Enter, or inserting a line break',async()=>{
 const send=vi.fn();await act(async()=>root.render(<Composer draft="SIM mensagem" onDraftChange={()=>{}} onSend={send} isSending={false} windowInfo={{isOpen:true,hoursRemaining:10,badgeText:'SIM aberta',badgeVariant:'action'}} onOpenTemplates={()=>{}}/>));
 const field=el.querySelector('textarea')!;
 for(const options of [{isComposing:true},{keyCode:229},{repeat:true},{shiftKey:true}])await act(async()=>field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options})));
 expect(send).not.toHaveBeenCalled();expect(field.value).toBe('SIM mensagem');
 await act(async()=>field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(send).toHaveBeenCalledOnce();
});
