// @vitest-environment happy-dom
import { act,createElement } from "react";
import { createRoot,type Root } from "react-dom/client";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { CockpitPage } from "../pages/cockpit/CockpitPage";
import { apiClient } from "../services/api-client";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const fixture=vi.hoisted(()=>({compact:true,desktop:false,sendError:null as string|null,status:'active',update:vi.fn(),refresh:vi.fn()}));
const thread={id:'thread-ux',contactId:'contact-ux',contactPhone:'+5500000000001',contactName:'Cliente de teste UX',channelProvider:'waha',channelInstanceId:'channel',journeyStage:'lead',updatedAt:'2026-10-17T10:00:00Z'};
vi.mock('@sos-sales/ui',async original=>({...await original<typeof import('@sos-sales/ui')>(),useBreakpoint:()=>({isMobile:false,isTablet:!fixture.desktop,isTabletCompact:fixture.compact,isTabletWide:!fixture.compact&&!fixture.desktop,isDesktop:fixture.desktop})}));
vi.mock('../hooks/useSession',()=>({useSession:()=>({})}));
vi.mock('../pages/cockpit/hooks/useInbox',()=>({useInbox:()=>({threads:[thread],filteredThreads:[thread],channels:[],queueFilter:'open',searchQuery:'',setQueueFilter:vi.fn(),setSearchQuery:vi.fn(),refreshThreads:fixture.refresh})}));
vi.mock('../pages/cockpit/hooks/useConversation',()=>({useConversation:(id:string|null)=>({selectedThread:id?{...thread,status:fixture.status}:null,messages:[],windowInfo:{isOpen:true,hoursRemaining:0,badgeText:"SIM consulta",badgeVariant:"action"},sendError:fixture.sendError,handleUpdateStatus:fixture.update,refreshMessages:vi.fn()})}));
vi.mock('../pages/cockpit/Conversation/MessageList',()=>({MessageList:()=>null}));
vi.mock('../pages/cockpit/Conversation/Composer',()=>({Composer:()=>null}));
vi.mock('../pages/cockpit/ContextPanel/ContextPanel',()=>({ContextPanel:(props:{proposals:Array<{id:string;title:string}>;proposalError?:string;proposalsLoading?:boolean;proposalBusy?:boolean;proposalReview?:boolean;onRefreshProposals:()=>void;onUpdateProposalStatus:(id:string,status:'sent')=>Promise<void>})=>createElement('div',null,createElement('p',null,'Contexto disponível'),createElement('p',null,props.proposals.map(p=>p.title).join(',')),createElement('p',null,props.proposalError),createElement('button',{onClick:props.onRefreshProposals},'SIM refresh proposals'),createElement('button',{disabled:props.proposalBusy||props.proposalReview||props.proposalsLoading,onClick:()=>void props.onUpdateProposalStatus(props.proposals[0]!.id,'sent')},'SIM update proposal'))}));
vi.mock('../pages/cockpit/drawers/CockpitDrawers',()=>({CockpitDrawers:()=>null}));
let root:Root,container:HTMLDivElement;
const findButton=(text:string)=>{const button=Array.from(document.querySelectorAll<HTMLElement>('button,[role=button]')).find(node=>node.textContent?.includes(text));if(!button)throw new Error(`Missing ${text}`);return button;};
async function select(){await act(async()=>findButton('Cliente de teste UX').click());}
beforeEach(async()=>{
 fixture.compact=true;fixture.desktop=false;fixture.sendError=null;fixture.status='active';fixture.update.mockReset();fixture.refresh.mockReset();localStorage.clear();
 vi.spyOn(apiClient,'getStageLabels').mockResolvedValue({labels:{},version:0});vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[]} as never);vi.spyOn(apiClient,'getThreadProposals').mockResolvedValue({items:[]});
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
async function render(){await act(async()=>root.render(<CockpitPage session={{activeWorkspace:{id:'workspace'},token:'synthetic'} as never}/>));}
describe('Cockpit responsive navigation and feedback',()=>{
 it('gives compact tablets one useful panel and a working back action',async()=>{
  await render();expect(container.querySelector('aside[aria-label="Fila de Conversas Inbox"]')).not.toBeNull();
  await select();expect(container.querySelector('aside[aria-label="Fila de Conversas Inbox"]')).toBeNull();
  const back=container.querySelector<HTMLButtonElement>('button[aria-label="Voltar para a fila"]')!;expect(back).not.toBeNull();
  expect(container.textContent).toContain('Cliente de teste UX');await act(async()=>back.click());expect(container.querySelector('aside[aria-label="Fila de Conversas Inbox"]')).not.toBeNull();
 });
 it('reflects the actual context drawer state on a wide tablet',async()=>{
  fixture.compact=false;await render();await select();const toggle=findButton('Contexto do lead');expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async()=>toggle.click());expect(toggle.getAttribute('aria-expanded')).toBe('true');expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Contexto disponível');
  await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Fechar painel"]')!.click());expect(toggle.getAttribute('aria-expanded')).toBe('false');
 });
 it('makes a send failure visible in the selected conversation',async()=>{
  fixture.sendError='Não foi possível enviar. O rascunho foi preservado.';await render();await select();expect(container.querySelector('[role="alert"]')?.textContent).toContain('O rascunho foi preservado');
 });
 it('does not present an AI return as human takeover and blocks return when AI is disabled',async()=>{
  fixture.status='waiting_human';vi.spyOn(apiClient,'getAiAutomationAvailability').mockResolvedValue({success:true,config:{enabled:false},activeEnabled:false} as never);await render();await select();
  expect(container.textContent).not.toContain('Assumir Conversa');await act(async()=>findButton('Devolver à IA').click());expect(fixture.update).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')?.textContent).toContain('IA está desativada');
 });
 it('returns to automation only after the explicit action and current configuration check',async()=>{
  fixture.status='waiting_human';const config=vi.spyOn(apiClient,'getAiAutomationAvailability').mockResolvedValue({success:true,config:{enabled:true},activeEnabled:true} as never);await render();await select();expect(fixture.update).not.toHaveBeenCalled();
  await act(async()=>findButton('Devolver à IA').click());expect(config).toHaveBeenCalledWith('workspace',{token:'synthetic'});expect(fixture.update).toHaveBeenCalledWith('active');
 });
});

it('discards a proposal response after switching company while the conversation remains selected',async()=>{
 fixture.compact=false;let resolveOld!:(value:{items:never[]})=>void;const old={promise:new Promise<{items:never[]}>(resolve=>{resolveOld=resolve;}),resolve:(value:{items:never[]})=>resolveOld(value)};vi.mocked(apiClient.getThreadProposals).mockReturnValueOnce(old.promise).mockResolvedValue({items:[{id:'SIM-new',title:'SIM new company proposal'}]} as never);await render();await select();await act(async()=>findButton('Contexto do lead').click());await act(async()=>root.render(<CockpitPage session={{activeWorkspace:{id:'SIM-next'},token:'synthetic'} as never}/>));await act(async()=>old.resolve({items:[{id:'SIM-old',title:'SIM old company proposal'}] as never[]}));expect(document.body.textContent).not.toContain('SIM old company proposal');expect(document.body.textContent).toContain('SIM new company proposal');
});
it('locks proposal status changes after a saved mutation cannot refresh and unlocks only after a successful read',async()=>{
 fixture.compact=false;vi.mocked(apiClient.getThreadProposals).mockResolvedValueOnce({items:[{id:'SIM-p',title:'SIM proposal',stateVersion:1}]} as never).mockRejectedValueOnce(new Error('SIM read failed')).mockResolvedValue({items:[{id:'SIM-p',title:'SIM refreshed proposal',stateVersion:2}]} as never);const patch=vi.spyOn(apiClient,'patchProposalStatus').mockResolvedValue({} as never);await render();await select();await act(async()=>findButton('Contexto do lead').click());await act(async()=>{findButton('SIM update proposal').click();findButton('SIM update proposal').click();});expect(patch).toHaveBeenCalledOnce();expect(document.body.textContent).toContain('A alteração da proposta foi salva');expect((findButton('SIM update proposal') as HTMLButtonElement).disabled).toBe(true);await act(async()=>findButton('SIM refresh proposals').click());expect(document.body.textContent).toContain('SIM refreshed proposal');expect((findButton('SIM update proposal') as HTMLButtonElement).disabled).toBe(false);
});

it('reviews the exact conversation opportunity before a terminal outcome instead of closing it automatically',async()=>{
 vi.spyOn(apiClient,'getThreadJourney').mockResolvedValue({journey:{id:'SIM-linked',contactId:thread.contactId,threadId:thread.id,title:'SIM negotiation to review',stage:'lead',estimatedValueCents:12345,updatedAt:'2026-10-17T12:00:00Z',createdAt:'2026-10-17T12:00:00Z'}} as never);const outcome=vi.spyOn(apiClient,'recordJourneyOutcome');const change=vi.spyOn(apiClient,'updateJourneyStage');await render();await select();await act(async()=>{const select=document.querySelector<HTMLSelectElement>('select[aria-label="Etapa do lead no funil"]')!;select.value='won';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(outcome).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();expect(document.body.textContent).toContain('SIM negotiation to review');expect(document.body.textContent).toContain('Você solicitou Ganho');expect(document.querySelector<HTMLInputElement>('input[placeholder="Ex.: 1.500,00"]')!.value).toBe('123,45');
});
it('opens an explicit conversation-bound opportunity form rather than creating one when the header stage changes',async()=>{
 vi.spyOn(apiClient,'getThreadJourney').mockResolvedValue({journey:null} as never);vi.mocked(apiClient.getContacts).mockResolvedValue({contacts:[{id:thread.contactId,name:'SIM known contact',phoneE164:thread.contactPhone}]} as never);const create=vi.spyOn(apiClient,'createJourney');await render();await select();await act(async()=>{const select=document.querySelector<HTMLSelectElement>('select[aria-label="Etapa do lead no funil"]')!;select.value='qualified';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(create).not.toHaveBeenCalled();expect(document.body.textContent).toContain('ficará vinculada à conversa');const lead=document.querySelector<HTMLSelectElement>('[role="dialog"] select')!;expect(lead.value).toBe(thread.contactId);expect(lead.disabled).toBe(true);
});

it('serializes the stage lookup and discards a review loaded for a previous company',async()=>{let resolve!:(value:never)=>void;const pending=new Promise<never>(r=>{resolve=r;});const query=vi.spyOn(apiClient,'getThreadJourney').mockReturnValue(pending);await render();await select();await act(async()=>{const select=document.querySelector<HTMLSelectElement>('select[aria-label="Etapa do lead no funil"]')!;select.value='qualified';select.dispatchEvent(new Event('change',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));});expect(query).toHaveBeenCalledOnce();await act(async()=>root.render(<CockpitPage session={{activeWorkspace:{id:'SIM-next'},token:'synthetic'} as never}/>));await act(async()=>resolve({journey:{id:'SIM-old',title:'SIM stale stage review',threadId:thread.id,contactId:thread.contactId,stage:'lead'}} as never));expect(document.body.textContent).not.toContain('SIM stale stage review');expect(document.body.textContent).not.toContain('Você solicitou');});

it('keeps context in a drawer on a narrow desktop and moves it inline only when there is room',async()=>{const original=window.innerWidth;Object.defineProperty(window,'innerWidth',{configurable:true,value:1280});fixture.desktop=true;fixture.compact=false;try{await render();await select();const toggle=findButton('Contexto do lead');expect(toggle.getAttribute('aria-expanded')).toBe('false');await act(async()=>toggle.click());expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Contexto disponível');await act(async()=>{Object.defineProperty(window,'innerWidth',{configurable:true,value:1600});window.dispatchEvent(new Event('resize'));});expect(document.querySelector('[role="dialog"]')).toBeNull();expect(container.textContent).toContain('Contexto disponível');}finally{Object.defineProperty(window,'innerWidth',{configurable:true,value:original});}});

it.each([{draft:true,active:false},{draft:false,active:true}])('uses the active AI setting instead of the editable draft: $draft / $active',async({draft,active})=>{
 fixture.status='waiting_human';vi.spyOn(apiClient,'getAiAutomationAvailability').mockResolvedValue({success:true,config:{enabled:draft},activeEnabled:active} as never);await render();await select();await act(async()=>findButton('Devolver à IA').click());expect(fixture.update).toHaveBeenCalledTimes(active?1:0);if(!active)expect(document.body.textContent).toContain('desativada na configuração em uso');
});
it.each([{success:true,config:{enabled:true}},{success:false,config:{enabled:true},activeEnabled:true},{success:true,config:{enabled:true},activeEnabled:'true'}])('does not infer active automation from an incomplete or invalid configuration response: %j',async result=>{
 fixture.status='waiting_human';vi.spyOn(apiClient,'getAiAutomationAvailability').mockResolvedValue(result as never);await render();await select();await act(async()=>findButton('Devolver à IA').click());expect(fixture.update).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Não foi possível confirmar a configuração em uso');
});
it('serializes repeated AI-return checks before calling the status operation',async()=>{
 fixture.status='waiting_human';let resolve!:(value:never)=>void;const config=vi.spyOn(apiClient,'getAiAutomationAvailability').mockReturnValue(new Promise<never>(r=>resolve=r));await render();await select();const resume=findButton('Devolver à IA');await act(async()=>{resume.click();resume.click();});expect(config).toHaveBeenCalledOnce();expect(fixture.update).not.toHaveBeenCalled();await act(async()=>resolve({success:true,config:{enabled:false},activeEnabled:true} as never));expect(fixture.update).toHaveBeenCalledOnce();expect(fixture.refresh).not.toHaveBeenCalled();
});
