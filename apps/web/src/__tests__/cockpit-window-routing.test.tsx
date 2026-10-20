// @vitest-environment happy-dom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {it,expect,vi,beforeEach,afterEach} from "vitest";
import {CockpitDrawers,type DrawerType} from "../pages/cockpit/drawers/CockpitDrawers";
import {apiClient,type CommercialThreadSummary} from "../services/api-client";
import type {UseSessionReturn} from "../hooks/useSession";
vi.mock("../pages/cockpit/drawers/ProposalDrawer",()=>({ProposalDrawer:()=>null}));
vi.mock("../pages/cockpit/drawers/PixDrawer",()=>({PixDrawer:()=>null}));
vi.mock("../pages/cockpit/drawers/RadarDrawer",()=>({RadarDrawer:()=>null}));
vi.mock("../pages/cockpit/drawers/DossierDrawer",()=>({DossierDrawer:()=>null}));
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;const close=vi.fn(),share=vi.fn();
const session={token:"SIM-token",activeWorkspace:{id:"SIM-workspace"}} as UseSessionReturn;
const thread={id:"SIM-thread",channelProvider:"meta_waba",channelInstanceId:"SIM-channel",contactPhone:"+5500000000000"} as CommercialThreadSummary;
const block="SIM janela fechada: revise um modelo aprovado";
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
const render=(activeDrawer:DrawerType,provider="meta_waba")=><CockpitDrawers activeDrawer={activeDrawer} onClose={close} selectedThread={{...thread,channelProvider:provider}} session={session} textSendBlockedReason={block} onSendProduct={share}/>;
beforeEach(()=>{close.mockReset();share.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('permits reviewing catalogue offers but blocks freeform confirmation when the service window is closed',async()=>{
 vi.spyOn(apiClient,'getProducts').mockResolvedValue({products:[{id:'SIM-product',title:'SIM Produto',priceCents:4200,currency:'BRL',status:'ACTIVE'}]} as never);await act(async()=>root.render(render('catalog')));await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Revisar SIM Produto"]')!.click());expect(document.querySelector('[aria-label="Revisão da oferta"]')).not.toBeNull();expect(button('Confirmar envio da oferta').disabled).toBe(true);await act(async()=>button('Confirmar envio da oferta').click());expect(share).not.toHaveBeenCalled();expect(document.body.textContent).toContain(block);
});
it('permits reviewing a published Flow but blocks its interactive send outside the service window',async()=>{
 vi.spyOn(apiClient,'getFlows').mockResolvedValue({flows:[{id:'SIM-flow',workspaceId:'SIM-workspace',name:'SIM Formulário',status:'PUBLISHED',metaFlowId:'123',bodyText:'SIM mensagem',ctaLabel:'Abrir',initialScreen:'FIRST'}]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage');await act(async()=>root.render(render('flow')));await act(async()=>button('Revisar formulário').click());expect(button('Confirmar envio do formulário').disabled).toBe(true);await act(async()=>button('Confirmar envio do formulário').click());expect(send).not.toHaveBeenCalled();expect(document.body.textContent).toContain(block);
});
it.each([{provider:'waha',blocked:true},{provider:'meta_waba',blocked:false}])('applies the freeform block to converted local templates while preserving approved Meta template sending: $provider',async({provider,blocked})=>{
 vi.spyOn(apiClient,'getTemplates').mockResolvedValue({templates:[{id:'SIM-template',name:'SIM modelo',bodyText:'SIM mensagem',category:'UTILITY',language:'pt_BR',status:'APPROVED',metaTemplateId:'123',metaVerifiedChannelId:'SIM-channel',metaVerifiedAt:new Date().toISOString()}]} as never);const send=vi.spyOn(apiClient,'sendOutboundMessage').mockResolvedValue({} as never);await act(async()=>root.render(render('template',provider)));await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Modelos disponíveis"] button')!.click());expect(button('Enviar modelo').disabled).toBe(blocked);await act(async()=>button('Enviar modelo').click());expect(send).toHaveBeenCalledTimes(blocked?0:1);if(!blocked)expect(send.mock.calls[0]?.[2].contentType).toBe('template');
});
