// @vitest-environment happy-dom
import {act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect} from 'vitest';import {WebhookJobList} from '../pages/settings/WebhookJobList';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('explains confirmed, uncertain, suspended and unknown results without claiming downstream completion',async()=>{
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 try{await act(async()=>root.render(<WebhookJobList jobs={['delivered','uncertain','suspended','dead_letter','failed','processing','pending','SIM-new-status'].map((status,i)=>({id:`SIM-${i}`,event_type:'proposal.created',status,attempts:i,error_message:'SIM diagnostic'}))}/>));expect(el.textContent).toContain('Cada página traz até 50 registros');expect(el.textContent).toContain('Isso não comprova que a automação externa concluiu');expect(el.textContent).toContain('O destino pode ter processado');expect(el.textContent).toContain('Reativá-la não libera esta pendência automaticamente');expect(el.textContent).toContain('Estado não reconhecido');expect(el.querySelectorAll('li')).toHaveLength(8);expect(el.querySelectorAll('details')).toHaveLength(8);expect(Array.from(el.querySelectorAll('details')).every(d=>!d.open)).toBe(true);expect(el.querySelector('li')?.textContent).toContain('Proposta criada');}
 finally{await act(async()=>root.unmount());el.remove();}
});
it('reports an empty query and never formats invalid attempts as a real count',async()=>{
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);try{await act(async()=>root.render(<WebhookJobList jobs={[]}/>));expect(el.textContent).toContain('Nenhum evento encontrado nesta consulta');await act(async()=>root.render(<WebhookJobList jobs={[{id:'SIM',event_type:'SIM-custom-event',status:'uncertain',attempts:-1,error_message:null}]}/>));expect(el.textContent).toContain('Quantidade de tentativas indisponível');expect(el.textContent).not.toContain('-1 tentativa');}finally{await act(async()=>root.unmount());el.remove();}
});

it('marks partial pages without claiming an empty or complete global queue',async()=>{
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);try{await act(async()=>root.render(<WebhookJobList jobs={[]} hasMore/>));expect(el.textContent).toContain('Ainda há páginas anteriores');expect(el.textContent).not.toContain('Nenhum evento encontrado nesta consulta.');expect(el.textContent).not.toContain('Fim das páginas desta consulta.');}finally{await act(async()=>root.unmount());el.remove();}
});

it.each(['constructor','toString','__proto__'])('shows explicit unknown state and event for inherited object key %s',async key=>{
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 try{await act(async()=>root.render(<WebhookJobList jobs={[{id:'SIM-inherited',event_type:key,status:key,attempts:0,error_message:null}]}/>));
 expect(el.querySelector('strong')?.textContent).toBe('Evento não reconhecido');expect(el.textContent).toContain('Estado não reconhecido');expect(el.textContent).toContain('Não presuma conclusão');expect(el.querySelector('details')?.textContent).toContain(`Tipo: ${key} · Estado: ${key}`);
 }finally{await act(async()=>root.unmount());el.remove();}
});
