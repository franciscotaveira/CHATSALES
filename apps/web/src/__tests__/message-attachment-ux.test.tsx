// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {MessageBubble} from '../pages/cockpit/Conversation/MessageBubble';
import {apiClient,type ThreadMessageSummary} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const base={id:'SIM-message',threadId:'SIM-thread',workspaceId:'b1111111-1111-4111-8111-111111111111',channelInstanceId:'d2222222-2222-4222-8222-222222222222',direction:'inbound',contentType:'image',body:'SIM caption preserved',mediaUrl:'https://example.invalid/SIM.png',metadata:{},createdAt:'2026-10-18T12:00:00Z',deliveryStatus:'unknown'} as ThreadMessageSummary;
const render=(changes:Partial<ThreadMessageSummary>={})=>act(async()=>root.render(<MessageBubble message={{...base,...changes}}/>));
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);localStorage.clear();sessionStorage.clear();vi.spyOn(apiClient,'getBaseUrl').mockReturnValue('http://127.0.0.1:24400');});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();localStorage.clear();sessionStorage.clear();});
it.each(['image','audio','video'] as const)('explains a failed %s and retries only the attachment while preserving the caption',async type=>{
 await render({contentType:type,mediaUrl:`https://example.invalid/SIM.${type==='image'?'png':type==='audio'?'ogg':'mp4'}`});const selector=type==='image'?'img':type;await act(async()=>el.querySelector(selector)!.dispatchEvent(new Event('error')));expect(el.textContent).toContain('Não foi possível carregar este anexo');expect(el.textContent).toContain('SIM caption preserved');expect(el.querySelector(selector)).toBeNull();const retry=Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Tentar carregar anexo novamente')!;await act(async()=>retry.click());expect(el.querySelector(selector)).not.toBeNull();expect(el.textContent).not.toContain('Não foi possível carregar este anexo');expect(document.activeElement).toBe(type==='image'?el.querySelector('a[aria-label="Abrir imagem em outra aba"]'):el.querySelector(selector));await act(async()=>el.querySelector(selector)!.dispatchEvent(new Event('error')));expect(document.activeElement).toBe(el.querySelector('p[role="status"]'));
});
it('does not retain a failed image state when its URL or message identity changes',async()=>{
 await render();await act(async()=>el.querySelector('img')!.dispatchEvent(new Event('error')));await render({mediaUrl:'https://example.invalid/SIM-other.png'});expect(el.querySelector('img')?.getAttribute('src')).toContain('SIM-other.png');await act(async()=>el.querySelector('img')!.dispatchEvent(new Event('error')));await render({id:'SIM-another-message',mediaUrl:'https://example.invalid/SIM-other.png'});expect(el.querySelector('img')).not.toBeNull();
});
it.each([JSON.stringify({url:123,mimetype:{}}),'null',{url:{unexpected:true}},{url:null,mimetype:123}])('keeps malformed media metadata from breaking the conversation: %j',async payload=>{
 await render({contentType:'document',mediaUrl:null,metadata:{media_payload:payload}});expect(el.textContent).toContain('Anexo registrado, mas sem arquivo acessível');expect(el.textContent).toContain('SIM caption preserved');expect(el.querySelector('a')).toBeNull();
});
it.each(['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///SIM-private.pdf'])('does not render an executable or local attachment link: %s',async mediaUrl=>{
 await render({contentType:'document',mediaUrl});expect(el.querySelector('a')).toBeNull();expect(el.textContent).toContain('sem arquivo acessível');
});
it('uses an accessible image link and distinguishes outbound images',async()=>{await render({direction:'outbound'});expect(el.querySelector('a')?.getAttribute('aria-label')).toBe('Abrir imagem em outra aba');expect(el.querySelector('img')?.getAttribute('alt')).toBe('Imagem enviada na conversa');expect(el.querySelector('a')?.getAttribute('rel')).toContain('noopener');});
it('does not send the session token to an external media host',async()=>{localStorage.setItem('sos_sales_auth_token','SIM-private-token');await render({mediaUrl:'https://example.invalid/v1/workspaces/b1111111-1111-4111-8111-111111111111/media/proxy?mediaId=SIM'});expect(el.querySelector('img')?.getAttribute('src')).not.toContain('SIM-private-token');});
it('uses the current message workspace and channel when rebuilding an authenticated provider proxy',async()=>{
 localStorage.setItem('sos_sales_auth_token','SIM-token');await render({mediaUrl:null,metadata:{mediaId:'SIM-id',workspaceId:'b2222222-2222-4222-8222-222222222222'}});const source=el.querySelector('img')!.getAttribute('src')!;expect(source).toContain('/'+base.workspaceId+'/media/proxy');expect(source).toContain('token=SIM-token');await render({workspaceId:'b3333333-3333-4333-8333-333333333333',channelInstanceId:'d3333333-3333-4333-8333-333333333333',mediaUrl:null,metadata:{mediaId:'SIM-id'}});expect(el.querySelector('img')?.getAttribute('src')).toContain('/b3333333-3333-4333-8333-333333333333/media/proxy');
});

it('describes document opening honestly and exposes the complete filename without claiming download success',async()=>{
 const filename='SIM_documento_com_nome_longo_para_conferencia_acessivel.pdf';
 await render({contentType:'document',mediaUrl:'https://example.invalid/SIM.pdf',metadata:{filename}});
 const link=el.querySelector('a')!;
 expect(link.getAttribute('aria-label')).toBe(`Abrir ${filename} em outra aba`);
 expect(link.title).toBe(filename);expect(link.target).toBe('_blank');
 expect(link.rel).toContain('noopener');expect(link.hasAttribute('download')).toBe(false);
 expect(el.textContent).toContain('Abrir em outra aba');expect(el.textContent).not.toContain('Clique para baixar');
 expect(el.textContent).toContain('SIM caption preserved');
});

it.each([['queued','Na fila'],['sent','Enviada'],['delivered','Entregue'],['read','Lida'],['failed','Falha no envio']])('exposes the actual outbound %s state to assistive technology',async(deliveryStatus,label)=>{
 await render({direction:'outbound',contentType:'text',mediaUrl:null,deliveryStatus:deliveryStatus as ThreadMessageSummary['deliveryStatus']});
 expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(`Status de envio: ${label}`);
});
it.each(['unknown','unexpected','constructor','toString'])('does not present unconfirmed state %s as queued',async status=>{
 await render({direction:'outbound',contentType:'text',mediaUrl:null,deliveryStatus:status as ThreadMessageSummary['deliveryStatus']});
 expect(el.textContent).toContain('Status não confirmado');expect(el.querySelector('[title="Na fila"]')).toBeNull();
});
it('does not attribute outbound delivery states to an inbound message',async()=>{await render({contentType:'text',mediaUrl:null,deliveryStatus:'read'});expect(el.querySelector('[role="img"]')).toBeNull();});
it('does not treat inbound metadata as a system payment confirmation',async()=>{
 await render({contentType:'text',mediaUrl:null,metadata:{source:'pix_confirmation',chargeId:'SIM-charge'}});
 expect(el.textContent).not.toContain('Mensagem de confirmação Pix');expect(el.textContent).not.toContain('Recibo Pix Confirmado');expect(el.textContent).not.toContain('Cobrança Pix Anexada');
});
it('labels an outbound confirmation as a message rather than payment evidence',async()=>{
 await render({direction:'outbound',contentType:'text',mediaUrl:null,metadata:{source:'pix_confirmation'}});
 expect(el.textContent).toContain('Mensagem de confirmação Pix');expect(el.textContent).not.toContain('Recibo Pix Confirmado');
});
it('ignores malformed agent and charge identifiers without breaking the message',async()=>{
 await render({direction:'outbound',contentType:'text',mediaUrl:null,metadata:{source:'ai_receptionist',agentName:{bad:true},chargeId:{bad:true}}});
 expect(el.textContent).toContain('IA Atendente (IA)');expect(el.textContent).toContain('SIM caption preserved');expect(el.textContent).not.toContain('Cobrança Pix Anexada');
});
it.each([false,'false','true',1,{value:true},null])('does not infer a handoff request from ambiguous metadata: %j',async needsHandoff=>{
 await render({direction:'outbound',contentType:'text',mediaUrl:null,metadata:{source:'ai_receptionist',needsHandoff}});
 expect(el.textContent).not.toContain('Encaminhamento solicitado');
});
it('identifies a recorded handoff request without claiming the current conversation state',async()=>{
 await render({direction:'outbound',contentType:'text',mediaUrl:null,metadata:{source:'ai_receptionist',needsHandoff:true}});
 expect(el.textContent).toContain('Encaminhamento solicitado');
 expect(el.querySelector('[title*="estado atual do atendimento"]')).not.toBeNull();
});

it('preserves full date, year and time for old messages using a machine-readable timestamp',async()=>{
 await render({createdAt:'2024-02-10T13:47:00Z'});const time=el.querySelector('time')!;
 expect(time.dateTime).toBe('2024-02-10T13:47:00.000Z');expect(time.textContent).toContain('2024');
 expect(time.textContent).toMatch(/\d{2}:\d{2}/);
});
it.each(['invalid-date',''])('shows missing date honestly instead of an invalid or fabricated timestamp: %s',async createdAt=>{
 await render({createdAt});expect(el.querySelector('time')).toBeNull();expect(el.textContent).toContain('Data não informada');
});
