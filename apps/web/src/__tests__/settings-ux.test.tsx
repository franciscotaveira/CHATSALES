// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { TeamSection } from "../pages/settings/TeamSection";
import { TeamReassignmentQueue } from "../pages/settings/TeamReassignmentQueue";
import { IntegrationsSection } from "../pages/settings/IntegrationsSection";
import { AiAgentSection } from "../pages/settings/AiAgentSection";
import { apiClient } from "../services/api-client";
import type { UseSessionReturn } from "../hooks/useSession";
vi.mock('../pages/settings/GuidedAgentSetup',()=>({GuidedAgentSetup:()=>null}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root:Root,container:HTMLDivElement;
const session=(id:string)=>({activeWorkspace:{id,name:`Empresa ${id}`,role:"owner"},token:'synthetic',user:{id:'owner',email:'owner@example.test'}}) as UseSessionReturn;
const owner={id:'membership',userId:'owner',name:'Proprietário simulado',email:'owner@example.test',role:'owner' as const,joinedAt:'2026-10-17T12:00:00Z'};
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
async function input(el:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{vi.spyOn(apiClient,'getTeamPendingWork').mockResolvedValue({items:[],nextCursor:null});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
describe('Settings interaction and company isolation',()=>{
 it.each([{}, {success:false}, {success:'true'}])('keeps pending work and blocks repetition when assignment is not confirmed: %j',async(result)=>{
  vi.mocked(apiClient.getTeamPendingWork).mockResolvedValue({items:[{id:'SIM-work',kind:'task',title:'SIM tarefa',threadId:null,contactName:null,changedAt:'2026-10-18T12:00:00Z'}],nextCursor:null});
  const assign=vi.spyOn(apiClient,'assignTeamPendingWork').mockResolvedValue(result as never);
  await act(async()=>root.render(<TeamReassignmentQueue workspaceId="a" token="synthetic" members={[owner]} reloadKey={0}/>));
  const select=container.querySelector('select')!;await act(async()=>{select.value=owner.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>button('Atribuir responsável').click());
  expect(container.querySelector('article')).not.toBeNull();expect(container.textContent).toContain('A atribuição não foi confirmada');expect(container.textContent).not.toContain('Responsável atribuído a');expect(button('Atribuir responsável').disabled).toBe(true);
  await act(async()=>button('Atribuir responsável').click());expect(assign).toHaveBeenCalledTimes(1);
 });
 it('removes pending work only after a confirmed assignment',async()=>{
  vi.mocked(apiClient.getTeamPendingWork).mockResolvedValue({items:[{id:'SIM-work',kind:'task',title:'SIM tarefa',threadId:null,contactName:null,changedAt:'2026-10-18T12:00:00Z'}],nextCursor:null});
  vi.spyOn(apiClient,'assignTeamPendingWork').mockResolvedValue({success:true});
  await act(async()=>root.render(<TeamReassignmentQueue workspaceId="a" token="synthetic" members={[owner]} reloadKey={0}/>));
  const select=container.querySelector('select')!;await act(async()=>{select.value=owner.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Atribuir responsável').click());
  expect(container.querySelector('article')).toBeNull();expect(container.textContent).toContain('Responsável atribuído a SIM tarefa');
 });
 it('opens the team dialog with focus and keeps save failure visible inside it',async()=>{
  vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);
  vi.spyOn(apiClient,'addWorkspaceMember').mockRejectedValue(new Error('Falha simulada ao cadastrar'));
  await act(async()=>root.render(<TeamSection session={session('a')}/>));
  const opener=button('Adicionar Membro');opener.focus();await act(async()=>opener.click());
  const dialog=document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();expect(dialog.contains(document.activeElement)).toBe(true);
  await input(dialog.querySelector('input')!,'Nome simulado');await input(dialog.querySelector('input[type="email"]')!,'member@example.test');
  await act(async()=>dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(dialog.textContent).toContain('Falha simulada ao cadastrar');expect(dialog.querySelector('input')!.value).toBe('Nome simulado');
  await act(async()=>dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();await act(async()=>button('Descartar alterações').click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(opener);
 });
 it('protects owner and self in the team UI instead of exposing a global password reset',async()=>{
  vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);const update=vi.spyOn(apiClient,'updateWorkspaceMember');await act(async()=>root.render(<TeamSection session={session('a')}/>));expect(button('Editar / Senha')).toBeUndefined();expect(button('Alterar perfil')).toBeUndefined();expect(update).not.toHaveBeenCalled();
 });
 it('rejects the previous company member response',async()=>{
  const old=deferred<never>();vi.spyOn(apiClient,'getWorkspaceMembers').mockReturnValueOnce(old.promise).mockResolvedValue({members:[]} as never);
  await act(async()=>root.render(<TeamSection session={session('old')}/>));await act(async()=>root.render(<TeamSection session={session('new')}/>));
  await act(async()=>old.resolve({members:[owner]} as never));expect(container.textContent).not.toContain('owner@example.test');
 });
 it('shows webhook query errors without pretending there are no subscriptions and clears on retry',async()=>{
  vi.spyOn(apiClient,'listWebhooks').mockRejectedValueOnce(new Error('Falha simulada de consulta')).mockResolvedValue({webhooks:[]} as never);
  await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));
  expect(container.textContent).toContain('Falha simulada de consulta');expect(container.textContent).not.toContain('Nenhum webhook de saída cadastrado');
  await act(async()=>button('Tentar novamente').click());expect(container.textContent).not.toContain('Falha simulada de consulta');expect(container.textContent).toContain('Nenhum webhook de saída cadastrado');
 });
 it('rejects a late webhook response and closes company-specific forms when switching',async()=>{
  const old=deferred<never>();vi.spyOn(apiClient,'listWebhooks').mockReturnValueOnce(old.promise).mockResolvedValue({webhooks:[]} as never);
  await act(async()=>root.render(<IntegrationsSection session={session('old')}/>));await act(async()=>button('Novo Webhook').click());
  await act(async()=>root.render(<IntegrationsSection session={session('new')}/>));
  await act(async()=>old.resolve({webhooks:[{id:'old',url:'https://old.example.test',events:['*'],is_active:false}]} as never));
  expect(container.textContent).not.toContain('https://old.example.test');expect(container.textContent).not.toContain('Cadastrar Novo Destino');
 });
 it('exposes selected webhook events and rejects a non-HTTP destination locally',async()=>{
  vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const create=vi.spyOn(apiClient,'createWebhook');
  await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());
  expect(button('Todos os Eventos (*)').getAttribute('aria-pressed')).toBe('true');
  await input(document.querySelector('input[type="url"]')!,'javascript:alert(1)');
  await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(create).not.toHaveBeenCalled();expect(container.textContent).toContain('URL HTTP ou HTTPS válida');
 });
 it('blocks the AI form after a failed load and recovers through retry',async()=>{
  vi.spyOn(apiClient,'getAiAgentConfig').mockRejectedValueOnce(new Error('Configuração indisponível')).mockResolvedValue({config:{enabled:false,name:'IA da empresa atual',skills:{}}} as never);
  await act(async()=>root.render(<AiAgentSection workspaceId="a" token="synthetic"/>));
  expect(container.textContent).toContain('Configuração indisponível');expect(container.querySelector('input')).toBeNull();
  await act(async()=>button('Tentar novamente').click());
  expect(container.querySelector('input[placeholder="Ex.: Camila, Sofia, Lucas..."]')?.getAttribute('value')).not.toBe('IA de outra empresa');
  expect(Array.from(container.querySelectorAll('input')).some(x=>x.value==='IA da empresa atual')).toBe(true);
 });
 it('does not display the previous company AI configuration after switching',async()=>{
  const old=deferred<never>();vi.spyOn(apiClient,'getAiAgentConfig').mockReturnValueOnce(old.promise).mockResolvedValue({config:{enabled:false,name:'IA atual',skills:{}}} as never);
  await act(async()=>root.render(<AiAgentSection workspaceId="old" token="synthetic"/>));
  await act(async()=>root.render(<AiAgentSection workspaceId="new" token="synthetic"/>));
  await act(async()=>old.resolve({config:{enabled:true,name:'IA de outra empresa',skills:{}}} as never));
  expect(Array.from(container.querySelectorAll('input')).some(x=>x.value==='IA atual')).toBe(true);
  expect(Array.from(container.querySelectorAll('input')).some(x=>x.value==='IA de outra empresa')).toBe(false);
 });
 it('shows manager a read-only team and never offers access changes',async()=>{
  vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[{...owner,userId:'other'}]} as never);await act(async()=>root.render(<TeamSection session={{...session('a'),activeWorkspace:{id:'a',name:'SIM',role:'manager'}}}/>));expect(button('Adicionar Membro')).toBeUndefined();expect(button('Alterar perfil')).toBeUndefined();expect(button('Remover')).toBeUndefined();expect(container.textContent).toContain('Somente proprietário');
 });
 it('does not represent an existing account as a newly assigned password',async()=>{
  vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);vi.spyOn(apiClient,'addWorkspaceMember').mockResolvedValue({member:{...owner,id:'SIM-new-membership',userId:'new',email:'existing@example.test',role:'operator' as const},accountCreated:false});await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const dialog=document.querySelector('[role="dialog"]')!;await input(dialog.querySelector('input')!,'SIM existente');await input(dialog.querySelector('input[type="email"]')!,'existing@example.test');await act(async()=>dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(dialog.textContent).toContain('a senha atual foi preservada');expect(dialog.textContent).not.toContain('Senha Inicial:');
 });
 it('reviews removal in an accessible dialog and sends the observed role only after confirmation',async()=>{
  const target={...owner,userId:'SIM-target',id:'SIM-membership',role:'operator',name:'SIM colega',email:'sim-colega@example.test'};vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,target]} as never);const remove=vi.spyOn(apiClient,'removeWorkspaceMember').mockResolvedValue({success:true,pendingReassignment:{tasks:2,opportunities:1}});await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Remover').click());expect(remove).not.toHaveBeenCalled();expect(document.querySelector('[role="dialog"]')?.textContent).toContain('SIM colega');await act(async()=>button('Confirmar remoção do acesso').click());expect(remove.mock.calls[0]?.slice(0,3)).toEqual(['a','SIM-target','operator']);expect(container.textContent).toContain('2 tarefa(s) e 1 oportunidade(s)');
 });

 it('ignores credentials from a prior visit even after switching away and back to the same company',async()=>{
  const wait=deferred<never>();vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);vi.spyOn(apiClient,'addWorkspaceMember').mockReturnValue(wait.promise);await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const dialog=document.querySelector('[role="dialog"]')!;await input(dialog.querySelector('input')!,'SIM novo');await input(dialog.querySelector('input[type="email"]')!,'sim-novo@example.test');await act(async()=>dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await act(async()=>root.render(<TeamSection session={session('b')}/>));await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>wait.resolve({member:owner,initialPassword:'SIM_SENHA_ANTIGA'} as never));expect(container.textContent).not.toContain('SIM_SENHA_ANTIGA');expect(document.querySelector('[role="dialog"]')).toBeNull();expect(button('Adicionar Membro').disabled).toBe(false);
 });

});

it('never expands an empty webhook selection to all events and submits only the explicit scope',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const pending=deferred<never>();const create=vi.spyOn(apiClient,'createWebhook').mockReturnValue(pending.promise);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());await input(document.querySelector('input[type=url]')!,'https://sim.example.test/events');
 await act(async()=>button('Novo Lead Criado').click());await act(async()=>button('Novo Lead Criado').click());expect(button('Todos os Eventos (*)').getAttribute('aria-pressed')).toBe('false');expect(button('Salvar Webhook inativo').disabled).toBe(true);expect(container.textContent).toContain('Nenhum evento selecionado');
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).not.toHaveBeenCalled();
 await act(async()=>button('Todos os Eventos (*)').click());expect(button('Todos os Eventos (*)').getAttribute('aria-pressed')).toBe('true');await act(async()=>button('Todos os Eventos (*)').click());expect(button('Salvar Webhook inativo').disabled).toBe(true);
 await act(async()=>button('Proposta Comercial Criada').click());await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledWith('a',expect.objectContaining({events:['proposal.created']}),expect.anything());expect(button('Todos os Eventos (*)').disabled).toBe(true);expect(document.querySelector<HTMLInputElement>('input[type=url]')!.disabled).toBe(true);await act(async()=>pending.resolve({webhook:{id:'SIM-created',url:'https://sim.example.test/events',events:['proposal.created'],is_active:false,supports_idempotency:false}} as never));
});

it('serializes webhook creation before React renders the pending state',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const pending=deferred<never>();const create=vi.spyOn(apiClient,'createWebhook').mockReturnValue(pending.promise);await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());await input(document.querySelector('input[type=url]')!,'https://sim.example.test/events');await act(async()=>{const form=document.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(create).toHaveBeenCalledOnce();await act(async()=>pending.resolve({webhook:{id:'SIM-created',url:'https://sim.example.test/events',events:['*'],is_active:false,supports_idempotency:false}} as never));
});
it('does not activate or query jobs concurrently with an explicit ping, and recovers after it finishes',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);const pending=deferred<never>();const ping=vi.spyOn(apiClient,'testWebhook').mockReturnValue(pending.promise);const activate=vi.spyOn(apiClient,'setWebhookActive').mockResolvedValue({webhook:{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:true}} as never);const jobs=vi.spyOn(apiClient,'listWebhookJobs');await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>{button('Testar (Ping)').click();button('Testar (Ping)').click();button('Ativar após teste').click();button('Consultar fila').click();});expect(ping).toHaveBeenCalledOnce();expect(activate).not.toHaveBeenCalled();expect(jobs).not.toHaveBeenCalled();await act(async()=>pending.resolve({success:true,status:"delivered",statusCode:200,durationMs:10} as never));await act(async()=>button('Ativar após teste').click());expect(activate).not.toHaveBeenCalled();await act(async()=>button('Confirmar ativação').click());expect(activate).toHaveBeenCalledOnce();
});

it('does not release the current company operation when an old company request finishes',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);const old=deferred<never>(),current=deferred<never>();const ping=vi.spyOn(apiClient,'testWebhook').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);const activate=vi.spyOn(apiClient,'setWebhookActive');await act(async()=>root.render(<IntegrationsSection session={session('old')}/>));await act(async()=>button('Testar (Ping)').click());await act(async()=>root.render(<IntegrationsSection session={session('current')}/>));await act(async()=>button('Testar (Ping)').click());await act(async()=>old.resolve({success:true,status:"delivered",statusCode:200,durationMs:1} as never));expect(button('Ativar após teste').disabled).toBe(true);await act(async()=>button('Ativar após teste').click());expect(activate).not.toHaveBeenCalled();expect(ping).toHaveBeenCalledTimes(2);await act(async()=>current.resolve({success:true,status:"delivered",statusCode:200,durationMs:2} as never));expect(button('Ativar após teste').disabled).toBe(false);
});

it('hides webhook secrets in the listing and ignores late clipboard feedback after changing company',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false,secret:'SIM_SECRET_NOT_FOR_SCREEN'}]} as never);const pending=deferred<void>();const copy=vi.spyOn(navigator.clipboard,'writeText').mockReturnValue(pending.promise);await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(container.textContent).not.toContain('SIM_SECRET');const secretButton=()=>document.querySelector<HTMLButtonElement>('button[aria-label^="Copiar segredo"]')!;await act(async()=>secretButton().click());expect(copy).toHaveBeenCalledWith('SIM_SECRET_NOT_FOR_SCREEN');await act(async()=>root.render(<IntegrationsSection session={session('b')}/>));await act(async()=>pending.resolve());expect(container.textContent).not.toContain('Copiado');
});
it('disables unavailable secret copy instead of writing an empty clipboard value',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);const copy=vi.spyOn(navigator.clipboard,'writeText');await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));const control=document.querySelector<HTMLButtonElement>('button[aria-label^="Copiar segredo"]')!;expect(control.disabled).toBe(true);await act(async()=>control.click());expect(copy).not.toHaveBeenCalled();expect(container.textContent).toContain('Indisponível para este acesso');
});

it('loads older webhook events and preserves the consulted page when loading more fails',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);const job=(id:string)=>({id,event_type:'lead.created',status:'suspended',attempts:0,error_message:null});const cursor={createdAt:'2026-10-17T12:00:00.123456Z',id:'SIM-cursor'};const query=vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValueOnce({jobs:[job('SIM-first')],pagination:{hasMore:true,nextCursor:cursor}}).mockRejectedValueOnce(new Error('SIM page failure')).mockResolvedValueOnce({jobs:[job('SIM-first'),job('SIM-older')],pagination:{hasMore:false,nextCursor:null}});await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());await act(async()=>button('Carregar eventos anteriores').click());expect(container.textContent).toContain('SIM page failure');expect(container.textContent).toContain('SIM-first');expect(button('Carregar eventos anteriores')).toBeDefined();await act(async()=>button('Carregar eventos anteriores').click());expect(query).toHaveBeenLastCalledWith('a','SIM-hook',{token:'synthetic'},cursor);expect(container.querySelectorAll('section[aria-label="Eventos consultados da integração"] li')).toHaveLength(2);expect(button('Carregar eventos anteriores')).toBeUndefined();
});

it('keeps reassignment unavailable until members are confirmed and after a failed refresh',async()=>{
 const wait=deferred<never>();const members=vi.spyOn(apiClient,'getWorkspaceMembers').mockReturnValueOnce(wait.promise).mockRejectedValue(new Error('SIM equipe indisponível'));
 vi.mocked(apiClient.getTeamPendingWork).mockResolvedValue({items:[{id:'SIM-work',kind:'task',title:'SIM tarefa',threadId:'SIM-thread',contactName:'SIM cliente',changedAt:'2026-10-17T12:00:00Z'}],nextCursor:null});
 const assign=vi.spyOn(apiClient,'assignTeamPendingWork');await act(async()=>root.render(<TeamSection session={session('a')}/>));expect(container.textContent).toContain('lista da equipe ainda não foi confirmada');expect(button('Atribuir responsável').disabled).toBe(true);
 await act(async()=>wait.resolve({members:[owner]} as never));expect(container.textContent).not.toContain('lista da equipe ainda não foi confirmada');
 await act(async()=>{const select=container.querySelector('select')!;select.value=owner.userId;select.dispatchEvent(new Event('change',{bubbles:true}));});expect(button('Atribuir responsável').disabled).toBe(false);
 await act(async()=>button('Atualizar equipe').click());expect(members).toHaveBeenCalledTimes(2);expect(container.textContent).toContain('lista da equipe ainda não foi confirmada');expect(button('Atribuir responsável').disabled).toBe(true);expect(assign).not.toHaveBeenCalled();
});

it('shows the effect of a profile change before submission and blocks an unchanged profile',async()=>{
 const target={...owner,userId:'SIM-target',id:'SIM-membership',role:'manager' as const,name:'SIM gerente',email:'sim-gerente@example.invalid'};
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,target]} as never);const update=vi.spyOn(apiClient,'updateWorkspaceMember');
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Alterar perfil').click());expect(button('Salvar Alterações').disabled).toBe(true);
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(update).not.toHaveBeenCalled();
 await act(async()=>{const select=document.querySelector<HTMLSelectElement>('select[aria-label="Cargo e nível de acesso do membro"]')!;select.value='admin';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const preview=document.querySelector('[aria-label="Permissões do perfil selecionado"]')!;
 expect(preview.textContent).toContain('Será liberado ao salvar:');expect(preview.textContent).toContain('Gerenciar configurações da empresa e acessos');expect(preview.textContent).toContain('Despachar conversões');expect(button('Salvar Alterações').disabled).toBe(false);expect(update).not.toHaveBeenCalled();
 await act(async()=>{const select=document.querySelector<HTMLSelectElement>('select[aria-label="Cargo e nível de acesso do membro"]')!;select.value='operator';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(preview.textContent).toContain('Será retirado ao salvar:');expect(preview.textContent).toContain('Consultar auditoria');expect(preview.textContent).not.toContain('Será liberado ao salvar:');
});
it('offers a permission preview for a new member without creating access',async()=>{
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);const create=vi.spyOn(apiClient,'addWorkspaceMember');await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());
 const preview=document.querySelector('[aria-label="Permissões do perfil selecionado"]')!;expect(preview.textContent).toContain('somente a esta empresa');expect(preview.textContent).toContain('Enviar mensagens de atendimento');expect(preview.textContent).toContain('Registrar ganho ou perda');expect(preview.textContent).not.toContain('Gerenciar configurações da empresa e acessos');expect(create).not.toHaveBeenCalled();
});

it('keeps queue failures beside preserved events and clears loading after retry',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);
 const first=deferred<never>();const query=vi.spyOn(apiClient,'listWebhookJobs').mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('SIM queue unavailable')).mockResolvedValue({jobs:[],pagination:{hasMore:false,nextCursor:null}});
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());expect(container.textContent).toContain('Consultando eventos desta integração');expect(button('Consultando fila...').disabled).toBe(true);
 await act(async()=>first.resolve({jobs:[{id:'SIM-event',event_type:'lead.created',status:'uncertain',attempts:1,error_message:null}],pagination:{hasMore:true,nextCursor:{createdAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'}}} as never));
 expect(button('Consultar fila').disabled).toBe(false);expect(container.textContent).toContain('Última página recebida:');expect(container.textContent).toContain('Há eventos anteriores ainda não carregados.');
 await act(async()=>button('Consultar fila').click());const alert=document.querySelector('[role="alert"]')!;expect(alert.textContent).toContain('SIM queue unavailable');expect(alert.textContent).toContain('eventos exibidos foram preservados');expect(container.textContent).toContain('SIM-event');
 await act(async()=>button('Consultar fila').click());expect(container.textContent).not.toContain('SIM queue unavailable');expect(container.textContent).not.toContain('SIM-event');expect(container.textContent).toContain('Fim das páginas desta consulta.');expect(query).toHaveBeenCalledTimes(3);
});
it('does not present an initial queue failure as an empty queue',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:[],is_active:false}]} as never);vi.spyOn(apiClient,'listWebhookJobs').mockRejectedValue(new Error('SIM first failure'));await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());expect(container.textContent).toContain('fila ainda não foi consultada com sucesso');expect(container.textContent).not.toContain('Nenhum evento encontrado nesta consulta');expect(container.textContent).not.toContain('Última página recebida:');
});

it('replaces an older successful ping with the pending or unconfirmed new attempt',async()=>{
 const hook={id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false,updated_at:'2026-10-17T12:00:00Z'};vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[hook]} as never);
 let reject!:(error:Error)=>void;const wait=new Promise<never>((_,fail)=>{reject=fail;});
 vi.spyOn(apiClient,'testWebhook').mockResolvedValueOnce({success:true,status:"delivered",statusCode:200,durationMs:10} as never).mockReturnValueOnce(wait);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Testar (Ping)').click());expect(container.textContent).toContain('Destino respondeu HTTP 200');expect(container.textContent).toContain('Teste consultado em');
 await act(async()=>button('Testar (Ping)').click());expect(container.textContent).not.toContain('Destino respondeu HTTP 200');expect(container.textContent).toContain('Aguardando o resultado deste teste');
 await act(async()=>reject(new Error('SIM network uncertainty')));expect(container.textContent).not.toContain('Destino respondeu HTTP 200');expect(container.textContent).toContain('resultado desta tentativa não foi confirmado');expect(container.textContent).toContain('Não foi possível confirmar a resposta do servidor');
});
it('does not reuse a ping result after the destination configuration changes',async()=>{
 const hook={id:'SIM-hook',url:'https://sim.example.test/old',events:[],is_active:true,updated_at:'2026-10-17T12:00:00Z'};const list=vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[hook]} as never);vi.spyOn(apiClient,'testWebhook').mockResolvedValue({success:true,status:"delivered",statusCode:200,durationMs:10} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Testar (Ping)').click());expect(container.textContent).toContain('Destino respondeu HTTP 200');
 list.mockResolvedValue({webhooks:[{...hook,url:'https://sim.example.test/new',updated_at:'2026-10-17T13:00:00Z'}]} as never);await act(async()=>button('Atualizar').click());expect(container.textContent).not.toContain('Destino respondeu HTTP 200');expect(container.textContent).not.toContain('Teste consultado em');expect(container.textContent).toContain('Envio habilitado');
});
it('labels the API reference without claiming a successful availability check',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockRejectedValue(new Error('SIM list failure'));await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(container.textContent).toContain('Referência da API');expect(container.textContent).not.toContain('API disponível');
});

it('uses one suspension action with destination review and preserves confirmed state if list refresh fails',async()=>{
 const hook={id:'SIM-hook',url:'https://sim.example.test/review',events:['lead.created'],is_active:true};const list=vi.spyOn(apiClient,'listWebhooks').mockResolvedValueOnce({webhooks:[hook]} as never).mockRejectedValue(new Error('SIM refresh unavailable'));
 const wait=deferred<never>();const change=vi.spyOn(apiClient,'setWebhookActive').mockReturnValue(wait.promise);const legacy=vi.spyOn(apiClient,'deleteWebhook');
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(button('Suspender integração')).toBeUndefined();await act(async()=>button('Suspender').click());
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain(hook.url);expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Histórico e pendências serão preservados');expect(change).not.toHaveBeenCalled();
 await act(async()=>button('Cancelar').click());expect(document.querySelector('[role="dialog"]')).toBeNull();
 await act(async()=>button('Suspender').click());await act(async()=>{button('Confirmar suspensão').click();button('Confirmar suspensão').click();});expect(change).toHaveBeenCalledTimes(1);expect(change).toHaveBeenCalledWith('a','SIM-hook',false,{token:'synthetic'},{url:hook.url,events:hook.events,isActive:true});expect(button('Cancelar').disabled).toBe(true);
 await act(async()=>wait.resolve({webhook:{...hook,is_active:false}} as never));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(container.textContent).toContain('Envio suspenso pelo servidor');expect(container.textContent).toContain('Envio suspenso');expect(container.textContent).toContain('SIM refresh unavailable');expect(legacy).not.toHaveBeenCalled();expect(list).toHaveBeenCalledTimes(2);
});
it('keeps activation failure in the review without claiming that sending was enabled',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:[],is_active:false}]} as never);const change=vi.spyOn(apiClient,'setWebhookActive').mockRejectedValue(new Error('SIM teste obrigatório'));
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Ativar após teste').click());await act(async()=>button('Confirmar ativação').click());
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain('SIM teste obrigatório');expect(container.textContent).not.toContain('Envio habilitado pelo servidor');expect(change).toHaveBeenCalledOnce();
});

it('leaves indefinite webhook loading and offers recovery when the API read expires',async()=>{
 vi.useFakeTimers();const fetch=vi.fn(()=>new Promise<Response>(()=>{}));vi.stubGlobal('fetch',fetch);
 try{await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(container.textContent).toContain('Carregando assinaturas de webhook');await act(async()=>vi.advanceTimersByTimeAsync(30_000));expect(container.textContent).not.toContain('Carregando assinaturas de webhook');expect(container.textContent).toContain('A consulta demorou mais que o esperado');expect(button('Tentar novamente').disabled).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);}
 finally{vi.unstubAllGlobals();vi.useRealTimers();}
});

it('presents readable event names while preserving codes and identifying unknown events in the review',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created','stage.changed','SIM.custom'],is_active:false}]} as never);const activate=vi.spyOn(apiClient,'setWebhookActive');await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Ativar após teste').click());const dialog=document.querySelector('[role="dialog"]')!;expect(dialog.textContent).toContain('Novo Lead Criado');expect(dialog.textContent).toContain('Mudança de Etapa / Funil');expect(dialog.textContent).toContain('Evento não reconhecido');expect(Array.from(dialog.querySelectorAll('code')).map(el=>el.textContent)).toEqual(['(lead.created)','(stage.changed)','(SIM.custom)']);expect(activate).not.toHaveBeenCalled();await act(async()=>button('Cancelar').click());expect(activate).not.toHaveBeenCalled();
});

it('preserves the complete webhook draft until explicit discard and blocks submission during review',async()=>{vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const create=vi.spyOn(apiClient,'createWebhook');await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());const form=document.querySelector('form')!;const url=form.querySelector<HTMLInputElement>('input[type="url"]')!;await input(url,'https://sim.example.invalid/webhook');await act(async()=>button('Cancelar').click());expect(form.querySelector('fieldset')!.disabled).toBe(true);expect(button('Salvar Webhook inativo').disabled).toBe(true);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(url.value).toBe('https://sim.example.invalid/webhook');expect(document.activeElement).toBe(url);await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(document.querySelector('form')).toBeNull();await act(async()=>button('Novo Webhook').click());expect(document.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe('');expect(create).not.toHaveBeenCalled();});

it('blocks webhook tests and activation on stale configuration until a successful refresh',async()=>{const hook={id:'SIM-hook',url:'https://sim.example.invalid',events:['lead.created'],is_active:false};const list=vi.spyOn(apiClient,'listWebhooks').mockResolvedValueOnce({webhooks:[hook]} as never).mockRejectedValueOnce(new Error('SIM leitura falhou')).mockResolvedValue({webhooks:[hook]} as never);const ping=vi.spyOn(apiClient,'testWebhook');const activate=vi.spyOn(apiClient,'setWebhookActive');await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(button('Testar (Ping)').disabled).toBe(false);await act(async()=>button('Atualizar').click());expect(container.textContent).toContain('registros exibidos são da consulta anterior');expect(button('Testar (Ping)').disabled).toBe(true);expect(button('Ativar após teste').disabled).toBe(true);await act(async()=>{button('Testar (Ping)').click();button('Ativar após teste').click();});expect(ping).not.toHaveBeenCalled();expect(activate).not.toHaveBeenCalled();await act(async()=>button('Tentar novamente').click());expect(list).toHaveBeenCalledTimes(3);expect(button('Testar (Ping)').disabled).toBe(false);expect(button('Ativar após teste').disabled).toBe(false);});

it('prevents duplicate webhook creation after an uncertain response and offers a list reconciliation',async()=>{const list=vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const create=vi.spyOn(apiClient,'createWebhook').mockRejectedValue(new TypeError('SIM network'));await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());const form=document.querySelector('form')!;await input(form.querySelector('input[type="url"]')!,'https://sim.example.invalid');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledOnce();expect(button('Salvar Webhook inativo').disabled).toBe(true);expect(form.querySelector('fieldset')!.disabled).toBe(true);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledOnce();await act(async()=>button('Fechar e conferir integrações').click());expect(list).toHaveBeenCalledTimes(2);expect(document.querySelector('form')).toBeNull();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();});

it('locks the member access form while the request is pending and restores inputs after rejection',async()=>{vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);let reject!:(reason:unknown)=>void;const add=vi.spyOn(apiClient,'addWorkspaceMember').mockImplementation(()=>new Promise((_,r)=>{reject=r;}));await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const form=document.querySelector('form')!;await input(form.querySelector('input')!,'SIM integrante');await input(form.querySelector('input[type="email"]')!,'sim@example.invalid');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(form.querySelector('fieldset')!.disabled).toBe(true);expect(button('Cancelar').disabled).toBe(true);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(add).toHaveBeenCalledOnce();await act(async()=>reject(new Error('SIM rejeição')));expect(form.querySelector('fieldset')!.disabled).toBe(false);expect(form.querySelector<HTMLInputElement>('input')!.value).toBe('SIM integrante');expect(form.querySelector<HTMLInputElement>('input[type="email"]')!.value).toBe('sim@example.invalid');});

it('locks profile selection during a pending change and preserves the chosen role after rejection',async()=>{const target={...owner,userId:'SIM-target',id:'SIM-membership',role:'manager' as const,name:'SIM gerente',email:'sim-gerente@example.invalid'};vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,target]} as never);let reject!:(e:unknown)=>void;const update=vi.spyOn(apiClient,'updateWorkspaceMember').mockImplementation(()=>new Promise((_,r)=>{reject=r;}));await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Alterar perfil').click());const form=document.querySelector('form')!,select=form.querySelector('select')!;await act(async()=>{select.value='operator';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(form.querySelector('fieldset')!.disabled).toBe(true);expect(button('Cancelar').disabled).toBe(true);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(update).toHaveBeenCalledExactlyOnceWith('a','SIM-target',{role:'operator',expectedRole:'manager'},expect.anything());await act(async()=>reject(new Error('SIM perfil rejeitado')));expect(form.querySelector('fieldset')!.disabled).toBe(false);expect(select.value).toBe('operator');expect(document.querySelector('[role="dialog"]')?.textContent).toContain('SIM perfil rejeitado');});

it('reviews an unsaved member draft before closing and restores focus without granting access',async()=>{vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);const add=vi.spyOn(apiClient,'addWorkspaceMember');await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const form=document.querySelector('form')!,name=form.querySelector<HTMLInputElement>('input')!;await input(name,'SIM rascunho');await act(async()=>button('Cancelar').click());expect(form.querySelector('fieldset')!.disabled).toBe(true);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(add).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(name.value).toBe('SIM rascunho');expect(document.activeElement).toBe(name);await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(document.querySelector('[role="dialog"]')).toBeNull();await act(async()=>button('Adicionar Membro').click());expect(document.querySelector<HTMLInputElement>('form input')!.value).toBe('');expect(add).not.toHaveBeenCalled();});

it('preserves a selected profile until explicit discard without changing access',async()=>{const target={...owner,userId:'SIM-target',id:'SIM-membership',role:'manager' as const,name:'SIM gerente',email:'sim-gerente@example.invalid'};vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,target]} as never);const update=vi.spyOn(apiClient,'updateWorkspaceMember');await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Alterar perfil').click());const form=document.querySelector('form')!,select=form.querySelector('select')!;await act(async()=>{select.value='operator';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Cancelar').click());expect(form.querySelector('fieldset')!.disabled).toBe(true);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(update).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(select.value).toBe('operator');expect(document.activeElement).toBe(select);await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(update).not.toHaveBeenCalled();});

it('requires a confirmed team query before exposing access mutations and recovers after retry',async()=>{
 const wait=deferred<never>();vi.spyOn(apiClient,'getWorkspaceMembers').mockReturnValueOnce(wait.promise).mockResolvedValue({members:[owner]} as never);const add=vi.spyOn(apiClient,'addWorkspaceMember');
 await act(async()=>root.render(<TeamSection session={session('a')}/>));expect(button('Adicionar Membro').disabled).toBe(true);await act(async()=>button('Adicionar Membro').click());expect(document.querySelector('[role="dialog"]')).toBeNull();
 // A rejected query must not unlock creation using the workspace's cached role.
 await act(async()=>wait.resolve(Promise.reject(new Error('SIM team unavailable')) as never));expect(button('Adicionar Membro').disabled).toBe(true);expect(container.textContent).toContain('Confirme a lista da equipe');
 await act(async()=>button('Atualizar equipe').click());expect(button('Adicionar Membro').disabled).toBe(false);expect(add).not.toHaveBeenCalled();
});

it('refreshes the complete opened webhook queue atomically after a later-page failure',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);
 const job=(id:string)=>({id,event_type:'lead.created',status:'suspended',attempts:0,error_message:null});const cursor={createdAt:'2026-10-17T12:00:00.123456Z',id:'SIM-cursor'};
 const first={jobs:[job('SIM-first')],pagination:{hasMore:true,nextCursor:cursor}},last={jobs:[job('SIM-older')],pagination:{hasMore:false,nextCursor:null}};
 const query=vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValueOnce(first).mockResolvedValueOnce(last).mockResolvedValueOnce({...first,jobs:[job('SIM-partial')]}).mockRejectedValueOnce(new Error('SIM refresh later failed')).mockResolvedValueOnce(first).mockResolvedValueOnce(last);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());await act(async()=>button('Carregar eventos anteriores').click());
 await act(async()=>button('Consultar fila').click());expect(container.textContent).toContain('SIM-first');expect(container.textContent).toContain('SIM-older');expect(container.textContent).not.toContain('SIM-partial');expect(container.textContent).toContain('SIM refresh later failed');
 await act(async()=>button('Consultar fila').click());expect(query).toHaveBeenCalledTimes(6);expect(container.querySelectorAll('section[aria-label="Eventos consultados da integração"] li')).toHaveLength(2);
});
it('rejects a repeating webhook queue cursor and requires a fresh query',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);
 const cursor={createdAt:'2026-10-17T12:00:00Z',id:'SIM-cursor'},job={id:'SIM-first',event_type:'lead.created',status:'suspended',attempts:0,error_message:null};
 const query=vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValueOnce({jobs:[job],pagination:{hasMore:true,nextCursor:cursor}}).mockResolvedValueOnce({jobs:[{...job,id:'SIM-invalid'}],pagination:{hasMore:true,nextCursor:cursor}});
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());await act(async()=>button('Carregar eventos anteriores').click());expect(container.textContent).toContain('continuação válida');expect(container.textContent).not.toContain('SIM-invalid');expect(button('Carregar eventos anteriores').disabled).toBe(true);await act(async()=>button('Carregar eventos anteriores').click());expect(query).toHaveBeenCalledTimes(2);
});

it('ignores credential copy completion after closing its dialog and reopening the empty form',async()=>{
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);vi.spyOn(apiClient,'addWorkspaceMember').mockResolvedValue({member:{...owner,id:'SIM-new-membership',userId:'SIM-new',email:'sim@example.invalid',role:'operator' as const},accountCreated:false});let resolve!:()=>void;const copy=vi.spyOn(navigator.clipboard,'writeText').mockReturnValue(new Promise<void>(r=>resolve=r));
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const form=document.querySelector('form')!;await input(form.querySelector('input')!,'SIM integrante');await input(form.querySelector('input[type="email"]')!,'sim@example.invalid');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));const copyButton=button('Copiar Dados de Acesso');await act(async()=>{copyButton.click();copyButton.click();});expect(copyButton.disabled).toBe(true);expect(copy).toHaveBeenCalledOnce();await act(async()=>button('Fechar').click());await act(async()=>button('Adicionar Membro').click());await act(async()=>resolve());expect(document.body.textContent).not.toContain('Credenciais Copiadas');expect(document.body.textContent).not.toContain('Dados de acesso copiados');expect(document.querySelector('form')).not.toBeNull();
});


it('clears only clipboard failure when retrying integration copy and announces success',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);
 const copy=vi.spyOn(navigator.clipboard,'writeText').mockRejectedValueOnce(new Error('SIM clipboard denied')).mockResolvedValueOnce(undefined);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));
 const copyButton=()=>container.querySelector<HTMLButtonElement>('button[aria-label="Copiar Workspace"]')!;
 await act(async()=>copyButton().click());expect(container.textContent).toContain('Não foi possível copiar.');
 await act(async()=>copyButton().click());expect(copy).toHaveBeenCalledTimes(2);
 expect(container.textContent).not.toContain('Não foi possível copiar.');
 expect(Array.from(container.querySelectorAll('[role="status"]')).some(node=>node.textContent?.includes('Valor copiado para a área de transferência.'))).toBe(true);
});


it('does not confirm an incomplete team query or enable adding from an unconfirmed list',async()=>{
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({} as never);await act(async()=>root.render(<TeamSection session={session('a')}/>));expect(container.textContent).toContain('A consulta não confirmou uma lista válida de integrantes');expect(button('Adicionar Membro').disabled).toBe(true);
});
it('does not present an incomplete webhook query as an empty configured list',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({} as never);await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(container.textContent).toContain('A consulta não confirmou uma lista válida de integrações');expect(container.textContent).not.toContain('Nenhum webhook de saída cadastrado');
});
it.each([{id:''},{url:{bad:true}},{events:{bad:true}},{events:[{}]},{is_active:undefined},{description:{bad:true}}])('preserves consulted integrations when a record is incompatible: %j',async invalid=>{
 const hook={id:'SIM-valid-hook',url:'https://sim.example.test/preserved',events:['lead.created'],is_active:false};
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValueOnce({webhooks:[hook]} as never).mockResolvedValueOnce({webhooks:[{...hook,...invalid}]} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Atualizar').click());
 expect(container.textContent).toContain('integração incompatível');expect(container.textContent).toContain(hook.url);expect(button('Testar (Ping)').disabled).toBe(true);
});
it('does not expose an executable destination URL as an integration action',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-invalid-url',url:'javascript:alert(1)',events:['lead.created'],is_active:false}]} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(container.textContent).toContain('destino inválido');expect(container.querySelector('a[href^="javascript:"]')).toBeNull();expect(button('Testar (Ping)')).toBeUndefined();
});
it.each([{id:''},{event_type:{bad:true}},{status:null},{error_message:{bad:true}}])('preserves consulted webhook jobs after an incompatible row: %j',async invalid=>{
 const job={id:'SIM-preserved-job',event_type:'lead.created',status:'suspended',attempts:0,error_message:null};
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false}]} as never);
 vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValueOnce({jobs:[job],pagination:{hasMore:false,nextCursor:null}} as never).mockResolvedValueOnce({jobs:[{...job,...invalid}],pagination:{hasMore:false,nextCursor:null}} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());await act(async()=>button('Consultar fila').click());
 expect(container.textContent).toContain('evento de integração incompatível');expect(container.textContent).toContain('SIM-preserved-job');
});
it('rejects duplicated job identities without confirming an empty or successful queue',async()=>{
 const job={id:'SIM-duplicate-job',event_type:'lead.created',status:'delivered',attempts:1,error_message:null};
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:[],is_active:false}]} as never);
 vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValue({jobs:[job,job]} as never);await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());
 expect(container.textContent).toContain('evento de integração incompatível');expect(container.textContent).not.toContain('Destino confirmou recebimento');
});
it.each([{hasMore:'false',nextCursor:null},{hasMore:true,nextCursor:{id:'SIM-next',createdAt:'invalid'}},{hasMore:true,nextCursor:{id:'',createdAt:'2026-10-18T12:00:00Z'}},null])('preserves the consulted queue after malformed pagination: %j',async pagination=>{
 const job={id:'SIM-preserved-job',event_type:'lead.created',status:'suspended',attempts:0,error_message:null};
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:[],is_active:false}]} as never);
 vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValueOnce({jobs:[job],pagination:{hasMore:false,nextCursor:null}} as never).mockResolvedValueOnce({jobs:[],pagination} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());await act(async()=>button('Consultar fila').click());
 expect(container.textContent).toContain('continuação válida');expect(container.textContent).toContain('SIM-preserved-job');
});
it('does not confirm the first queue page when empty rows claim continuation',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-hook',url:'https://sim.example.test',events:[],is_active:false}]} as never);
 vi.spyOn(apiClient,'listWebhookJobs').mockResolvedValue({jobs:[],pagination:{hasMore:true,nextCursor:{id:'SIM-next',createdAt:'2026-10-18T12:00:00Z'}}} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Consultar fila').click());expect(container.textContent).toContain('continuação válida');expect(container.textContent).not.toContain('Fim das páginas desta consulta');
});
it.each([{}, {webhook:{id:'SIM-wrong',url:'https://other.example.test',events:['*'],is_active:false}}, {webhook:{id:'SIM-active',url:'https://sim.example.test/events',events:['*'],is_active:true}}])('preserves the webhook draft and blocks duplicate creation after an incompatible acknowledgement: %j',async response=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const create=vi.spyOn(apiClient,'createWebhook').mockResolvedValue(response as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());const form=document.querySelector('form')!;const url=form.querySelector<HTMLInputElement>('input[type=url]')!;await input(url,'https://sim.example.test/events');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(url.value).toBe('https://sim.example.test/events');expect(button('Salvar Webhook inativo').disabled).toBe(true);expect(button('Fechar e conferir integrações')).toBeDefined();
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).toHaveBeenCalledOnce();
});
it('closes creation only after the requested inactive webhook is confirmed',async()=>{
 const list=vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);vi.spyOn(apiClient,'createWebhook').mockResolvedValue({webhook:{id:'SIM-created',url:'https://sim.example.test/events',events:['*'],is_active:false,supports_idempotency:false}} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());const form=document.querySelector('form')!;await input(form.querySelector<HTMLInputElement>('input[type=url]')!,'https://sim.example.test/events');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(document.querySelector('form')).toBeNull();expect(list).toHaveBeenCalledTimes(2);
});
it.each([
 {value:true,text:'O destino declara prevenção de duplicidade.'},
 {value:false,text:'O destino não declara prevenção de duplicidade.'},
 {value:undefined,text:'Prevenção de duplicidade não informada nesta consulta.'},
])('shows the recorded duplicate-prevention declaration without treating missing as false: $value',async({value,text})=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-declaration',url:'https://sim.example.test',events:[],is_active:false,supports_idempotency:value}]} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));expect(container.textContent).toContain(text);
});
it.each([false,true])('preserves the creation draft when the duplicate-prevention acknowledgement differs: selected=%s',async selected=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[]} as never);const create=vi.spyOn(apiClient,'createWebhook').mockResolvedValue({webhook:{id:'SIM-created',url:'https://sim.example.test/events',events:['*'],is_active:false,supports_idempotency:!selected}} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Novo Webhook').click());const form=document.querySelector('form')!;await input(form.querySelector<HTMLInputElement>('input[type=url]')!,'https://sim.example.test/events');if(selected)await act(async()=>form.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create.mock.calls[0]?.[1]).toMatchObject({supportsIdempotency:selected});expect(container.textContent).toContain('O servidor não confirmou a configuração inativa solicitada');expect(form.querySelector<HTMLInputElement>('input[type=url]')!.value).toBe('https://sim.example.test/events');expect(button('Salvar Webhook inativo').disabled).toBe(true);
});
it.each([{queue:false,moved:false},{queue:false,moved:true},{queue:true,moved:false},{queue:true,moved:true}])('preserves focus after a manual integration read: %j',async({queue,moved})=>{
 const hook={id:'SIM-read-focus',url:'https://sim.example.test',events:[],is_active:false};const pending=deferred<never>();
 const list=vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[hook]} as never);
 vi.spyOn(apiClient,'listWebhookJobs').mockReturnValue(pending.promise);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));if(!queue)list.mockReturnValueOnce(pending.promise);
 const control=button(queue?'Consultar fila':'Atualizar');control.focus();await act(async()=>control.click());const other=document.createElement('button');document.body.append(other);
 try{if(moved)other.focus();else control.blur();await act(async()=>pending.resolve(queue?{jobs:[],pagination:{hasMore:false,nextCursor:null}} as never:{webhooks:[hook]} as never));expect(document.activeElement).toBe(moved?other:control);}finally{other.remove();}
});
it.each([{}, {success:'true',status:'delivered',statusCode:200,durationMs:1}, {success:true,status:'delivered',statusCode:500,durationMs:1}, {success:true,status:'failed',statusCode:200,durationMs:1}, {success:true,status:'delivered',statusCode:200,durationMs:-1}])('does not present an incompatible ping response as success: %j',async response=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-ping',url:'https://sim.example.test',events:[],is_active:false}]} as never);vi.spyOn(apiClient,'testWebhook').mockResolvedValue(response as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Testar (Ping)').click());expect(container.textContent).toContain('não confirmou um resultado válido');expect(container.textContent).not.toContain('✓ Destino respondeu');
});
it('keeps a confirmed ping failure distinct from an unconfirmed result',async()=>{
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[{id:'SIM-ping',url:'https://sim.example.test',events:[],is_active:false}]} as never);vi.spyOn(apiClient,'testWebhook').mockResolvedValue({success:false,status:'failed',statusCode:null,durationMs:10,errorMessage:'SIM destino indisponível'} as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Testar (Ping)').click());expect(container.textContent).toContain('Falha no teste: SIM destino indisponível');expect(container.textContent).not.toContain('não confirmou um resultado válido');
});
it.each([{}, {url:'https://other.example.test'}, {events:['payment.settled']}, {supports_idempotency:true}])('requires a new integration query after incompatible activation acknowledgement: %j',async invalid=>{
 const hook={id:'SIM-ack-hook',url:'https://sim.example.test',events:['lead.created'],is_active:false,supports_idempotency:false};
 vi.spyOn(apiClient,'listWebhooks').mockResolvedValue({webhooks:[hook]} as never);
 const result=Object.keys(invalid).length?{webhook:{...hook,is_active:true,...invalid}}:{};
 const activate=vi.spyOn(apiClient,'setWebhookActive').mockResolvedValue(result as never);
 await act(async()=>root.render(<IntegrationsSection session={session('a')}/>));await act(async()=>button('Ativar após teste').click());await act(async()=>button('Confirmar ativação').click());
 expect(document.querySelector('[role=dialog]')).not.toBeNull();expect(button('Confirmar ativação').disabled).toBe(true);expect(container.textContent).not.toContain('Envio habilitado pelo servidor.');
 await act(async()=>button('Confirmar ativação').click());expect(activate).toHaveBeenCalledOnce();
});
it.each([{id:''},{userId:''},{name:{bad:true}},{email:{bad:true}},{role:'unknown'}])('preserves the team and locks management after an incompatible member: %j',async invalid=>{
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValueOnce({members:[owner]} as never).mockResolvedValueOnce({members:[{...owner,...invalid}]} as never);
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Atualizar equipe').click());expect(container.textContent).toContain('integrante incompatível');expect(container.textContent).toContain(owner.email);expect(button('Adicionar Membro').disabled).toBe(true);
});
it('rejects duplicate member identities rather than confirming the team',async()=>{
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,owner]} as never);await act(async()=>root.render(<TeamSection session={session('a')}/>));expect(container.textContent).toContain('integrante incompatível');expect(button('Adicionar Membro').disabled).toBe(true);
});
it.each(['missing','identity','role'])('keeps role editing pending after an incompatible acknowledgement: %s',async kind=>{
 const target={...owner,id:'SIM-role-membership',userId:'SIM-role-user',name:'SIM gerente',email:'sim-role@example.test',role:'manager'};
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,target]} as never);
 const member={...target,role:'operator',...(kind==='identity'?{userId:'SIM-other-user'}:kind==='role'?{role:'manager'}:{})};
 const update=vi.spyOn(apiClient,'updateWorkspaceMember').mockResolvedValue((kind==='missing'?{}:{member}) as never);
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Alterar perfil').click());const form=document.querySelector('form')!,select=form.querySelector('select')!;await act(async()=>{select.value='operator';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(select.value).toBe('operator');expect(form.querySelector('fieldset')!.disabled).toBe(true);expect(container.textContent).not.toContain('atualizado com sucesso.');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(update).toHaveBeenCalledOnce();
});
it('confirms a matching role update and then refreshes the team',async()=>{
 const target={...owner,id:'SIM-role-membership',userId:'SIM-role-user',name:'SIM gerente',email:'sim-role@example.test',role:'manager'};const updated={...target,role:'operator'};
 const list=vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValueOnce({members:[owner,target]} as never).mockResolvedValue({members:[owner,updated]} as never);vi.spyOn(apiClient,'updateWorkspaceMember').mockResolvedValue({member:updated} as never);
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Alterar perfil').click());const form=document.querySelector('form')!,select=form.querySelector('select')!;await act(async()=>{select.value='operator';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(document.querySelector('form')).toBeNull();expect(container.textContent).toContain('Membro SIM gerente atualizado com sucesso.');expect(list).toHaveBeenCalledTimes(2);
});
it.each(['missing','email','role','password-object','existing-password'])('preserves member registration and hides credentials after incompatible acknowledgement: %s',async kind=>{
 const member={...owner,id:'SIM-new-membership',userId:'SIM-new-user',email:kind==='email'?'other@example.test':'sim-new@example.test',role:kind==='role'?'admin':'operator'};
 const response=kind==='missing'?{}:{member,accountCreated:kind==='password-object',...(kind==='password-object'?{initialPassword:{bad:true}}:kind==='existing-password'?{initialPassword:'SIM_UNEXPECTED_PASSWORD'}:{})};
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);const add=vi.spyOn(apiClient,'addWorkspaceMember').mockResolvedValue(response as never);
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const form=document.querySelector('form')!;await input(form.querySelector('input')!,'SIM novo');await input(form.querySelector('input[type=email]')!,'sim-new@example.test');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(form.querySelector<HTMLInputElement>('input[type=email]')!.value).toBe('sim-new@example.test');expect(form.querySelector('fieldset')!.disabled).toBe(true);expect(document.querySelector('[role=dialog]')?.textContent).not.toContain('SIM_UNEXPECTED_PASSWORD');expect(container.textContent).not.toContain('Senha Inicial:');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(add).toHaveBeenCalledOnce();
});
it('shows initial credentials only for a confirmed matching new account',async()=>{
 const member={...owner,id:'SIM-new-membership',userId:'SIM-new-user',email:'sim-new@example.test',role:'operator'};
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner]} as never);vi.spyOn(apiClient,'addWorkspaceMember').mockResolvedValue({member,accountCreated:true,initialPassword:'SIM_INITIAL_PASSWORD'} as never);
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Adicionar Membro').click());const form=document.querySelector('form')!;await input(form.querySelector('input')!,'SIM novo');await input(form.querySelector('input[type=email]')!,'sim-new@example.test');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(document.querySelector('[role=dialog]')?.textContent).toContain('SIM_INITIAL_PASSWORD');expect(document.querySelector('form')).toBeNull();
});
it.each([{}, {success:false},{success:'true'},{success:true,pendingReassignment:{tasks:-1,opportunities:0}},{success:true,pendingReassignment:{tasks:{bad:true},opportunities:0}}])('does not claim access removal after an incompatible acknowledgement: %j',async response=>{
 const target={...owner,id:'SIM-remove-membership',userId:'SIM-remove-user',name:'SIM colega',email:'sim-remove@example.test',role:'operator'};
 vi.spyOn(apiClient,'getWorkspaceMembers').mockResolvedValue({members:[owner,target]} as never);const remove=vi.spyOn(apiClient,'removeWorkspaceMember').mockResolvedValue(response as never);
 await act(async()=>root.render(<TeamSection session={session('a')}/>));await act(async()=>button('Remover').click());await act(async()=>button('Confirmar remoção do acesso').click());
 expect(document.querySelector('[role=dialog]')?.textContent).toContain('Remoção de acesso não confirmada');expect(button('Confirmar remoção do acesso').disabled).toBe(true);expect(container.textContent).not.toContain('Acesso de SIM colega removido.');await act(async()=>button('Confirmar remoção do acesso').click());expect(remove).toHaveBeenCalledOnce();
});
