// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelsSection } from '../pages/settings/ChannelsSection';
import type { ChannelSummary } from '../services/api-client';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const channel={id:'SIM-channel',provider:'waha',displayName:'SIM canal',status:'connected',isActive:true,phoneNumberE164:'+550000000001'} as ChannelSummary;
const buttons=()=>Array.from(el.querySelectorAll('button'));
const button=(text:string)=>buttons().find(button=>button.textContent?.includes(text))!;
const render=(overrides:Partial<ChannelSummary>={},sync=vi.fn())=>act(async()=>root.render(<ChannelsSection channels={[{...channel,...overrides}]} isLoading={false} onOpenWizard={vi.fn()} onOpenQr={vi.fn()} onRevoke={vi.fn()} revokingId={null} onSync={sync}/>));
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('requires an active connected channel and explains the bounded history import',async()=>{
 const sync=vi.fn();await render({isActive:false},sync);expect(button('Importar histórico recente').disabled).toBe(true);await act(async()=>button('Importar histórico recente').click());expect(sync).not.toHaveBeenCalled();
 await render({status:'unconfigured'},sync);expect(button('Importar histórico recente').disabled).toBe(true);
 await render({},sync);expect(button('Importar histórico recente').title).toContain('Não cria oportunidades');await act(async()=>button('Importar histórico recente').click());expect(sync).toHaveBeenCalledWith('SIM-channel','SIM canal');
});
it('does not claim link copied before clipboard confirmation and exposes a useful fallback',async()=>{
 let reject!:(reason:Error)=>void;const write=vi.fn().mockReturnValue(new Promise((_,r)=>reject=r));vi.stubGlobal('navigator',{clipboard:{writeText:write}});
 await render();await act(async()=>buttons().find(b=>b.title==='Copiar link wa.me')!.click());expect(el.textContent).not.toContain('Copiado!');
 await act(async()=>reject(new Error('denied')));expect(el.querySelector('[role="alert"]')?.textContent).toContain('https://wa.me/550000000001');expect(el.textContent).not.toContain('Copiado!');
 write.mockResolvedValue(undefined);await act(async()=>buttons().find(b=>b.title==='Copiar link wa.me')!.click());expect(el.textContent).toContain('Copiado!');
});

it('shows stored Meta subscription outcomes separately from delivery and billing',async()=>{
 for(const [state,message] of [['failed','recusada pela Meta'],['uncertain','resultado não confirmado'],['unknown','sem verificação registrada'],['confirmed','não comprova recebimento ou envio']] as const){
  await render({provider:'meta_waba',isActive:false,status:'configuring',metaSubscriptionStatus:state,metaSubscriptionCheckedAt:'2026-10-17T12:00:00Z'});expect(el.textContent).toContain(message);expect(el.textContent).toContain('Registro da consulta');expect(el.textContent).toContain('Faturamento não declarado');
 }
 await render({provider:'meta_waba',metaSubscriptionStatus:undefined,metaSubscriptionCheckedAt:null});expect(el.textContent).toContain('sem verificação registrada');expect(el.textContent).not.toContain('Registro da consulta');
});

it('does not present an inactive channel as connected or a foreign lifecycle value as proof',async()=>{
 await render({status:'connected',isActive:false});expect(el.textContent).toContain('Uso local pausado');expect(Array.from(el.querySelectorAll('span')).some(x=>x.textContent==='Conectado')).toBe(false);expect(button('Importar histórico recente').disabled).toBe(true);
 await render({status:'connected',isActive:true});expect(Array.from(el.querySelectorAll('span')).some(x=>x.textContent==='Conectado')).toBe(true);
 await render({status:'active' as ChannelSummary['status'],isActive:true});expect(el.textContent).toContain('Estado não confirmado');expect(Array.from(el.querySelectorAll('span')).some(x=>x.textContent==='Conectado')).toBe(false);
});

it.each(['waha','meta_waba','evolution'])('blocks operations on retained %s records after a query failure, keeping refresh available',async(provider)=>{
 const invoke=vi.fn(),reload=vi.fn();await act(async()=>root.render(<ChannelsSection channels={[{...channel,provider,isActive:provider==='waha',status:provider==='waha'?'connected':'configuring',revision:'SIM-revision'} as ChannelSummary]} canManage isLoading={false} hasLoadError lastCheckedAt="2026-10-18T12:00:00Z" onOpenWizard={invoke} onOpenQr={invoke} onRevoke={invoke} revokingId={null} onSync={invoke} onApproveConnection={invoke} onCheckMetaSubscription={invoke} onDelete={invoke} onToggleBilling={invoke} onReload={reload}/>));
 expect(el.textContent).toContain('cartões podem estar desatualizados');for(const label of ['QR Code','Importar histórico recente','Revisar conexão Meta','Revisar conexão Evolution','Consultar assinatura','Declarar faturamento Meta','Arquivar canal']){const action=buttons().find(b=>b.textContent?.trim()===label);if(action){expect(action.disabled,label).toBe(true);await act(async()=>action.click());}}
 expect(invoke).not.toHaveBeenCalled();expect(button('Atualizar canais').disabled).toBe(false);await act(async()=>button('Atualizar canais').click());expect(reload).toHaveBeenCalledOnce();
});

it('names repeated channel actions by their own account and keeps archive unavailable without its handler',async()=>{
 const qr=vi.fn();await act(async()=>root.render(<ChannelsSection channels={[{...channel,revision:'SIM-r'},{...channel,id:'SIM-second',displayName:'SIM segundo',revision:'SIM-r'}]} canManage isLoading={false} onOpenWizard={vi.fn()} onOpenQr={qr} onRevoke={vi.fn()} revokingId={null}/>));
 expect(el.querySelector('[role="group"][aria-label="Canal: SIM canal"]')).not.toBeNull();expect(el.querySelector('[role="group"][aria-label="Canal: SIM segundo"]')).not.toBeNull();
 const target=el.querySelector('button[aria-label="QR Code de SIM segundo"]') as HTMLButtonElement;await act(async()=>target.click());expect(qr).toHaveBeenCalledWith('SIM-second','SIM segundo');
 for(const name of ['SIM canal','SIM segundo']){expect(el.querySelector(`button[aria-label="Arquivar canal ${name}"]`)?.hasAttribute('disabled')).toBe(true);expect(el.querySelector(`button[aria-label="Copiar link wa.me de ${name}"]`)).not.toBeNull();}
});

it.each(['SIM-invalid','+55 11 99999-9999 ramal 2','+0123456789','123','+1234567890123456'])('does not offer a fabricated contact link for malformed number %s',async phoneNumberE164=>{
 const write=vi.fn();vi.stubGlobal('navigator',{clipboard:{writeText:write}});await render({phoneNumberE164});
 expect(buttons().some(b=>b.title==='Copiar link wa.me')).toBe(false);expect(el.textContent).toContain('Link de contato indisponível');expect(write).not.toHaveBeenCalled();
});
it('copies a formatted international number and announces confirmation for its own account',async()=>{
 const write=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText:write}});await render({phoneNumberE164:'+55 (11) 99999-9999'});
 await act(async()=>buttons().find(b=>b.title==='Copiar link wa.me')!.click());expect(write).toHaveBeenCalledWith('https://wa.me/5511999999999');expect(el.querySelector('[role="status"]')?.textContent).toContain('Link de contato copiado para SIM canal');
});
