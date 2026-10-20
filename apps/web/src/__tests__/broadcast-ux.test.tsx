import { TemplatesPage } from "../pages/templates/TemplatesPage";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { BroadcastTemplateDialog, parseCsvText } from "../pages/templates/BroadcastTemplateDialog";
import * as importAudience from "../pages/templates/import-audience";
import { CampaignsList } from "../pages/templates/CampaignsList";
import { apiClient } from "../services/api-client";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===name)!;
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
const preflight={success:true,channels:[{id:'SIM-channel',displayName:'Canal simulado',provider:'waha',status:'connected',isBlockedForBroadcast:false}],templates:[{id:'SIM-template',name:'modelo_simulado',bodyText:'Olá, mensagem simulada.',variables:[],category:'UTILITY',buttons:[],status:'APPROVED'}],totalActiveContacts:2};
const result={success:true,batchId:'SIM-batch',enqueuedCount:2,totalTargeted:2,template:{name:'modelo_simulado'}};
const prepared={success:true,preparedAudienceId:'SIM-prepared',expiresAt:'2099-01-01T00:00:00Z',limit:1000,included:[{phoneE164:'+5511999999999',name:'SIM Incluído'}],excluded:[{phoneE164:'+5521999999999',name:'SIM Excluído',reason:'Mensagens comerciais bloqueadas'}]};
const campaign={id:'SIM-campaign',name:'Campanha simulada',status:'queued',channel:{id:'SIM-channel',name:'Canal simulado',provider:'waha'},template:{id:'SIM-template',name:'modelo_simulado',category:'UTILITY'},isAbTest:false,audienceType:'ALL_CONTACTS',totalTargeted:2,metrics:{sent:0,delivered:0,read:0,replied:0,clicked:0,deliveryRate:0,openRate:0,replyRate:0,ctr:0},createdAt:'2026-10-17T12:00:00Z'};
const dialog=(workspace='a')=><BroadcastTemplateDialog isOpen onClose={()=>{}} workspaceId={workspace} token="synthetic"/>;
async function submit(){await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
async function chooseColumn(label:string,value:string){await act(async()=>{const field=Array.from(document.querySelectorAll('label')).find(node=>node.textContent?.startsWith(label))!.querySelector('select')!;field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));});}
async function importCsv(text:string){
 const file=new File([text],'SIM-mapping.csv',{type:'text/csv'});Object.defineProperty(file,'text',{value:async()=>text});
 await act(async()=>{const field=document.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(field,'files',{value:[file],configurable:true});field.dispatchEvent(new Event('change',{bubbles:true}));});
}
async function approveMessageTest(){
 await act(async()=>{const field=document.querySelector<HTMLInputElement>('input[type="tel"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'+5511999999999');field.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Enviar teste A').click());
 await act(async()=>document.querySelector<HTMLInputElement>('section[aria-label="Teste da mensagem"] input[type="checkbox"]')!.click());
}
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);vi.spyOn(apiClient,'prepareBroadcast').mockResolvedValue(prepared);vi.spyOn(apiClient,'sendBroadcastTest').mockResolvedValue({success:true,testId:'SIM-test',replayed:false});vi.spyOn(apiClient,'getBroadcastTests').mockResolvedValue({tests:[{id:'SIM-test',variant:'A',phoneE164:'+5511999999999',body:'SIM teste',status:'sent'}]});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
describe('Campaign review, import and result feedback',()=>{
 it('parses a quoted multiline CSV without losing the phone or splitting a contact',async()=>{
  const rows=await parseCsvText('nome;telefone;observacao\r\n"SIM Ana";"+5511999999999";"linha um\nlinha dois"\r\n"SIM Bia";"+5521999999999";"com; separador"');
  expect(rows).toHaveLength(2);expect(rows[0]?.telefone).toBe('+5511999999999');expect(rows[0]?.observacao).toContain('linha dois');expect(rows[1]?.observacao).toBe('com; separador');
 });
 it('requires review and an explicit release before calling the send endpoint',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const create=vi.spyOn(apiClient,'createBroadcast').mockResolvedValue(result as never);
  await act(async()=>root.render(dialog()));await submit();
  expect(create).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Revise antes de iniciar');expect(button('Confirmar e iniciar disparo').disabled).toBe(true);
  expect(apiClient.prepareBroadcast).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('SIM Incluído');expect(document.body.textContent).toContain('SIM Excluído');
  await approveMessageTest();await act(async()=>Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)!.click());await act(async()=>button('Confirmar e iniciar disparo').click());
  expect(create).toHaveBeenCalledOnce();expect(create.mock.calls[0]?.[1].preparedAudienceId).toBe('SIM-prepared');expect(document.body.textContent).toContain('preparadas para envio');
 });
 it('keeps the review and reuses its request key after an uncertain failure',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const create=vi.spyOn(apiClient,'createBroadcast').mockRejectedValueOnce(new Error('Network failure')).mockResolvedValue(result as never);
  await act(async()=>root.render(dialog()));await submit();await approveMessageTest();await act(async()=>Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)!.click());
  await act(async()=>button('Confirmar e iniciar disparo').click());expect(document.body.textContent).toContain('Verifique sua conexão');
  await act(async()=>button('Conferir novamente o mesmo disparo').click());expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[0]?.[1].requestKey).toBe(create.mock.calls[1]?.[1].requestKey);
 });
 it('does not let an older audience count replace the currently selected filter',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const old=deferred<never>();vi.spyOn(apiClient,'getAudienceCount').mockReturnValueOnce(old.promise).mockResolvedValue({count:7} as never);
  await act(async()=>root.render(dialog()));await act(async()=>button('Filtro Inteligente').click());
  await act(async()=>{const filter=document.querySelector<HTMLSelectElement>('[aria-label="Critério do filtro de público"]')!;filter.value='PIX_ABANDONED';filter.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>old.resolve({count:99} as never));expect(document.body.textContent).toContain('7 contatos elegíveis');expect(document.body.textContent).not.toContain('99 contatos elegíveis');
 });
 it('does not restore a removed imported file after its read finishes',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const read=deferred<string>();
  await act(async()=>root.render(dialog()));await act(async()=>button('Planilha (CSV / Excel)').click());
  const file=new File(['SIMULADO'],'SIM-import.csv',{type:'text/csv'});Object.defineProperty(file,'text',{value:()=>read.promise});
  await act(async()=>{const field=document.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(field,'files',{value:[file],configurable:true});field.dispatchEvent(new Event('change',{bubbles:true}));});
  // Switching company also invalidates all file reads and recipients from the old company.
  await act(async()=>root.render(dialog('new')));await act(async()=>read.resolve('nome;telefone\nSIM Antigo;+5511999999999'));
  expect(document.body.textContent).not.toContain('SIM Antigo');expect(document.body.textContent).not.toContain('SIM-import.csv');
 });
 it('shows preflight failure with recovery instead of using stale channels',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockRejectedValueOnce(new Error('Consulta simulada falhou')).mockResolvedValue(preflight as never);
  await act(async()=>root.render(dialog()));expect(document.body.textContent).toContain('Consulta simulada falhou');expect(document.querySelector('form')).toBeNull();
  await act(async()=>button('Tentar novamente').click());expect(document.querySelector('form')).not.toBeNull();
 });
 it('shows failed campaign queries as unavailable and recovers to the real queued state',async()=>{
  vi.spyOn(apiClient,'getBroadcastCampaigns').mockRejectedValueOnce(new Error('Relatório indisponível')).mockResolvedValue({campaigns:[campaign]} as never);
  await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));
  expect(container.textContent).toContain('Relatório indisponível');expect(container.textContent).not.toContain('Nenhuma campanha encontrada');expect(container.textContent).not.toContain('Consulta concluída às');
  await act(async()=>button('Tentar novamente').click());expect(container.textContent).toContain('Na fila');expect(container.textContent).not.toContain('100% da fila');expect(container.textContent).toContain('0 de 2 destinatários');expect(container.textContent).toContain('Sem envios para calcular');expect(container.textContent).not.toContain('Concluído');expect(button('Cancelar próximos envios')).toBeDefined();
 });
 it('rejects a late campaign response from another company',async()=>{
  const old=deferred<never>();vi.spyOn(apiClient,'getBroadcastCampaigns').mockReturnValueOnce(old.promise).mockResolvedValue({campaigns:[]} as never);
  await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="old" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="new" token="synthetic" onOpenNewBroadcast={()=>{}}/>));
  await act(async()=>old.resolve({campaigns:[campaign]} as never));expect(container.textContent).not.toContain('Campanha simulada');
 });
 it('keeps confirmation blocked when the server preparation has no eligible recipients',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);vi.mocked(apiClient.prepareBroadcast).mockResolvedValue({...prepared,included:[]});const create=vi.spyOn(apiClient,'createBroadcast');
  await act(async()=>root.render(dialog()));await submit();await act(async()=>Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)!.click());
  expect(document.body.textContent).toContain('Nenhum destinatário elegível');expect(button('Confirmar e iniciar disparo').disabled).toBe(true);expect(create).not.toHaveBeenCalled();
 });
 it('preserves configuration and shows a preparation failure without allowing approval',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);vi.mocked(apiClient.prepareBroadcast).mockRejectedValue(new Error('Revisão indisponível'));
  await act(async()=>root.render(dialog()));await submit();
  expect(document.body.textContent).toContain('Revisão indisponível');expect(document.querySelector('form')).not.toBeNull();expect(button('Confirmar e iniciar disparo')).toBeUndefined();
 });
 it('does not offer local-only models as Meta-approved templates',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue({...preflight,channels:[{...preflight.channels[0],provider:'meta_waba',metaBillingConfigured:true}]} as never);
  await act(async()=>root.render(dialog()));expect(button('Revisar disparo').disabled).toBe(true);expect(document.body.textContent).toContain('Nenhum modelo cadastrado');
 });
 it('uses the placeholders in the actual body when legacy metadata names differ',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue({...preflight,templates:[{...preflight.templates[0],bodyText:'Olá {{1}}, oferta: {{2}}.',variables:['nome','oferta']}]} as never);
  await act(async()=>root.render(dialog()));const field=document.querySelector<HTMLInputElement>('input[placeholder="Confira este campo na prévia da mensagem"]')!;expect(field).not.toBeNull();
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'SIM Oferta');field.dispatchEvent(new Event('input',{bubbles:true}));});
  await submit();expect(vi.mocked(apiClient.prepareBroadcast).mock.calls[0]?.[1].variables?.['2']).toBe('SIM Oferta');expect(document.body.textContent).toContain('SIM Oferta');
 });
 it('blocks an ambiguous import until its phone column is explicitly selected',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);await act(async()=>root.render(dialog()));await act(async()=>button('Planilha (CSV / Excel)').click());
  await importCsv('Nome;Telefone principal;Telefone alternativo\nSIM Cliente;11999999999;21999999999');expect(button('Revisar disparo').disabled).toBe(true);expect(document.body.textContent).toContain('Escolha a coluna');
  await chooseColumn('Coluna de telefone','Telefone alternativo');await submit();expect(vi.mocked(apiClient.prepareBroadcast).mock.calls[0]?.[1].audience.importedContacts).toEqual([{phoneE164:'+5521999999999',name:'SIM Cliente'}]);
 });
 it('uses the new mapping immediately after returning from review and editing the column',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);await act(async()=>root.render(dialog()));await act(async()=>button('Planilha (CSV / Excel)').click());
  await importCsv('Nome;Telefone principal;Telefone alternativo\nSIM Cliente;11999999999;21999999999');await chooseColumn('Coluna de telefone','Telefone principal');await submit();
  await act(async()=>button('Voltar e editar').click());await chooseColumn('Coluna de telefone','Telefone alternativo');await submit();
  const calls=vi.mocked(apiClient.prepareBroadcast).mock.calls;expect(calls[0]?.[1].audience.importedContacts?.[0]?.phoneE164).toBe('+5511999999999');expect(calls[1]?.[1].audience.importedContacts?.[0]?.phoneE164).toBe('+5521999999999');
 });
 it('requires the international format choice before preparing a foreign phone number',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);await act(async()=>root.render(dialog()));await act(async()=>button('Planilha (CSV / Excel)').click());
  await importCsv('Nome;Telefone\nSIM Portugal;+351911222333');expect(button('Revisar disparo').disabled).toBe(true);await chooseColumn('Formato dos telefones','E164');await submit();expect(vi.mocked(apiClient.prepareBroadcast).mock.calls[0]?.[1].audience.importedContacts?.[0]?.phoneE164).toBe('+351911222333');
 });
 it('requires named cancellation review and permits keeping the campaign without a mutation',async()=>{
  vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[campaign]} as never);const cancel=vi.spyOn(apiClient,'cancelBroadcast');
  await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));
  await act(async()=>button('Cancelar próximos envios').click());expect(cancel).not.toHaveBeenCalled();expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Campanha simulada');
  await act(async()=>button('Manter campanha').click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(cancel).not.toHaveBeenCalled();
 });
 it('keeps cancellation errors inside the review and retries without double submissions',async()=>{
  vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[campaign]} as never);const wait=deferred<never>();const cancel=vi.spyOn(apiClient,'cancelBroadcast').mockRejectedValueOnce(new Error('Falha simulada')).mockReturnValueOnce(wait.promise);
  await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>button('Cancelar próximos envios').click());
  await act(async()=>button('Confirmar cancelamento').click());expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Falha simulada');
  await act(async()=>{button('Confirmar cancelamento').click();button('Confirmar cancelamento')?.click();});expect(cancel).toHaveBeenCalledTimes(2);expect(button('Cancelando...').disabled).toBe(true);
  vi.mocked(apiClient.getBroadcastCampaigns).mockResolvedValue({campaigns:[{...campaign,status:'cancelled'}]} as never);
  await act(async()=>wait.resolve({detail:'Novos envios foram bloqueados.'} as never));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(container.textContent).toContain('Cancelada');expect(button('Cancelar próximos envios')).toBeUndefined();
 });
 it('discards a cancellation review and response when switching company',async()=>{
  const wait=deferred<never>();vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[campaign]} as never).mockResolvedValue({campaigns:[]} as never);vi.spyOn(apiClient,'cancelBroadcast').mockReturnValue(wait.promise);
  await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>button('Cancelar próximos envios').click());await act(async()=>button('Confirmar cancelamento').click());
  await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="b" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>wait.resolve({detail:'Aviso da empresa anterior'} as never));
  expect(document.querySelector('[role="dialog"]')).toBeNull();expect(container.textContent).not.toContain('Aviso da empresa anterior');expect(container.textContent).not.toContain('Campanha simulada');
 });

 it('keeps release blocked while a test is only queued and then requires human review after confirmation',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);vi.mocked(apiClient.getBroadcastTests).mockResolvedValueOnce({tests:[{id:'SIM-test',variant:'A',phoneE164:'+5511999999999',body:'SIM teste',status:'pending'}]}).mockResolvedValue({tests:[{id:'SIM-test',variant:'A',phoneE164:'+5511999999999',body:'SIM teste',status:'sent'}]});
  await act(async()=>root.render(dialog()));await submit();await act(async()=>{const field=document.querySelector<HTMLInputElement>('input[type="tel"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'+5511999999999');field.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Enviar teste A').click());expect(document.body.textContent).toContain('Aguardando envio');expect(button('Confirmar e iniciar disparo').disabled).toBe(true);
  await act(async()=>button('Atualizar resultado do teste').click());expect(document.body.textContent).toContain('Envio confirmado pelo provedor');expect(button('Confirmar e iniciar disparo').disabled).toBe(true);
  await act(async()=>document.querySelector<HTMLInputElement>('section[aria-label="Teste da mensagem"] input[type="checkbox"]')!.click());expect(button('Confirmar e iniciar disparo').disabled).toBe(true);
 });
 it('preserves the review after a test query fails and offers a query without another send',async()=>{
  vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);vi.mocked(apiClient.getBroadcastTests).mockRejectedValueOnce(new Error('Consulta simulada indisponível')).mockResolvedValue({tests:[]});
  await act(async()=>root.render(dialog()));await submit();await act(async()=>button('Atualizar resultado do teste').click());expect(document.body.textContent).toContain('Consulta simulada indisponível');
  await act(async()=>button('Atualizar resultado do teste').click());expect(apiClient.sendBroadcastTest).not.toHaveBeenCalled();expect(button('Confirmar e iniciar disparo').disabled).toBe(true);
 });

});

it('reads an Excel workbook on demand and preserves the mapped phone',async()=>{
 const XLSX=await import('xlsx');const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{Nome:'SIM Excel',Telefone:'+5511999999999'}]),'SIM');const buffer=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);await act(async()=>root.render(dialog()));await act(async()=>button('Planilha (CSV / Excel)').click());
 const file=new File([],'SIM-audience.xlsx');Object.defineProperty(file,'arrayBuffer',{value:async()=>buffer});
 await act(async()=>{const field=document.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(field,'files',{value:[file],configurable:true});field.dispatchEvent(new Event('change',{bubbles:true}));});
 await submit();expect(vi.mocked(apiClient.prepareBroadcast).mock.calls[0]?.[1].audience.importedContacts).toEqual([{phoneE164:'+5511999999999',name:'SIM Excel'}]);
});
it('does not prepare an audience when the spreadsheet reader cannot load',async()=>{
 vi.spyOn(importAudience,'loadSpreadsheetLibrary').mockRejectedValue(new Error('SIM leitor indisponível; selecione novamente'));
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);await act(async()=>root.render(dialog()));await act(async()=>button('Planilha (CSV / Excel)').click());
 const file=new File([],'SIM-failure.xlsx');Object.defineProperty(file,'arrayBuffer',{value:async()=>new ArrayBuffer(0)});
 await act(async()=>{const field=document.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(field,'files',{value:[file],configurable:true});field.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(document.body.textContent).toContain('SIM leitor indisponível');expect(button('Revisar disparo').disabled).toBe(true);expect(apiClient.prepareBroadcast).not.toHaveBeenCalled();
});

it('does not show zero-percent A/B rates or an equal-sample claim without delivered messages',async()=>{
 const variant={templateName:'SIM variant',category:'UTILITY',sent:0,delivered:0,read:0,replied:0,openRate:0,replyRate:0};
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[{...campaign,isAbTest:true,abReport:{winner:'TIED',variantA:variant,variantB:variant}}]} as never);
 await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));const region=document.querySelector('[role=region]')!;
 expect(region.textContent).toContain('Sem entregas confirmadas para comparar taxas');expect(region.textContent).toContain('Sem base');expect(region.textContent).toContain('Quantidade de vendas não informada');expect(region.textContent).not.toContain('50%');expect(region.textContent).not.toContain('0%');
});
it('shows the denominator for each A/B variant and keeps observed zero rates when there is a base',async()=>{
 const variant={templateName:'SIM variant',category:'UTILITY',sent:3,delivered:2,read:0,replied:0,openRate:0,replyRate:0,salesCount:0,salesFormatted:'R$ 0,00',conversionRate:0};
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[{...campaign,isAbTest:true,abReport:{winner:'TIED',variantA:variant,variantB:{...variant,sent:2,delivered:1}}}]} as never);
 await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));const region=document.querySelector('[role=region]')!;
 expect(region.textContent).toContain('3 envios · 2 entregas confirmadas');expect(region.textContent).toContain('2 envios · 1 entregas confirmadas');expect(region.textContent).toContain('0%');expect(region.textContent).not.toContain('Sem base');expect(region.textContent).not.toContain('não informada');
});

it.each(['operator','manager','analyst',undefined,'SIM-unknown'])('does not offer cancellation without workspace management permission (%s)',async(role)=>{
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[campaign]} as never);const cancel=vi.spyOn(apiClient,'cancelBroadcast');await act(async()=>root.render(<CampaignsList workspaceRole={role} workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));expect(container.textContent).toContain('Campanha simulada');expect(button('Cancelar próximos envios')).toBeUndefined();expect(container.textContent).toContain('exige proprietário ou administrador');expect(cancel).not.toHaveBeenCalled();
});
it.each(['owner','admin'])('allows an authorized profile to review cancellation (%s)',async(role)=>{
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[campaign]} as never);const cancel=vi.spyOn(apiClient,'cancelBroadcast');await act(async()=>root.render(<CampaignsList workspaceRole={role} workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>button('Cancelar próximos envios').click());expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(cancel).not.toHaveBeenCalled();
});
it('passes the current profile from the templates page and dismisses an open review when access changes',async()=>{
 vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[]} as never);vi.spyOn(apiClient,'getChannels').mockResolvedValue({channels:[]} as never);vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[campaign]} as never);const cancel=vi.spyOn(apiClient,'cancelBroadcast');
 const page=(role:string)=><TemplatesPage session={{activeWorkspace:{id:'a',role},token:'synthetic'} as never}/>;
 await act(async()=>root.render(page('operator')));await act(async()=>button('Campanhas & Testes A/B').click());expect(button('Cancelar próximos envios')).toBeUndefined();
 await act(async()=>root.render(page('owner')));await act(async()=>button('Cancelar próximos envios').click());expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 await act(async()=>root.render(page('operator')));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(button('Cancelar próximos envios')).toBeUndefined();expect(cancel).not.toHaveBeenCalled();
});
it('ignores a cancellation result after permission is revoked without refreshing the old view',async()=>{
 const wait=deferred<never>();const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns:[campaign]} as never);vi.spyOn(apiClient,'cancelBroadcast').mockReturnValue(wait.promise);
 const view=(role:string)=><CampaignsList workspaceRole={role} workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>;
 await act(async()=>root.render(view('owner')));await act(async()=>button('Cancelar próximos envios').click());await act(async()=>button('Confirmar cancelamento').click());await act(async()=>root.render(view('operator')));await act(async()=>wait.resolve({detail:'SIM old owner result'} as never));expect(container.textContent).not.toContain('SIM old owner result');expect(get).toHaveBeenCalledTimes(2);expect(button('Cancelar próximos envios')).toBeUndefined();
});

it('serializes preparation and keeps all editable fields locked until its snapshot returns',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const wait=deferred<typeof prepared>();const prepare=vi.mocked(apiClient.prepareBroadcast).mockReturnValue(wait.promise);
 await act(async()=>root.render(dialog()));await act(async()=>{const form=document.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(prepare).toHaveBeenCalledOnce();expect(document.querySelector('fieldset')!.disabled).toBe(true);expect(button('Cancelar').disabled).toBe(true);
 await act(async()=>wait.resolve(prepared));expect(document.body.textContent).toContain('Revise antes de iniciar');expect(document.querySelector('fieldset')!.disabled).toBe(false);
});
it('does not let an old preparation finish or unlock the request in a new company',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const old=deferred<typeof prepared>(),current=deferred<typeof prepared>();vi.mocked(apiClient.prepareBroadcast).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
 await act(async()=>root.render(dialog('old')));await submit();await act(async()=>root.render(dialog('new')));await submit();await act(async()=>old.resolve({...prepared,preparedAudienceId:'SIM-old'}));
 expect(document.querySelector('fieldset')!.disabled).toBe(true);expect(document.body.textContent).not.toContain('Revise antes de iniciar');await act(async()=>current.resolve({...prepared,preparedAudienceId:'SIM-new'}));expect(document.body.textContent).toContain('Revise antes de iniciar');
});
it('serializes final confirmation and preserves the exact submission after an uncertain result even after local expiry',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);let reject!:(reason:unknown)=>void;const create=vi.spyOn(apiClient,'createBroadcast').mockReturnValueOnce(new Promise((_,r)=>{reject=r;})).mockResolvedValue(result as never);
 await act(async()=>root.render(dialog()));await submit();await approveMessageTest();await act(async()=>Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)!.click());
 await act(async()=>{button('Confirmar e iniciar disparo').click();button('Confirmar e iniciar disparo').click();});expect(create).toHaveBeenCalledOnce();
 await act(async()=>reject(new Error('SIM resultado desconhecido')));expect(document.body.textContent).toContain('Resultado incerto');expect(button('Voltar e editar').disabled).toBe(true);expect(button('Atualizar resultado do teste').disabled).toBe(true);expect(document.querySelector<HTMLInputElement>('section[aria-label="Teste da mensagem"] input[type="checkbox"]')!.disabled).toBe(true);
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2100-01-01T00:00:00Z'));
 await act(async()=>button('Conferir novamente o mesmo disparo').click());expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[1]?.[1]).toEqual(create.mock.calls[0]?.[1]);expect(document.body.textContent).toContain('Solicitação da campanha confirmada');
});
it('reviews draft cancellation and route exits without sending a message or erasing an edited name',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const create=vi.spyOn(apiClient,'createBroadcast'),test=vi.mocked(apiClient.sendBroadcastTest),close=vi.fn();
 await act(async()=>root.render(<BroadcastTemplateDialog isOpen workspaceId="SIM" token="synthetic" onClose={close}/>));const field=document.querySelector<HTMLInputElement>('input[placeholder="Ex: Oferta Relâmpago - Leads Qualificados"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'SIM campanha editada');field.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button('Cancelar').click());expect(close).not.toHaveBeenCalled();expect(document.querySelector('fieldset')!.disabled).toBe(true);
 await act(async()=>button('Continuar editando').click());expect(field.value).toBe('SIM campanha editada');expect(document.activeElement).toBe(field);
 const {requestNavigation}=await import('../utils/request-navigation');const leave=vi.fn();await act(async()=>requestNavigation(leave));expect(leave).not.toHaveBeenCalled();await act(async()=>button('Descartar alterações').click());expect(leave).toHaveBeenCalledOnce();expect(create).not.toHaveBeenCalled();expect(test).not.toHaveBeenCalled();
});
it('does not warn when closing an untouched dialog after automatic channel and template selection',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const close=vi.fn();await act(async()=>root.render(<BroadcastTemplateDialog isOpen workspaceId="SIM" token="synthetic" onClose={close}/>));await act(async()=>button('Cancelar').click());expect(close).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();
});
it('locks channel selection during discard review and restores it only after continuing',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue({...preflight,channels:[...preflight.channels,{...preflight.channels[0],id:'SIM-other',displayName:'Outro canal simulado'}]} as never);
 await act(async()=>root.render(dialog()));const other=document.querySelector<HTMLButtonElement>('[aria-label="Canal Outro canal simulado"]')!;
 await act(async()=>other.click());expect(other.getAttribute('aria-pressed')).toBe('true');await act(async()=>button('Cancelar').click());expect(other.disabled).toBe(true);
 const first=document.querySelector<HTMLButtonElement>('[aria-label="Canal Canal simulado"]')!;await act(async()=>first.click());expect(first.getAttribute('aria-pressed')).toBe('false');expect(other.getAttribute('aria-pressed')).toBe('true');
 await act(async()=>button('Continuar editando').click());expect(first.disabled).toBe(false);await act(async()=>first.click());expect(first.getAttribute('aria-pressed')).toBe('true');
 expect(apiClient.prepareBroadcast).not.toHaveBeenCalled();expect(apiClient.sendBroadcastTest).not.toHaveBeenCalled();
});
it('keeps a confirmed campaign separate from a failure to refresh the local list',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const create=vi.spyOn(apiClient,'createBroadcast').mockResolvedValue(result as never),refresh=vi.fn(()=>Promise.reject(new Error('SIM atualização local falhou')));
 await act(async()=>root.render(<BroadcastTemplateDialog isOpen workspaceId="SIM" token="synthetic" onClose={()=>{}} onBroadcastSuccess={refresh}/>));await submit();await approveMessageTest();await act(async()=>Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)!.click());await act(async()=>button('Confirmar e iniciar disparo').click());
 expect(create).toHaveBeenCalledOnce();expect(refresh).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('Solicitação da campanha confirmada');expect(document.body.textContent).toContain('SIM atualização local falhou');expect(button('Conferir novamente o mesmo disparo')).toBeUndefined();
});

it('ignores an old confirmation error after the same dialog closes and reopens with another preparation running',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);const current=deferred<typeof prepared>();vi.mocked(apiClient.prepareBroadcast).mockResolvedValueOnce(prepared).mockReturnValueOnce(current.promise);let reject!:(reason:unknown)=>void;vi.spyOn(apiClient,'createBroadcast').mockReturnValue(new Promise((_,r)=>{reject=r;}));
 await act(async()=>root.render(dialog()));await submit();await approveMessageTest();await act(async()=>Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).at(-1)!.click());await act(async()=>button('Confirmar e iniciar disparo').click());
 await act(async()=>root.render(<BroadcastTemplateDialog isOpen={false} workspaceId="a" token="synthetic" onClose={()=>{}}/>));await act(async()=>root.render(dialog()));await submit();await act(async()=>reject(new Error('SIM erro de confirmação antigo')));
 expect(document.querySelector('fieldset')!.disabled).toBe(true);expect(document.body.textContent).not.toContain('SIM erro de confirmação antigo');await act(async()=>current.resolve({...prepared,preparedAudienceId:'SIM-reopened'}));expect(document.body.textContent).toContain('Revise antes de iniciar');expect(document.body.textContent).not.toContain('Resultado incerto');
});


it('keeps the nested saved author open when refreshing campaign templates fails without creating twice',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValueOnce(preflight as never).mockRejectedValueOnce(new Error('SIM refresh indisponível'));const save=vi.spyOn(apiClient,'createTemplate').mockResolvedValue({template:{id:'SIM-new'}} as never);
 await act(async()=>root.render(dialog()));await act(async()=>button('Criar Modelo com IA').click());const author=Array.from(document.querySelectorAll('[role="dialog"]')).find(node=>node.textContent?.includes('Salvar rascunho local'))!;
 const name=author.querySelector<HTMLInputElement>('input[placeholder="ex: confirmacao_proposta_v1"]')!,body=author.querySelector<HTMLTextAreaElement>('[aria-label="Corpo da mensagem"]')!;
 await act(async()=>{for(const [field,text] of [[name,'sim_nested'],[body,'SIM mensagem local']] as const){Object.getOwnPropertyDescriptor(field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(field,text);field.dispatchEvent(new Event('input',{bubbles:true}));}});
 await act(async()=>author.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('Rascunho salvo. A lista não foi atualizada');expect(button('Salvar rascunho local').disabled).toBe(true);
 await act(async()=>author.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(save).toHaveBeenCalledOnce();
});
it('reviews the nested draft first and only then the campaign when leaving by global navigation',async()=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(preflight as never);await act(async()=>root.render(dialog()));const name=document.querySelector<HTMLInputElement>('input[placeholder="Ex: Oferta Relâmpago - Leads Qualificados"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'SIM campanha preservada');name.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>button('Criar Modelo com IA').click());const childName=document.querySelector<HTMLInputElement>('input[placeholder="ex: confirmacao_proposta_v1"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(childName,'sim_modelo_preservado');childName.dispatchEvent(new Event('input',{bubbles:true}));});const {requestNavigation}=await import('../utils/request-navigation');const leave=vi.fn();await act(async()=>requestNavigation(leave));
 expect(document.querySelectorAll('[aria-label="Alterações não salvas"]')).toHaveLength(1);expect(childName.disabled).toBe(true);expect(name.disabled).toBe(false);await act(async()=>button('Continuar editando').click());expect(childName.value).toBe('sim_modelo_preservado');expect(document.activeElement).toBe(childName);expect(leave).not.toHaveBeenCalled();
 await act(async()=>requestNavigation(leave));await act(async()=>button('Descartar alterações').click());expect(document.querySelector('input[placeholder="ex: confirmacao_proposta_v1"]')).toBeNull();expect(document.querySelectorAll('[aria-label="Alterações não salvas"]')).toHaveLength(1);expect(name.closest('fieldset')!.disabled).toBe(true);expect(leave).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(name.value).toBe('SIM campanha preservada');expect(document.activeElement).toBe(name);expect(leave).not.toHaveBeenCalled();
});


it('keeps campaign query controls locked through cancellation and its refresh without repeating the mutation',async()=>{
 const cancelWait=deferred<never>(),refresh=deferred<never>();const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[campaign]} as never).mockReturnValueOnce(refresh.promise);const cancel=vi.spyOn(apiClient,'cancelBroadcast').mockReturnValue(cancelWait.promise);
 await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>button('Cancelar próximos envios').click());
 await act(async()=>{button('Confirmar cancelamento').click();button('Atualizar Métricas').click();button('Testes A/B').click();document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.querySelector('[role="dialog"] button[aria-label="Fechar diálogo"]')?.dispatchEvent(new Event('click',{bubbles:true}));});
 expect(cancel).toHaveBeenCalledOnce();expect(get).toHaveBeenCalledOnce();expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(button('Atualizar Métricas').disabled).toBe(true);expect(button('Testes A/B').disabled).toBe(true);expect(button('Buscar campanhas').disabled).toBe(true);
 await act(async()=>cancelWait.resolve({detail:'SIM cancelamento confirmado'} as never));expect(get).toHaveBeenCalledTimes(2);expect(button('Atualizar Métricas').disabled).toBe(true);expect(document.body.textContent).toContain('SIM cancelamento confirmado');
 await act(async()=>refresh.resolve({campaigns:[{...campaign,status:'cancelled'}]} as never));expect(button('Atualizar Métricas').disabled).toBe(false);expect(button('Cancelar próximos envios')).toBeUndefined();expect(cancel).toHaveBeenCalledOnce();
});
it('requires a successful fresh campaign query before cancelling or loading more after a refresh failure',async()=>{
 const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[campaign],pagination:{hasMore:true,nextCursor:{createdAt:'2026-10-18T12:00:00Z',id:'SIM-cursor'}}} as never).mockRejectedValueOnce(new Error('SIM consulta falhou')).mockResolvedValueOnce({campaigns:[campaign]} as never);const cancel=vi.spyOn(apiClient,'cancelBroadcast');
 await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>button('Atualizar Métricas').click());expect(document.body.textContent).toContain('SIM consulta falhou');expect(document.body.textContent).toContain('Campanha simulada');expect(button('Cancelar próximos envios').disabled).toBe(true);expect(button('Carregar mais campanhas').disabled).toBe(true);
 await act(async()=>{button('Cancelar próximos envios').click();button('Carregar mais campanhas').click();});expect(get).toHaveBeenCalledTimes(2);expect(cancel).not.toHaveBeenCalled();await act(async()=>button('Tentar novamente').click());expect(button('Cancelar próximos envios').disabled).toBe(false);
});
it('serializes manual refresh and drops a cancellation target that is no longer eligible in the new query',async()=>{
 const refresh=deferred<never>();const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[campaign]} as never).mockReturnValueOnce(refresh.promise);const cancel=vi.spyOn(apiClient,'cancelBroadcast');
 await act(async()=>root.render(<CampaignsList workspaceRole="owner" workspaceId="a" token="synthetic" onOpenNewBroadcast={()=>{}}/>));await act(async()=>button('Cancelar próximos envios').click());await act(async()=>{button('Atualizar Métricas').click();button('Atualizar Métricas').click();button('Confirmar cancelamento').click();});expect(get).toHaveBeenCalledTimes(2);expect(cancel).not.toHaveBeenCalled();expect(button('Confirmar cancelamento').disabled).toBe(true);
 await act(async()=>refresh.resolve({campaigns:[{...campaign,status:'completed'}]} as never));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(button('Cancelar próximos envios')).toBeUndefined();expect(cancel).not.toHaveBeenCalled();
});


it.each([{...preflight,channels:undefined},{...preflight,templates:null},{...preflight,totalActiveContacts:undefined},{...preflight,success:false}])('does not release campaign preparation after an incomplete preflight: %j',async response=>{
 vi.spyOn(apiClient,'getBroadcastPreflight').mockResolvedValue(response as never);const create=vi.spyOn(apiClient,'createBroadcast');await act(async()=>root.render(dialog()));expect(document.body.textContent).toContain('A consulta não confirmou canais, modelos e público válidos');expect(document.querySelector('form')).toBeNull();expect(create).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('Revise antes de iniciar');
});
