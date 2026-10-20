// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect} from 'vitest';import {ConversationRow} from '../pages/cockpit/InboxList/ConversationRow';import type {CommercialThreadSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;const thread={id:'SIM-thread',contactName:'SIM Contato',contactPhone:'+5500000000001',status:'active',journeyStage:'qualified',updatedAt:new Date().toISOString(),lastMessage:{body:'SIM mensagem',direction:'inbound'}} as CommercialThreadSummary;
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it('explains an approaching task deadline and uses a human-readable stage',async()=>{await act(async()=>root.render(<ConversationRow thread={{...thread,nextAction:{id:'SIM-task',title:'SIM retorno',status:'open',dueAt:new Date(Date.now()+3600000).toISOString(),assigneeUserId:null}}} selected={false} onSelect={()=>{}}/>));expect(container.textContent).toContain('Qualificado');expect(container.textContent).toContain('Tarefa vencida ou com prazo nas próximas 24h');expect(container.textContent).toContain('SIM retorno');expect(container.querySelector('[aria-label="Última mensagem recebida do cliente"]')).not.toBeNull();});
it('does not attribute a human handoff to AI without evidence or mark a closed task urgent',async()=>{await act(async()=>root.render(<ConversationRow thread={{...thread,status:'waiting_human'}} selected={false} onSelect={()=>{}}/>));expect(container.textContent).toContain('Aguardando atendimento humano');expect(container.querySelector('[title="Transbordo Solicitado pela IA"]')).toBeNull();await act(async()=>root.render(<ConversationRow thread={{...thread,status:'closed',nextAction:{id:'SIM-task',title:'SIM return',status:'open',dueAt:new Date(Date.now()-3600000).toISOString(),assigneeUserId:null}}} selected={false} onSelect={()=>{}}/>));expect(container.textContent).not.toContain('Tarefa vencida');});

it('uses the company stage label in the queue',async()=>{await act(async()=>root.render(<ConversationRow thread={thread} customStages={{qualified:'SIM Diagnóstico confirmado'}} selected={false} onSelect={()=>{}}/>));expect(container.textContent).toContain('SIM Diagnóstico confirmado');expect(container.textContent).not.toContain('qualified');});
it.each(['','   '])('distinguishes an existing message without text from an empty conversation: %s',async body=>{
 await act(async()=>root.render(<ConversationRow thread={{...thread,lastMessage:{...thread.lastMessage!,body}}} selected={false} onSelect={()=>{}}/>));
 expect(container.textContent).toContain('Mensagem sem texto');expect(container.textContent).not.toContain('Sem mensagens');
 expect(container.querySelector('[aria-label="Última mensagem recebida do cliente"]')).not.toBeNull();
});
it('uses the empty-conversation preview only when there is no last message',async()=>{
 await act(async()=>root.render(<ConversationRow thread={{...thread,lastMessage:null}} selected={false} onSelect={()=>{}}/>));
 expect(container.textContent).toContain('Sem mensagens');expect(container.textContent).not.toContain('Mensagem sem texto');
});
