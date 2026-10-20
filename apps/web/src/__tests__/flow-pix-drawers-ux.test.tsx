// @vitest-environment happy-dom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {PixDrawer,parsePixAmountCents} from "../pages/cockpit/drawers/PixDrawer";
import {requestNavigation} from "../utils/request-navigation";
import {FlowDrawer} from "../pages/cockpit/drawers/FlowDrawer";
import {apiClient,type CommercialThreadSummary} from "../services/api-client";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;const close=vi.fn(),changed=vi.fn();
const thread={id:'SIM-thread',contactId:'SIM-contact',channelInstanceId:'SIM-channel',contactPhone:'+5511999999999',channelProvider:'meta_waba'} as CommercialThreadSummary;
const charge={id:'SIM-charge',workspaceId:'SIM-a',threadId:'SIM-thread',contactId:'SIM-contact',title:'SIM Cobrança',status:'PENDING',pixCode:'SIM_PIX_CODE',pixQrUrl:null,amountFormatted:'R$ 123,45',amountCents:12345,expiresAt:'2099-01-01T00:00:00Z',createdAt:'2026-10-17T12:00:00Z'};
const flow={id:'SIM-flow',workspaceId:'SIM-a',name:'SIM Formulário',status:'PUBLISHED',metaFlowId:'123456',bodyText:'SIM pergunta',initialScreen:'FIRST',ctaLabel:'Abrir'};
const button=(name:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===name)!;
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
const pix=(t=thread)=><PixDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={t} onPixCreated={changed}/>;
const flows=(t=thread)=><FlowDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={t}/>;
async function fill(index:number,value:string){await act(async()=>{const input=document.querySelectorAll<HTMLInputElement>('input')[index]!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{close.mockReset();changed.mockReset();container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);vi.spyOn(apiClient,'getPixChargesByThread').mockResolvedValue({charges:[],total:0});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('parses Brazilian amounts strictly and never silently multiplies malformed decimals',()=>{
 expect(parsePixAmountCents('1.234,56')).toBe(123456);expect(parsePixAmountCents('123,4')).toBe(12340);expect(parsePixAmountCents('100')).toBe(10000);for(const value of ['100.00','12abc','1,234','-2','Infinity','99999999999999999'])expect(parsePixAmountCents(value)).toBe(0);
});
it('distinguishes failed charge query from empty history and recovers',async()=>{
 vi.mocked(apiClient.getPixChargesByThread).mockRejectedValueOnce(new Error('SIM consulta falhou')).mockResolvedValue({charges:[],total:0});await act(async()=>root.render(pix()));expect(document.body.textContent).toContain('SIM consulta falhou');expect(document.body.textContent).not.toContain('Nenhuma cobrança gerada');await act(async()=>button('Tentar novamente').click());expect(document.body.textContent).toContain('Nenhuma cobrança gerada');
});
it('keeps the created charge after message failure and retries only its send',async()=>{
 const create=vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge} as never),send=vi.spyOn(apiClient,'sendOutboundMessage').mockRejectedValueOnce(new Error('SIM mensagem incerta')).mockResolvedValue({} as never);
 await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());expect(document.body.textContent).toContain('Cobrança criada');expect(send).not.toHaveBeenCalled();vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);await act(async()=>button('Enviar esta cobrança').click());expect(document.body.textContent).toContain('SIM mensagem incerta');expect(create).toHaveBeenCalledOnce();await act(async()=>button('Tentar enviar esta cobrança').click());expect(create).toHaveBeenCalledOnce();expect(send.mock.calls[0]?.[2].idempotencyKey).toBe(send.mock.calls[1]?.[2].idempotencyKey);expect(document.body.textContent).toContain('Mensagem preparada na fila');
});
it('reuses a creation key after an uncertain failure and rejects empty validity',async()=>{
 const create=vi.spyOn(apiClient,'createPixCharge').mockRejectedValue(new Error('SIM criação incerta'));await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await fill(2,'');await act(async()=>button('Criar cobrança Pix').click());expect(create).not.toHaveBeenCalled();await fill(2,'60');await act(async()=>button('Criar cobrança Pix').click());await act(async()=>button('Criar cobrança Pix').click());expect(create.mock.calls[0]?.[2].requestKey).toBe(create.mock.calls[1]?.[2].requestKey);
});
it('does not send a newly created charge into a switched conversation',async()=>{
 const wait=deferred<never>();vi.spyOn(apiClient,'createPixCharge').mockReturnValue(wait.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());await act(async()=>root.render(pix({...thread,id:'SIM-other'})));await act(async()=>wait.resolve({charge} as never));expect(send).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('SIM_PIX_CODE');
});
it('requires a named cashier review and does not claim WhatsApp delivery',async()=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);const confirm=vi.spyOn(apiClient,'confirmPixPayment').mockResolvedValue({success:true,charge:{id:charge.id,status:'PAID',paidAt:'2026-10-17T12:00:00Z',amountCents:charge.amountCents,amountFormatted:charge.amountFormatted,verificationMethod:'MANUAL_CASHIER',verifiedAt:'2026-10-17T12:00:00Z',verifiedByUserId:'SIM-owner'}} as never);await act(async()=>root.render(pix()));await act(async()=>button('Confirmar Recebimento (Caixa)').click());expect(confirm).not.toHaveBeenCalled();expect(document.querySelector('[role="dialog"]')?.textContent).toContain('SIM Cobrança');await act(async()=>button('Conferi o crédito e confirmo o recebimento').click());expect(confirm).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('Recebimento registrado no caixa');expect(document.body.textContent).not.toContain('Mensagem de confirmação enviada');
});
it('avoids querying native Flows in an incompatible channel and never claims an empty catalogue',async()=>{
 const query=vi.spyOn(apiClient,'getFlows');await act(async()=>root.render(flows({...thread,channelProvider:'waha'})));expect(query).not.toHaveBeenCalled();expect(document.body.textContent).toContain('exigem um canal Meta');expect(document.body.textContent).not.toContain('Nenhum formulário cadastrado');expect(document.body.textContent).not.toContain('Revisar formulário');
});
it('shows Flow load failure with retry before declaring a verified empty list',async()=>{
 vi.spyOn(apiClient,'getFlows').mockRejectedValueOnce(new Error('SIM Flow indisponível')).mockResolvedValue({flows:[]} as never);await act(async()=>root.render(flows()));expect(document.body.textContent).toContain('SIM Flow indisponível');expect(document.body.textContent).not.toContain('Nenhum formulário cadastrado');await act(async()=>button('Tentar novamente').click());expect(document.body.textContent).toContain('Nenhum formulário cadastrado');
});
it('reuses Flow send identity after error and ignores completion for a prior thread',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValue({flows:[flow]} as never);const wait=deferred<never>();const send=vi.spyOn(apiClient,'sendOutboundMessage').mockRejectedValueOnce(new Error('SIM envio incerto')).mockReturnValueOnce(wait.promise);await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('SIM pergunta');expect(document.body.textContent).toContain(thread.contactPhone);await act(async()=>button('Confirmar envio do formulário').click());await act(async()=>button('Confirmar envio do formulário').click());expect(send.mock.calls[0]?.[2].idempotencyKey).toBe(send.mock.calls[1]?.[2].idempotencyKey);await act(async()=>root.render(flows({...thread,id:'SIM-new'})));await act(async()=>wait.resolve({} as never));expect(document.body.textContent).not.toContain('Formulário colocado na fila');
});

it('never sends a recovered charge that is already paid',async()=>{
 vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge:{...charge,status:'PAID'}} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('não está pendente e válida');
});

it('clears Flow review when the channel changes even with the same conversation id',async()=>{
 const query=vi.spyOn(apiClient,'getFlows').mockResolvedValue({flows:[flow]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());await act(async()=>root.render(flows({...thread,channelProvider:'waha'})));expect(document.body.textContent).not.toContain('Confirmar envio do formulário');expect(query).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();
});
it('does not declare no Flows when company access or conversation is missing',async()=>{
 const query=vi.spyOn(apiClient,'getFlows');await act(async()=>root.render(<FlowDrawer isOpen onClose={close} thread={thread}/>));expect(document.body.textContent).toContain('confirmação do acesso');expect(document.body.textContent).not.toContain('Nenhum formulário cadastrado');expect(query).not.toHaveBeenCalled();
});

it('keeps queued success separate from a message refresh failure and clears the reviewed action',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValue({flows:[flow]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({} as never);const refresh=vi.fn().mockRejectedValue(new Error('SIM refresh unavailable'));await act(async()=>root.render(<FlowDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={thread} onFlowQueued={refresh}/>));await act(async()=>button('Revisar formulário').click());expect(send).not.toHaveBeenCalled();await act(async()=>button('Confirmar envio do formulário').click());expect(send).toHaveBeenCalledOnce();expect(refresh).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('não repita o envio');expect(document.body.textContent).not.toContain('Confirmar envio do formulário');
});

it('identifies a proposal-linked charge without sending or settling it',async()=>{vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,proposalId:'SIM-proposal'}],total:1} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage'),settle=vi.spyOn(apiClient,'confirmPixPayment');await act(async()=>root.render(pix()));expect(document.body.textContent).toContain('Origem: proposta comercial vinculada');expect(send).not.toHaveBeenCalled();expect(settle).not.toHaveBeenCalled();});

it('preserves a flow review while its channel is unavailable and requires explicit confirmation after recovery',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValue({flows:[flow]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({} as never);const view=(reason?:string)=><FlowDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={thread} sendBlockedReason={reason}/>;await act(async()=>root.render(view('SIM canal indisponível')));await act(async()=>button('Revisar formulário').click());expect(document.body.textContent).toContain('SIM canal indisponível');expect(button('Confirmar envio do formulário').disabled).toBe(true);await act(async()=>button('Confirmar envio do formulário').click());expect(send).not.toHaveBeenCalled();await act(async()=>root.render(view()));expect(document.querySelector('[aria-label="Revisão do formulário"]')).not.toBeNull();expect(button('Confirmar envio do formulário').disabled).toBe(false);expect(send).not.toHaveBeenCalled();
});

it('creates a charge without sending while the channel is unavailable and preserves a confirmed result after callback failure',async()=>{
 const create=vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge} as never),send=vi.spyOn(apiClient,'sendOutboundMessage');changed.mockRejectedValue(new Error('SIM refresh'));await act(async()=>root.render(<PixDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={thread} sendBlockedReason="SIM canal indisponível" onPixCreated={changed}/>));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());expect(create).toHaveBeenCalledOnce();expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('SIM_PIX_CODE');expect(document.body.textContent).toContain('resultado da cobrança foi preservado');expect(button('Enviar esta cobrança').disabled).toBe(true);expect(button('Criar cobrança Pix')).toBeUndefined();
});
it('reuses an existing charge and separates successful queueing from a failed context refresh',async()=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);const create=vi.spyOn(apiClient,'createPixCharge'),send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({} as never);changed.mockRejectedValue(new Error('SIM refresh'));await act(async()=>root.render(pix()));await act(async()=>button('Preparar envio desta cobrança').click());expect(create).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();await act(async()=>{button('Enviar esta cobrança').click();button('Enviar esta cobrança').click();});expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0]?.[2].idempotencyKey).toBe(`pix_charge_${charge.id}`);expect(document.body.textContent).toContain('Mensagem preparada na fila');expect(document.body.textContent).toContain('resultado da cobrança foi preservado');expect(button('Tentar enviar esta cobrança')).toBeUndefined();expect(create).not.toHaveBeenCalled();
});
it('does not send a charge that was paid after its review opened',async()=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValueOnce({charges:[charge],total:1} as never).mockResolvedValueOnce({charges:[{...charge,status:'PAID'}],total:1} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(pix()));await act(async()=>button('Preparar envio desta cobrança').click());await act(async()=>button('Enviar esta cobrança').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('não está pendente e válida');expect(button('Tentar enviar esta cobrança').disabled).toBe(true);
});
it('updates changed charge details for review without sending silently',async()=>{
 const latest={...charge,pixCode:'SIM_PIX_ATUALIZADO'};vi.mocked(apiClient.getPixChargesByThread).mockResolvedValueOnce({charges:[charge],total:1} as never).mockResolvedValue({charges:[latest],total:1} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({} as never);await act(async()=>root.render(pix()));await act(async()=>button('Preparar envio desta cobrança').click());await act(async()=>button('Enviar esta cobrança').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Os dados da cobrança mudaram');expect(document.body.textContent).toContain('SIM_PIX_ATUALIZADO');await act(async()=>button('Tentar enviar esta cobrança').click());expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0]?.[2].body).toContain('SIM_PIX_ATUALIZADO');
});
it('rechecks channel availability after the fresh charge query before queueing its message',async()=>{
 const pending=deferred<never>();vi.mocked(apiClient.getPixChargesByThread).mockResolvedValueOnce({charges:[charge],total:1} as never).mockReturnValueOnce(pending.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage');const view=(reason?:string)=><PixDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={thread} sendBlockedReason={reason}/>;await act(async()=>root.render(view()));await act(async()=>button('Preparar envio desta cobrança').click());await act(async()=>button('Enviar esta cobrança').click());await act(async()=>root.render(view('SIM conexão perdida')));await act(async()=>pending.resolve({charges:[charge],total:1} as never));expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('SIM conexão perdida');expect(button('Tentar enviar esta cobrança').disabled).toBe(true);
});


it('reviews a Pix draft before closing and restores its values and focus when editing continues',async()=>{
 await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(0,'SIM rascunho preservado');await fill(1,'42,90');await fill(2,'120');
 await act(async()=>button('Fechar').click());expect(close).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();expect(button('Criar cobrança Pix').disabled).toBe(true);expect(document.querySelector('input')!.closest('fieldset')!.disabled).toBe(true);
 await act(async()=>button('Continuar editando').click());expect(Array.from(document.querySelectorAll<HTMLInputElement>('input')).map(i=>i.value)).toEqual(['SIM rascunho preservado','42,90','120']);expect(document.activeElement).toBe(document.querySelector('input'));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]')!.click());expect(close).not.toHaveBeenCalled();await act(async()=>button('Descartar alterações').click());expect(close).toHaveBeenCalledOnce();
});
it('protects a hidden Pix draft during navigation and reload but leaves an untouched form without a review',async()=>{
 const navigate=vi.fn();await act(async()=>root.render(pix()));await act(async()=>requestNavigation(navigate));expect(navigate).toHaveBeenCalledOnce();navigate.mockClear();await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'25,00');await act(async()=>{Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Cobranças (0)')!.click();});
 const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);await act(async()=>requestNavigation(navigate));expect(navigate).not.toHaveBeenCalled();await act(async()=>button('Continuar editando').click());expect(navigate).not.toHaveBeenCalled();await act(async()=>requestNavigation(navigate));await act(async()=>button('Descartar alterações').click());expect(navigate).toHaveBeenCalledOnce();
});
it('does not label a saved Pix charge as an unsaved draft when closing',async()=>{
 vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge} as never);await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());await act(async()=>button('Fechar').click());expect(close).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(false);
});
it('cannot dismiss a Pix creation in flight through the drawer close control',async()=>{
 const pending=deferred<never>();vi.spyOn(apiClient,'createPixCharge').mockReturnValue(pending.promise);await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]')!.click());expect(close).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();const navigate=vi.fn();await act(async()=>requestNavigation(navigate));expect(button('Descartar alterações').disabled).toBe(true);await act(async()=>button('Descartar alterações').click());expect(navigate).not.toHaveBeenCalled();await act(async()=>pending.resolve({charge} as never));expect(document.body.textContent).toContain('Cobrança criada');
});

it('consumes the saved Pix form without leaving a phantom draft behind its charge list',async()=>{
 vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge} as never);await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());await act(async()=>button('Ver Lista de Cobranças').click());await act(async()=>button('Fechar').click());expect(close).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();
});
it('reviews an unsaved new charge before replacing it with an existing charge preview',async()=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);await act(async()=>root.render(pix()));await act(async()=>button('+ Nova Cobrança').click());await fill(0,'SIM nova cobrança');await fill(1,'50,00');await act(async()=>button('Cobranças (1) · 1 pendente(s) válida(s)').click());await act(async()=>button('Preparar envio desta cobrança').click());expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();expect(button('Enviar esta cobrança')).toBeUndefined();await act(async()=>button('Continuar editando').click());await act(async()=>button('+ Nova Cobrança').click());expect(Array.from(document.querySelectorAll<HTMLInputElement>('input')).map(i=>i.value)).toEqual(['SIM nova cobrança','50,00','60']);await act(async()=>button('Cobranças (1) · 1 pendente(s) válida(s)').click());await act(async()=>button('Preparar envio desta cobrança').click());await act(async()=>button('Descartar alterações').click());expect(button('Enviar esta cobrança')).toBeDefined();expect(document.body.textContent).toContain('SIM_PIX_CODE');
});


it('updates a changed Flow preview without sending and requires a second explicit confirmation',async()=>{
 const latest={...flow,bodyText:'SIM texto atualizado',ctaLabel:'Continuar'};vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce({flows:[flow]} as never).mockResolvedValue({flows:[latest]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({} as never);await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());await act(async()=>button('Confirmar envio do formulário').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Os dados do formulário mudaram');expect(document.querySelector('[aria-label="Revisão do formulário"]')!.textContent).toContain('SIM texto atualizado');await act(async()=>button('Confirmar envio do formulário').click());expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0]?.[2].body).toBe('SIM texto atualizado');
});
it('disables a Flow whose publication was withdrawn after opening the preview',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce({flows:[flow]} as never).mockResolvedValue({flows:[{...flow,status:'DRAFT'}]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());await act(async()=>button('Confirmar envio do formulário').click());expect(send).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Revisão do formulário"]')!.textContent).toContain('Status no cadastro: DRAFT');expect(button('Confirmar envio do formulário').disabled).toBe(true);
});
it('removes a Flow preview that is absent from the latest query without queueing',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce({flows:[flow]} as never).mockResolvedValue({flows:[]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());await act(async()=>button('Confirmar envio do formulário').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('não foi encontrado na consulta atual');expect(document.querySelector('[aria-label="Revisão do formulário"]')).toBeNull();
});
it('rechecks Flow channel availability after its current definition query',async()=>{
 const pending=deferred<never>();vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce({flows:[flow]} as never).mockReturnValueOnce(pending.promise);const send=vi.spyOn(apiClient,'sendOutboundMessage');const view=(reason?:string)=><FlowDrawer isOpen onClose={close} workspaceId="SIM-a" token="SIM-token" thread={thread} sendBlockedReason={reason}/>;await act(async()=>root.render(view()));await act(async()=>button('Revisar formulário').click());await act(async()=>button('Confirmar envio do formulário').click());await act(async()=>root.render(view('SIM canal perdeu conexão')));await act(async()=>pending.resolve({flows:[flow]} as never));expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain('SIM canal perdeu conexão');expect(button('Confirmar envio do formulário').disabled).toBe(true);
});
it('ignores a fresh Flow response from a previous conversation and prevents close while checking',async()=>{
 const pending=deferred<never>();vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce({flows:[flow]} as never).mockReturnValueOnce(pending.promise).mockResolvedValue({flows:[]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());await act(async()=>button('Confirmar envio do formulário').click());await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]')!.click());expect(close).not.toHaveBeenCalled();await act(async()=>root.render(flows({...thread,id:'SIM-other-thread'})));await act(async()=>pending.resolve({flows:[flow]} as never));expect(send).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Revisão do formulário"]')).toBeNull();expect(document.body.textContent).not.toContain('SIM Formulário');
});

const linkedCheckout={id:'SIM-checkout',productTitle:'SIM resumo',retailerId:'SIM-SKU',quantity:1,unitPriceCents:12345,totalCents:12345,status:'consumed' as const,validUntil:'2099-01-01T00:00:00Z',createdAt:'2026-10-17T12:00:00Z',summarySent:true,confirmedAt:'2026-10-17T12:01:00Z',chargeId:'SIM-charge',stockPolicy:'review_required' as const};
async function openCheckoutSummaries(){await act(async()=>{const details=document.querySelector('details')!;details.open=true;details.dispatchEvent(new Event('toggle'));});}
it('opens a linked charge through a fresh query without creating or confirming payment',async()=>{
 vi.spyOn(apiClient,'getAiCheckoutRequests').mockResolvedValue({items:[linkedCheckout],nextCursor:null});vi.mocked(apiClient.getPixChargesByThread).mockResolvedValueOnce({charges:[],total:0}).mockResolvedValue({charges:[{...charge,status:'PAID',verificationMethod:'BANK_WEBHOOK',verifiedAt:'2026-10-18T12:00:00Z'}],total:1} as never);const create=vi.spyOn(apiClient,'createPixCharge'),confirm=vi.spyOn(apiClient,'confirmPixPayment'),send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(pix()));await openCheckoutSummaries();await act(async()=>button('Ver cobrança vinculada').click());expect(document.body.textContent).toContain('Cobrança consultada');expect(document.body.textContent).toContain('Situação na última consulta: Pago');expect(document.body.textContent).toContain('SIM_PIX_CODE');expect(button('Enviar esta cobrança').disabled).toBe(true);expect(create).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});
it('keeps a failed or missing linked-charge lookup in the summary context instead of creating a replacement',async()=>{
 vi.spyOn(apiClient,'getAiCheckoutRequests').mockResolvedValue({items:[linkedCheckout],nextCursor:null});vi.mocked(apiClient.getPixChargesByThread).mockResolvedValueOnce({charges:[],total:0}).mockRejectedValueOnce(new Error('SIM consulta da cobrança falhou')).mockResolvedValue({charges:[],total:0});const create=vi.spyOn(apiClient,'createPixCharge');await act(async()=>root.render(pix()));await openCheckoutSummaries();await act(async()=>button('Ver cobrança vinculada').click());expect(document.body.textContent).toContain('SIM consulta da cobrança falhou');expect(button('Ver cobrança vinculada')).toBeDefined();await act(async()=>button('Ver cobrança vinculada').click());expect(document.body.textContent).toContain('não foi encontrada nesta conversa');expect(document.body.textContent).not.toContain('Cobrança consultada');expect(create).not.toHaveBeenCalled();
});
it('serializes linked-charge reads and ignores completion in a different conversation',async()=>{
 vi.spyOn(apiClient,'getAiCheckoutRequests').mockResolvedValue({items:[linkedCheckout],nextCursor:null});const pending=deferred<never>();const get=vi.mocked(apiClient.getPixChargesByThread).mockResolvedValueOnce({charges:[],total:0}).mockReturnValueOnce(pending.promise).mockResolvedValue({charges:[],total:0});await act(async()=>root.render(pix()));await openCheckoutSummaries();await act(async()=>{button('Ver cobrança vinculada').click();button('Ver cobrança vinculada').click();});expect(get).toHaveBeenCalledTimes(2);expect(button('Consultando cobrança...').disabled).toBe(true);await act(async()=>root.render(pix({...thread,id:'SIM-other'})));await act(async()=>pending.resolve({charges:[charge],total:1} as never));expect(document.body.textContent).not.toContain('SIM_PIX_CODE');expect(document.body.textContent).not.toContain('Cobrança consultada');
});

it('reviews an unsaved Pix draft before opening a linked charge and preserves it when editing continues',async()=>{
 vi.spyOn(apiClient,'getAiCheckoutRequests').mockResolvedValue({items:[linkedCheckout],nextCursor:null});const get=vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);await act(async()=>root.render(pix()));await openCheckoutSummaries();await act(async()=>button('+ Nova Cobrança').click());await fill(0,'SIM nova cobrança não salva');await fill(1,'42,00');await act(async()=>button('Cobranças (1) · 1 pendente(s) válida(s)').click());await openCheckoutSummaries();await act(async()=>button('Ver cobrança vinculada').click());expect(get).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="Alterações não salvas"]')).not.toBeNull();await act(async()=>button('Continuar editando').click());await act(async()=>button('+ Nova Cobrança').click());expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('SIM nova cobrança não salva');await act(async()=>button('Cobranças (1) · 1 pendente(s) válida(s)').click());await openCheckoutSummaries();await act(async()=>button('Ver cobrança vinculada').click());await act(async()=>button('Descartar alterações').click());expect(get).toHaveBeenCalledTimes(2);expect(document.body.textContent).toContain('Cobrança consultada');
});

it('does not let an older charge-list response overwrite the fresh linked-charge lookup',async()=>{
 vi.spyOn(apiClient,'getAiCheckoutRequests').mockResolvedValue({items:[linkedCheckout],nextCursor:null});const initial=deferred<never>();vi.mocked(apiClient.getPixChargesByThread).mockReturnValueOnce(initial.promise).mockResolvedValue({charges:[charge],total:1} as never);await act(async()=>root.render(pix()));await openCheckoutSummaries();await act(async()=>button('Ver cobrança vinculada').click());expect(document.body.textContent).toContain('Cobrança consultada');await act(async()=>initial.resolve({charges:[],total:0} as never));await act(async()=>button('Ver Lista de Cobranças').click());expect(document.body.textContent).toContain('SIM Cobrança');expect(document.body.textContent).not.toContain('Nenhuma cobrança gerada');expect(button('Atualizar').disabled).toBe(false);
});

it.each([
 {alreadySettled:false,notification:'queued',expected:'Aviso ao cliente colocado na fila'},
 {alreadySettled:false,notification:'not_queued',expected:'Nenhum aviso ao cliente foi colocado na fila'},
 {alreadySettled:true,notification:'unchanged',expected:'O recebimento já estava registrado'},
])('reports manual receipt and notification results independently: $notification',async({alreadySettled,notification,expected})=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);const confirm=vi.spyOn(apiClient,'confirmPixPayment').mockResolvedValue({success:true,alreadySettled,notification,commercialOutcome:'unchanged',charge:{...charge,status:'PAID',verificationMethod:'MANUAL_CASHIER',verifiedAt:'2026-10-17T12:00:00Z',verifiedByUserId:'SIM-owner'}} as never);await act(async()=>root.render(pix()));await act(async()=>button('Confirmar Recebimento (Caixa)').click());expect(document.body.textContent).toContain('o desfecho da oportunidade deve ser revisado separadamente');expect(document.body.textContent).toContain('tentará preparar um aviso');expect(confirm).not.toHaveBeenCalled();await act(async()=>button('Conferi o crédito e confirmo o recebimento').click());expect(confirm).toHaveBeenCalledOnce();expect(document.body.textContent).toContain(expected);expect(document.body.textContent).toContain('A oportunidade não foi alterada');expect(document.body.textContent).not.toContain('Mensagem entregue');
});

it('removes charge preparation at expiry without a parent rerender or provider call',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
 try{
  vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,expiresAt:'2026-10-18T12:01:00Z'}],total:1} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');
  await act(async()=>root.render(pix()));expect(button('Preparar envio desta cobrança')).toBeDefined();
  await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(button('Preparar envio desta cobrança')).toBeUndefined();expect(send).not.toHaveBeenCalled();
  await act(async()=>root.render(<PixDrawer isOpen={false} onClose={close} thread={null}/>));
 }finally{vi.useRealTimers();}
});
it('disables sending a generated charge when its deadline elapses while open',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
 try{
  vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge:{...charge,expiresAt:'2026-10-18T12:01:00Z'}} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');
  await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());expect(button('Enviar esta cobrança').disabled).toBe(false);
  await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(button('Enviar esta cobrança').disabled).toBe(true);expect(document.body.textContent).toContain('não está pendente e válida');expect(send).not.toHaveBeenCalled();
  await act(async()=>root.render(<PixDrawer isOpen={false} onClose={close} thread={null}/>));
 }finally{vi.useRealTimers();}
});

it.each([
 {verificationMethod:'UNVERIFIED',verifiedAt:'2026-10-18T12:00:00Z'},
 {verificationMethod:'UNKNOWN',verifiedAt:'2026-10-18T12:00:00Z'},
 {verificationMethod:'MANUAL_CASHIER',verifiedAt:'2026-10-18T12:00:00Z'},
 {verificationMethod:'BANK_WEBHOOK',verifiedAt:'invalid'},
])('does not claim verified payment from incomplete or unknown evidence %j',async evidence=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,status:'PAID',...evidence}],total:1} as never);await act(async()=>root.render(pix()));expect(document.body.textContent).toContain('Pagamento informado — revisar confirmação');expect(document.body.textContent).not.toContain('Confirmado pelo Caixa');expect(document.body.textContent).not.toContain('Confirmado via Webhook Bancário');
});
it.each([
 {verificationMethod:'BANK_WEBHOOK',verifiedAt:'2026-10-18T12:00:00Z',label:'Confirmado via Webhook Bancário'},
 {verificationMethod:'MANUAL_CASHIER',verifiedAt:'2026-10-18T12:00:00Z',verifiedByUserId:'SIM-owner',label:'Confirmado pelo Caixa'},
])('shows the recorded verification source for valid receipt evidence %j',async evidence=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,status:'PAID',...evidence}],total:1} as never);await act(async()=>root.render(pix()));expect(document.body.textContent).toContain(evidence.label);expect(document.body.textContent).not.toContain('Pagamento informado — revisar confirmação');
});

it.each([
 {status:'CANCELLED',expiresAt:'2099-01-01T00:00:00Z',label:'Cancelada'},
 {status:'UNKNOWN',expiresAt:'2099-01-01T00:00:00Z',label:'Estado não reconhecido'},
 {status:'PENDING',expiresAt:'invalid',label:'Validade para revisar'},
 {status:'PENDING',expiresAt:'2020-01-01T00:00:00Z',label:'Validade vencida neste dispositivo'},
])('presents exceptional charge states without claiming a valid pending charge %j',async state=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,...state}],total:1} as never);await act(async()=>root.render(pix()));expect(document.body.textContent).toContain(state.label);expect(document.body.textContent).not.toContain('1 pendente(s) válida(s)');expect(button('Preparar envio desta cobrança')).toBeUndefined();
});

it.each([{workspaceId:'SIM-other'},{threadId:'SIM-other'},{id:''}])('rejects charge records outside the confirmed conversation %j',async mismatch=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,...mismatch}],total:1} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage'),settle=vi.spyOn(apiClient,'confirmPixPayment');await act(async()=>root.render(pix()));expect(document.body.textContent).toContain('não retornou cobranças válidas desta conversa');expect(document.body.textContent).not.toContain('SIM Cobrança');expect(button('Copiar Pix')).toBeUndefined();expect(send).not.toHaveBeenCalled();expect(settle).not.toHaveBeenCalled();
});
it('rejects an inconsistent fresh charge query before preparing an outbound payment message',async()=>{
 vi.spyOn(apiClient,'createPixCharge').mockResolvedValue({charge} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,threadId:'SIM-other'}],total:1} as never);await act(async()=>button('Enviar esta cobrança').click());expect(document.body.textContent).toContain('não retornou cobranças válidas desta conversa');expect(send).not.toHaveBeenCalled();
});

it.each([{workspaceId:'SIM-other'},{threadId:'SIM-other'},{contactId:'SIM-other'}])('does not publish an inconsistent creation response and preserves its request key %j',async mismatch=>{
 const create=vi.spyOn(apiClient,'createPixCharge').mockResolvedValueOnce({charge:{...charge,...mismatch}} as never).mockResolvedValueOnce({charge} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');
 await act(async()=>root.render(pix()));await act(async()=>button('Gerar Primeira Cobrança').click());await fill(1,'123,45');await act(async()=>button('Criar cobrança Pix').click());
 expect(document.body.textContent).not.toContain('Cobrança criada');expect(document.body.textContent).not.toContain('SIM_PIX_CODE');expect(button('Enviar esta cobrança')).toBeUndefined();expect(Array.from(document.querySelectorAll<HTMLInputElement>('input')).map(input=>input.value)).toContain('123,45');
 await act(async()=>button('Criar cobrança Pix').click());expect(create).toHaveBeenCalledTimes(2);expect(create.mock.calls[0]?.[2].requestKey).toBe(create.mock.calls[1]?.[2].requestKey);expect(document.body.textContent).toContain('Cobrança criada');expect(send).not.toHaveBeenCalled();
});

it.each([{id:'SIM-other',status:'PAID'},{id:'SIM-charge',status:'PENDING'},{id:'SIM-charge',status:'PAID',verificationMethod:'UNVERIFIED'}])('requires consultation after an inconsistent settlement response %j',async patch=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);const confirm=vi.spyOn(apiClient,'confirmPixPayment').mockResolvedValue({success:true,charge:patch} as never);
 await act(async()=>root.render(pix()));await act(async()=>button('Confirmar Recebimento (Caixa)').click());await act(async()=>button('Conferi o crédito e confirmo o recebimento').click());expect(document.body.textContent).not.toContain('Recebimento registrado no caixa');expect(document.body.textContent).toContain('O resultado do registro precisa de conferência');expect(button('Conferi o crédito e confirmo o recebimento')).toBeUndefined();expect(button('Confirmar Recebimento (Caixa)')).toBeUndefined();
 await act(async()=>button('Tentar novamente').click());expect(button('Confirmar Recebimento (Caixa)')).toBeDefined();expect(confirm).toHaveBeenCalledOnce();
});

it.each([
 {status:'PAID',label:'Pagamento informado — revisar confirmação'},
 {status:'UNKNOWN',label:'Estado não reconhecido'},
 {status:'__proto__',label:'Estado não reconhecido'},
 {status:'PENDING',expiresAt:'invalid',label:'Validade para revisar'},
 {status:'PENDING',expiresAt:'2020-01-01T00:00:00Z',label:'Validade vencida neste dispositivo'},
])('keeps linked charge preview consistent with verification and expiry %j',async state=>{
 vi.spyOn(apiClient,'getAiCheckoutRequests').mockResolvedValue({items:[linkedCheckout],nextCursor:null});vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,...state}],total:1} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(pix()));await openCheckoutSummaries();await act(async()=>button('Ver cobrança vinculada').click());expect(document.body.textContent).toContain('Situação na última consulta: '+state.label);expect(button('Enviar esta cobrança').disabled).toBe(true);expect(send).not.toHaveBeenCalled();
});

it('does not inherit stale verification evidence to approve an incomplete settlement reply',async()=>{
 const oldEvidence={verificationMethod:'MANUAL_CASHIER',verifiedAt:'2026-10-17T12:00:00Z',verifiedByUserId:'SIM-old-owner'};
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[{...charge,...oldEvidence}],total:1} as never);vi.spyOn(apiClient,'confirmPixPayment').mockResolvedValue({success:true,charge:{id:charge.id,status:'PAID',amountCents:charge.amountCents,amountFormatted:charge.amountFormatted,paidAt:null}} as never);
 await act(async()=>root.render(pix()));await act(async()=>button('Confirmar Recebimento (Caixa)').click());await act(async()=>button('Conferi o crédito e confirmo o recebimento').click());expect(document.body.textContent).not.toContain('Recebimento registrado no caixa');expect(document.body.textContent).toContain('O resultado do registro precisa de conferência');
});
it.each([NaN,-1,1.5])('does not publish malformed settlement amounts %s',async amountCents=>{
 vi.mocked(apiClient.getPixChargesByThread).mockResolvedValue({charges:[charge],total:1} as never);vi.spyOn(apiClient,'confirmPixPayment').mockResolvedValue({success:true,charge:{id:charge.id,status:'PAID',amountCents,amountFormatted:'SIM value',verificationMethod:'BANK_WEBHOOK',verifiedAt:'2026-10-18T12:00:00Z'}} as never);
 await act(async()=>root.render(pix()));await act(async()=>button('Confirmar Recebimento (Caixa)').click());await act(async()=>button('Conferi o crédito e confirmo o recebimento').click());expect(document.body.textContent).not.toContain('Recebimento registrado no caixa');expect(document.body.textContent).toContain('O resultado do registro precisa de conferência');
});

it.each([
 {bodyText:' ',reason:'O texto da mensagem do formulário não foi preenchido.'},
 {ctaLabel:'',reason:'O texto do botão do formulário não foi preenchido.'},
 {initialScreen:null,reason:'A tela inicial do formulário não foi preenchida.'},
 {metaFlowId:'invalid',reason:'O identificador do formulário na Meta precisa de revisão.'},
])('explains incomplete published Flow configuration before offering review %j',async({reason,...patch})=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValue({flows:[{...flow,...patch}]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(flows()));expect(document.body.textContent).toContain(reason);expect(button('Revisar formulário').disabled).toBe(true);await act(async()=>button('Revisar formulário').click());expect(button('Confirmar envio do formulário')).toBeUndefined();expect(send).not.toHaveBeenCalled();
});

it.each([
 {flows:null},
 {flows:{}},
 {flows:[{...flow,workspaceId:'SIM-other'}]},
 {flows:[flow,{...flow}]},
 {flows:[null]},
])('distinguishes invalid Flow query data from a confirmed empty list %j',async response=>{
 const query=vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce(response as never).mockResolvedValueOnce({flows:[]} as never);await act(async()=>root.render(flows()));expect(document.body.textContent).toContain('A consulta não confirmou');expect(document.body.textContent).not.toContain('Nenhum formulário cadastrado');expect(button('Revisar formulário')).toBeUndefined();await act(async()=>button('Tentar novamente').click());expect(query).toHaveBeenCalledTimes(2);expect(document.body.textContent).toContain('Nenhum formulário cadastrado');
});
it('does not send when the fresh Flow query belongs to a different company',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValueOnce({flows:[flow]} as never).mockResolvedValueOnce({flows:[{...flow,workspaceId:'SIM-other'}]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(flows()));await act(async()=>button('Revisar formulário').click());await act(async()=>button('Confirmar envio do formulário').click());expect(document.body.textContent).toContain('A consulta não confirmou formulários únicos desta empresa');expect(send).not.toHaveBeenCalled();
});
