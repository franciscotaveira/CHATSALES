// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PixSection } from "../pages/settings/PixSection";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { ChannelWizardDialog } from "../pages/settings/ChannelWizardDialog";
import { ConversoesPage } from "../pages/campaigns/CampaignsPage";
import { apiClient } from "../services/api-client";
import type { UseSessionReturn } from "../hooks/useSession";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
const session=(workspace='a',details=workspace)=>({activeWorkspace:{id:workspace,name:'SIMULADO',role:'owner'},token:'synthetic',activeWorkspaceDetails:{workspace:{id:details,defaultPixKey:'chave-simulada',defaultPixMerchantName:'SIMULADO',defaultPixMerchantCity:'SIMULADA'}},refreshWorkspace:vi.fn().mockResolvedValue(undefined)}) as unknown as UseSessionReturn;
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===name)!;
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
async function input(el:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
const checkedConversion={id:'SIM-preserved-event',eventName:'LeadCaptured',status:'SIMULATED',createdAt:'2026-10-18T12:00:00Z',valueCents:null,currency:'BRL',errorMessage:null};
it.each([false,true])('keeps pagination focus useful when the last page arrives: moved=%s',async moved=>{
 const pending=deferred<never>();vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[checkedConversion],pagination:{hasMore:true,nextCursor:'SIM-cursor'}} as never).mockReturnValueOnce(pending.promise);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));const more=button('Carregar eventos anteriores');more.focus();await act(async()=>more.click());
 const other=document.createElement('button');document.body.append(other);
 try{if(moved)other.focus();else more.blur();await act(async()=>pending.resolve({items:[{...checkedConversion,id:'SIM-focus-added'}],pagination:{hasMore:false,nextCursor:null}} as never));
 expect(document.activeElement).toBe(moved?other:container.querySelector('[data-conversion-id="SIM-focus-added"]'));expect(button('Carregar eventos anteriores')).toBeUndefined();
 }finally{other.remove();}
});
it.each([false,true])('restores manual refresh focus without taking another control: moved=%s',async moved=>{
 const pending=deferred<never>();vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[checkedConversion]} as never).mockReturnValueOnce(pending.promise);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));const refresh=button('Atualizar');refresh.focus();await act(async()=>refresh.click());
 const other=document.createElement('button');document.body.append(other);
 try{
  if(moved)other.focus();else refresh.blur();
  await act(async()=>pending.resolve({items:[checkedConversion]} as never));expect(document.activeElement).toBe(moved?other:refresh);
 }finally{other.remove();}
});
it.each([{hasMore:'false',nextCursor:null},{hasMore:true,nextCursor:{}},{hasMore:true,nextCursor:' '},null])('preserves conversion results when refresh pagination is invalid: %j',async pagination=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[checkedConversion]} as never).mockResolvedValueOnce({items:[],pagination} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));await act(async()=>button('Atualizar').click());
 expect(container.textContent).toContain('continuação válida');expect(container.textContent).toContain('SIM-preserved-event');
});
it('keeps an older-page cursor retryable after a malformed empty continuation',async()=>{
 const get=vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[checkedConversion],pagination:{hasMore:true,nextCursor:'SIM-cursor'}} as never).mockResolvedValueOnce({items:[],pagination:{hasMore:true,nextCursor:'SIM-next'}} as never).mockResolvedValueOnce({items:[{...checkedConversion,id:'SIM-older-event'}],pagination:{hasMore:false,nextCursor:null}} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));await act(async()=>button('Carregar eventos anteriores').click());expect(container.textContent).toContain('continuação válida');expect(container.textContent).toContain('SIM-preserved-event');
 await act(async()=>button('Carregar eventos anteriores').click());expect(get.mock.calls[2]?.[1]).toMatchObject({beforeId:'SIM-cursor'});expect(container.textContent).toContain('SIM-older-event');
});
it.each([{id:''},{eventName:{bad:true}},{status:null},{createdAt:{bad:true}},{errorMessage:{bad:true}}])('preserves conversions when a refresh contains an incompatible record: %j',async invalid=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[checkedConversion]} as never).mockResolvedValueOnce({items:[{...checkedConversion,...invalid}]} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));await act(async()=>button('Atualizar').click());
 expect(container.textContent).toContain('evento incompatível');expect(container.textContent).toContain('SIM-preserved-event');expect(container.textContent).not.toContain('Nenhuma conversão registrada');
});
it('does not count duplicate conversion identities twice in a page',async()=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValue({items:[checkedConversion,checkedConversion]} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));expect(container.textContent).toContain('evento incompatível');expect(container.textContent).not.toContain('Nenhuma conversão registrada');
});
describe('Financial setup and report states',()=>{
 it('does not edit or save Pix using another company details',async()=>{
  const save=vi.spyOn(apiClient,'updateWorkspace');
  await act(async()=>root.render(<PixSection session={session('new','old')}/>));
  expect(container.querySelector('fieldset')?.disabled).toBe(true);expect(button('Salvar Configurações Pix').disabled).toBe(true);
  await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(save).not.toHaveBeenCalled();expect(Array.from(container.querySelectorAll('input')).some(x=>x.value==='chave-simulada')).toBe(false);
 });
 it('preserves an edited Pix field through unrelated workspace detail refresh',async()=>{
  await act(async()=>root.render(<PixSection session={session()}/>));
  const key=Array.from(container.querySelectorAll('input')).find(x=>x.value==='chave-simulada')!;
  await input(key,'edicao-simulada');await act(async()=>root.render(<PixSection session={session()}/>));expect(key.value).toBe('edicao-simulada');
 });
 it('preserves the Pix draft on save failure and never claims successful payment',async()=>{
  vi.spyOn(apiClient,'updateWorkspace').mockRejectedValue(new Error('Falha simulada ao salvar'));
  await act(async()=>root.render(<PixSection session={session()}/>));
  await input(container.querySelector('input')!,'SIM chave editada');
  await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(container.textContent).toContain('Falha simulada ao salvar');expect(container.textContent).not.toContain('salvas com sucesso');
  expect(Array.from(container.querySelectorAll('input')).some(x=>x.value==='SIM chave editada')).toBe(true);
 });
 it('does not show zero metrics, a false update time or empty success after report failure',async()=>{
  vi.spyOn(apiClient,'getConversions').mockRejectedValue(new Error('Falha simulada na consulta'));
  await act(async()=>root.render(<ConversoesPage session={session()}/>));
  expect(container.textContent).toContain('indicadores estão indisponíveis');expect(container.textContent).not.toContain('Consulta concluída às');
  expect(container.textContent).not.toContain('Nenhuma conversão registrada');
  expect(Array.from(container.querySelectorAll('div')).filter(x=>x.style.fontSize==='24px').map(x=>x.textContent)).toEqual(['—','—','—','—']);
 });
 it('displays a confirmed zero event value as currency and lets the user inspect its error',async()=>{
  vi.spyOn(apiClient,'getConversions').mockResolvedValue({items:[{id:'SIM-event',journeyId:'SIM-journey',eventName:'Purchase',valueCents:0,currency:'BRL',status:'FAILED',errorMessage:'Destino indisponível',createdAt:'2026-10-17T12:00:00Z'}]} as never);
  await act(async()=>root.render(<ConversoesPage session={session()}/>));
  expect(container.textContent).toMatch(/R\$\s*0,00/);expect(container.textContent).toContain('Destino indisponível');expect(container.textContent).toContain('SIM-event');
 });
 it('keeps a report response from the old company out of the current company',async()=>{
  const old=deferred<never>();vi.spyOn(apiClient,'getConversions').mockReturnValueOnce(old.promise).mockResolvedValue({items:[]} as never);
  await act(async()=>root.render(<ConversoesPage session={session('old')}/>));await act(async()=>root.render(<ConversoesPage session={session('new')}/>));
  await act(async()=>old.resolve({items:[{id:'old',eventName:'Evento de outra empresa'}]} as never));expect(container.textContent).not.toContain('Evento de outra empresa');
 });
 it('exposes channel query failure with retry instead of claiming no connected channels',async()=>{
  vi.spyOn(apiClient,'getChannels').mockRejectedValueOnce(new Error('Falha simulada dos canais')).mockResolvedValue({channels:[]} as never);
  await act(async()=>root.render(<SettingsPage session={session()}/>));
  expect(container.textContent).toContain('Falha simulada dos canais');expect(container.textContent).not.toContain('Nenhum canal conectado');
  await act(async()=>button('Tentar novamente').click());expect(container.textContent).not.toContain('Falha simulada dos canais');expect(container.textContent).toContain('Nenhum canal conectado');
 });
 it('discards a connection test for credentials that were edited while waiting',async()=>{
  const test=deferred<never>();vi.spyOn(apiClient,'testChannelConnection').mockReturnValue(test.promise);
  await act(async()=>root.render(<ChannelWizardDialog isOpen onClose={()=>{}} onChannelCreated={()=>{}} workspaceId="a" token="synthetic"/>));
  await input(document.querySelector('input')!,'SIMULADO');await act(async()=>button('Continuar').click());
  const credential=document.querySelector('input[placeholder="EAAB..."]')! as HTMLInputElement;
  await input(credential,'synthetic-old');await act(async()=>button('Testar Conexão').click());
  await input(credential,'synthetic-new');await act(async()=>test.resolve({success:true} as never));
  expect(document.body.textContent).not.toContain('Conexão testada com sucesso!');expect(credential.value).toBe('synthetic-new');
 });
 it('describes channel creation as registration rather than a verified working connection',async()=>{
  vi.spyOn(apiClient,'createChannel').mockImplementation(async(workspaceId,payload)=>({channel:{id:'SIM-channel',workspaceId,provider:payload.provider,displayName:payload.displayName,isActive:false}} as never));
  await act(async()=>root.render(<ChannelWizardDialog isOpen onClose={()=>{}} onChannelCreated={()=>{}} workspaceId="a" token="synthetic" initialProvider="waha"/>));
  await input(document.querySelector('input')!,'SIMULADO');await act(async()=>button('Continuar').click());await act(async()=>button('Salvar Canal').click());
  expect(document.body.textContent).toContain('Canal cadastrado');expect(document.body.textContent).not.toContain('Canal Conectado com Sucesso');expect(document.body.textContent).not.toContain('ativo para atendimento');
 });
 it('explains the scope of a successful provider check and preserves failure feedback',async()=>{
  vi.spyOn(apiClient,'testChannelConnection').mockResolvedValueOnce({success:true,message:'Servidor respondeu; sessão ainda não verificada.'}).mockResolvedValueOnce({success:false,error:'Credencial de teste recusada pelo provedor.'});
  await act(async()=>root.render(<ChannelWizardDialog isOpen onClose={()=>{}} onChannelCreated={()=>{}} workspaceId="a" token="synthetic" initialProvider="waha"/>));
  await input(document.querySelector('input')!,'SIMULADO');await act(async()=>button('Continuar').click());await act(async()=>button('Testar Conexão').click());
  expect(document.querySelector('input[type="url"]')?.getAttribute('autocomplete')).toBe('off');expect(document.querySelector('input[type="password"]')?.getAttribute('autocomplete')).toBe('new-password');
  expect(document.body.textContent).toContain('Servidor respondeu; sessão ainda não verificada.');expect(document.body.textContent).not.toContain('Conexão testada com sucesso!');
  await act(async()=>button('Testar Conexão').click());expect(document.body.textContent).toContain('Credencial de teste recusada pelo provedor.');expect(document.body.textContent).not.toContain('Servidor respondeu; sessão ainda não verificada.');
 });

});

it('serializes Pix saves and never lets an old company completion unlock the current form',async()=>{
 const old=deferred<never>(),current=deferred<never>();const save=vi.spyOn(apiClient,'updateWorkspace').mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);const first=session('a'),second=session('b');await act(async()=>root.render(<PixSection session={first}/>));await input(container.querySelector('input')!,'SIM chave A');await act(async()=>{const form=container.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(save).toHaveBeenCalledOnce();await act(async()=>root.render(<PixSection session={second}/>));expect(button('Salvar Configurações Pix').disabled).toBe(true);await input(container.querySelector('input')!,'SIM chave B');await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await act(async()=>old.resolve({workspace:{id:'a'}} as never));expect(button('Salvando...').disabled).toBe(true);expect(first.refreshWorkspace).not.toHaveBeenCalled();expect(container.textContent).not.toContain('salvas com sucesso');await act(async()=>current.resolve({workspace:{id:'b',defaultPixKey:'SIM chave B',defaultPixKeyType:'cnpj'}} as never));expect(second.refreshWorkspace).toHaveBeenCalledOnce();expect(button('Salvar Configurações Pix').disabled).toBe(true);
});
it('distinguishes a persisted Pix configuration from a failed refresh',async()=>{
 vi.spyOn(apiClient,'updateWorkspace').mockResolvedValue({workspace:{id:'a',defaultPixKey:'SIM chave salva',defaultPixKeyType:'cnpj'}} as never);const data=session();vi.mocked(data.refreshWorkspace).mockRejectedValue(new Error('SIM refresh failure'));await act(async()=>root.render(<PixSection session={data}/>));await input(container.querySelector('input')!,'SIM chave salva');await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(container.textContent).toContain('Configuração salva, mas não foi possível atualizar');expect(container.textContent).toContain('salvas com sucesso');expect(container.textContent).not.toContain('Falha ao salvar');
});

it.each(['workspace','token'])('does not claim an empty conversion result without confirmed %s',async missing=>{
 const query=vi.spyOn(apiClient,'getConversions');const current={...session(),...(missing==='workspace'?{activeWorkspace:null}:{token:null})} as unknown as UseSessionReturn;
 await act(async()=>root.render(<ConversoesPage session={current}/>));expect(query).not.toHaveBeenCalled();expect(container.textContent).not.toContain('Nenhuma conversão registrada');expect(container.textContent).not.toContain('Consulta concluída às');expect(button('Atualizar').disabled).toBe(true);
 expect(container.textContent).toContain(missing==='workspace'?'Selecione uma empresa':'O acesso ainda não foi confirmado');
});
it('waits for session confirmation before querying conversions, then loads when confirmation finishes',async()=>{
 const query=vi.spyOn(apiClient,'getConversions').mockResolvedValue({items:[]} as never);
 await act(async()=>root.render(<ConversoesPage session={{...session(),isLoadingWorkspace:true}}/>));expect(query).not.toHaveBeenCalled();expect(container.textContent).not.toContain('Nenhuma conversão registrada');
 await act(async()=>root.render(<ConversoesPage session={{...session(),isLoadingWorkspace:false}}/>));expect(query).toHaveBeenCalledTimes(1);expect(container.textContent).toContain('Nenhuma conversão registrada');
});

it.each([{valueCents:-1,currency:'BRL',label:'Valor não reconhecido'},{valueCents:1.5,currency:'BRL',label:'Valor não reconhecido'},{valueCents:100,currency:'',label:'Moeda não informada ou inválida'}])('does not invent a valid conversion value for malformed data %j',async item=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValue({items:[{id:'SIM-invalid',journeyId:'SIM-journey',eventName:'SIM test',status:'SIM_INTERNAL_UNKNOWN',createdAt:'invalid-date',...item}]} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));expect(container.textContent).toContain(item.label);expect(container.textContent).toContain('Data não informada ou inválida');expect(container.textContent).toContain('Estado não reconhecido');expect(container.textContent).not.toContain('SIM_INTERNAL_UNKNOWN');expect(container.textContent).not.toContain('Invalid Date');
 expect(container.textContent).toContain('páginas de até 50 registros');
});

it('loads older conversions, preserves records on page failure and refreshes the whole opened range',async()=>{
 const first={id:'SIM-first',eventName:'SIM first',status:'QUEUED',createdAt:'2026-10-18T12:00:00Z',valueCents:null};const older={...first,id:'SIM-older',eventName:'SIM older'};
 const query=vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[first],pagination:{hasMore:true,nextCursor:'SIM-first'}} as never).mockRejectedValueOnce(new Error('SIM older failed')).mockResolvedValueOnce({items:[older],pagination:{hasMore:false,nextCursor:null}} as never).mockResolvedValueOnce({items:[first],pagination:{hasMore:true,nextCursor:'SIM-first'}} as never).mockResolvedValueOnce({items:[older],pagination:{hasMore:false,nextCursor:null}} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));await act(async()=>button('Carregar eventos anteriores').click());expect(container.textContent).toContain('SIM first');expect(container.textContent).toContain('SIM older failed');
 await act(async()=>button('Carregar eventos anteriores').click());expect(container.textContent).toContain('SIM older');expect(query).toHaveBeenLastCalledWith('a',{token:'synthetic',beforeId:'SIM-first'});
 await act(async()=>button('Atualizar').click());expect(query).toHaveBeenCalledTimes(5);expect(container.textContent).toContain('SIM older');
});

it('rejects a repeated conversion cursor without adding unconfirmed records',async()=>{
 const first={id:'SIM-first',eventName:'SIM first',status:'QUEUED',createdAt:'2026-10-18T12:00:00Z',valueCents:null};
 const query=vi.spyOn(apiClient,'getConversions').mockResolvedValueOnce({items:[first],pagination:{hasMore:true,nextCursor:'SIM-first'}} as never).mockResolvedValueOnce({items:[{...first,id:'SIM-invalid',eventName:'SIM invalid page'}],pagination:{hasMore:true,nextCursor:'SIM-first'}} as never);
 await act(async()=>root.render(<ConversoesPage session={session()}/>));await act(async()=>button('Carregar eventos anteriores').click());
 expect(container.textContent).toContain('continuação válida');expect(container.textContent).toContain('SIM first');expect(container.textContent).not.toContain('SIM invalid page');expect(button('Carregar eventos anteriores')).toBeUndefined();expect(query).toHaveBeenCalledTimes(2);
});

it.each([['PROCESSING','Em processamento'],['SIMULATED','Simulado — sem envio real'],['NOT_CONFIGURED','Integração não configurada'],['NOT_APPLICABLE','Não aplicável'],['DISCARDED','Descartado']])('recognizes canonical conversion state %s without counting it as accepted',async(status,label)=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValue({items:[{id:'SIM-state',eventName:'SIM event',status,createdAt:'2026-10-18T12:00:00Z',valueCents:null}]} as never);await act(async()=>root.render(<ConversoesPage session={session()}/>));
 expect(container.textContent).toContain(`${label}: 1`);expect(container.textContent).not.toContain('Estado não reconhecido');
 const metrics=Array.from(container.querySelectorAll('div')).filter(x=>x.style.fontSize==='24px').map(x=>x.textContent);expect(metrics).toEqual(['1','0','0','0']);
});

it.each([['LeadCaptured','Captura de contato'],['LeadQualified','Qualificação de contato'],['AppointmentScheduled','Agendamento'],['ProposalAccepted','Aceite de proposta'],['PurchaseCompleted','Compra'],['PurchaseRefunded','Reembolso'],['constructor','Evento não reconhecido']])('presents event %s in operational language while preserving the recorded code',async(eventName,label)=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValue({items:[{id:'SIM-named',eventName,status:'SIMULATED',createdAt:'2026-10-18T12:00:00Z',valueCents:null}]} as never);await act(async()=>root.render(<ConversoesPage session={session()}/>));
 const title=container.querySelector('article strong')||container.querySelector('tbody td');expect(title?.textContent).toContain(label);expect(container.querySelector('details')?.textContent).toContain(`Tipo registrado: ${eventName}`);
});


it('keeps conversion metrics unavailable when the response does not contain an events list',async()=>{
 vi.spyOn(apiClient,'getConversions').mockResolvedValue({} as never);await act(async()=>root.render(<ConversoesPage session={session()}/>));expect(container.textContent).toContain('A consulta não confirmou uma lista válida de conversões');expect(container.textContent).toContain('Os indicadores estão indisponíveis até uma nova consulta');
});


it('does not confirm an incomplete channels query in settings',async()=>{
 vi.spyOn(apiClient,'getChannels').mockResolvedValue({} as never);await act(async()=>root.render(<SettingsPage session={session()}/>));expect(container.textContent).toContain('A consulta não confirmou uma lista válida de canais');
});
