// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {it,expect,beforeEach,afterEach,vi} from 'vitest';import {CampaignsList} from '../pages/templates/CampaignsList';import {apiClient} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const base={id:'SIM-campaign',name:'SIM Campaign',status:'queued',channel:{id:'SIM-channel',name:'SIM channel',provider:'waha'},template:{id:'SIM-template',name:'SIM template',category:'UTILITY'},isAbTest:false,audienceType:'ALL_CONTACTS',totalTargeted:2,metrics:{sent:2,delivered:2,read:0,replied:0,clicked:0,deliveryRate:100,openRate:0,replyRate:0,ctr:0},createdAt:'2026-10-17T12:00:00Z'};
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el)});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks()});
async function show(campaigns:unknown[]){vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({campaigns} as never);await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));}
it.each([
 {hasMore:'false',nextCursor:null},
 {hasMore:true,nextCursor:{id:'SIM-next',createdAt:'invalid'}},
 {hasMore:true,nextCursor:{id:'',createdAt:'2026-10-18T12:00:00Z'}},
 {hasMore:true,nextCursor:null},
])('preserves campaign results when a refresh has malformed pagination: %j',async pagination=>{
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base]} as never).mockResolvedValueOnce({campaigns:[],pagination} as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton('Atualizar Métricas');
 expect(el.textContent).toContain('SIM Campaign');expect(el.textContent).toContain('continuação inválida');
});
it('rejects an empty page claiming more campaigns without replacing consulted results',async()=>{
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base]} as never).mockResolvedValueOnce({campaigns:[],pagination:{hasMore:true,nextCursor:{id:'SIM-next',createdAt:'2026-10-18T12:00:00Z'}}} as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton('Atualizar Métricas');expect(el.textContent).toContain('SIM Campaign');expect(el.textContent).toContain('continuação inválida');
});
it('keeps missing sales distinct from confirmed zero and does not present a partial revenue as the total',async()=>{
 await show([base,{...base,id:'SIM-zero',name:'SIM Zero',metrics:{...base.metrics,salesCount:0,salesCents:0}}]);
 const missing=el.querySelector('[aria-label="Vendas de SIM Campaign"]')!;expect(missing.textContent).toContain('Valor não informado');expect(missing.textContent).toContain('Quantidade não informada');expect(missing.textContent).not.toContain('0 pagas');
 const zero=el.querySelector('[aria-label="Vendas de SIM Zero"]')!;expect(zero.textContent).toContain('0 pagas');expect(zero.textContent).toContain('0%');expect(zero.textContent).toMatch(/R\$\s*0,00/);expect(el.textContent).toContain('Dados de vendas incompletos — campanhas sem quantidade: 1; sem valor: 1.');
});
it('formats numeric legacy fields instead of fabricating zero when formatted sales are absent',async()=>{
 await show([{...base,metrics:{...base.metrics,salesCount:1,salesCents:12500}}]);const card=el.querySelector('[aria-label="Vendas de SIM Campaign"]')!;expect(card.textContent).toMatch(/R\$\s*125,00/);expect(card.textContent).toContain('1 pagas');expect(card.textContent).toContain('50%');expect(el.textContent).not.toContain('Dados de vendas incompletos');
});
it('does not treat negative or malformed monetary/count data as confirmed sales',async()=>{
 await show([{...base,metrics:{...base.metrics,salesCount:-1,salesCents:NaN}}]);expect(el.textContent).toContain('Valor não informado');expect(el.textContent).toContain('Quantidade não informada');expect(el.textContent).not.toContain('NaN');expect(el.textContent).not.toContain('-1 pagas');
});

it('loads older pages once, deduplicates records and explains the loaded scope',async()=>{
 const cursor={createdAt:'2026-10-17T12:00:00.123456Z',id:'SIM-cursor'};let resolve!:(v:any)=>void;const next=new Promise<any>(r=>resolve=r);
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base],pagination:{hasMore:true,nextCursor:cursor}} as never).mockReturnValueOnce(next);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));const more=Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais campanhas')!;await act(async()=>{more.click();more.click()});expect(apiClient.getBroadcastCampaigns).toHaveBeenCalledTimes(2);expect(vi.mocked(apiClient.getBroadcastCampaigns).mock.calls[1]).toEqual(['SIM-company',{token:'SIM-token'},cursor]);
 await act(async()=>resolve({campaigns:[base,{...base,id:'SIM-older',name:'SIM Older'}],pagination:{hasMore:false,nextCursor:null}}));expect(el.textContent).toContain('Campanhas carregadas: 2');expect(el.textContent).toContain('filtros aplicados');expect(el.querySelectorAll('[aria-label="Vendas de SIM Campaign"]')).toHaveLength(1);expect(Array.from(el.querySelectorAll('button')).some(b=>b.textContent==='Carregar mais campanhas')).toBe(false);
});
it('keeps loaded campaigns after an older-page failure and offers retry',async()=>{
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base],pagination:{hasMore:true,nextCursor:{createdAt:'2026-10-18T12:00:00Z',id:'SIM-cursor'}}} as never).mockRejectedValueOnce(new Error('SIM loading failed'));
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais campanhas')!.click());expect(el.textContent).toContain('SIM Campaign');expect(el.textContent).toContain('Tentar carregar mais campanhas');
});

it('discards an older page returned after switching company',async()=>{
 let resolve!:(v:any)=>void;vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base],pagination:{hasMore:true,nextCursor:{createdAt:'2026-10-18T12:00:00Z',id:'SIM-cursor'}}} as never).mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce({campaigns:[]} as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais campanhas')!.click());
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-other" token="SIM-other-token" onOpenNewBroadcast={()=>{}}/>));await act(async()=>resolve({campaigns:[{...base,name:'SIM Late'}],pagination:{hasMore:false,nextCursor:null}}));expect(el.textContent).not.toContain('SIM Late');expect(el.textContent).not.toContain('SIM Campaign');
});

it('submits search to the server and retains it when loading older matches',async()=>{
 const cursor={createdAt:'2026-10-18T12:00:00Z',id:'SIM-cursor'};vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base]} as never).mockResolvedValueOnce({campaigns:[{...base,name:'SIM older match'}],pagination:{hasMore:true,nextCursor:cursor}} as never).mockResolvedValueOnce({campaigns:[],pagination:{hasMore:false,nextCursor:null}} as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await act(async()=>{const input=el.querySelector<HTMLInputElement>('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'  SIM older  ');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(apiClient.getBroadcastCampaigns).toHaveBeenCalledOnce();
 await act(async()=>el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(apiClient.getBroadcastCampaigns).toHaveBeenLastCalledWith('SIM-company',{token:'SIM-token'},{search:'SIM older',type:'ALL'});expect(el.textContent).toContain('Busca aplicada: SIM older');expect(el.textContent).toContain('SIM older match');
 await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais campanhas')!.click());expect(apiClient.getBroadcastCampaigns).toHaveBeenLastCalledWith('SIM-company',{token:'SIM-token'},{...cursor,search:'SIM older'});
});

it('distinguishes partial processing failures from preparation alone and completed delivery',async()=>{
 await show([{...base,status:'partial',metrics:{...base.metrics,failed:3}},{...base,id:'SIM-complete',name:'SIM Completed',status:'completed',metrics:{...base.metrics,failed:0}}]);
 const partial=el.querySelector('[aria-label="Situação operacional de SIM Campaign"]')!;expect(el.textContent).toContain('Resultado parcial');expect(el.textContent).not.toContain('Preparação parcial');expect(partial.textContent).toContain('Falhas ou bloqueios registrados: 3');expect(partial.textContent).toContain('ainda pode haver trabalho pendente');
 const completed=el.querySelector('[aria-label="Situação operacional de SIM Completed"]')!;expect(completed.textContent).toContain('Entrega e leitura dependem');expect(completed.textContent).toContain('Falhas ou bloqueios registrados: 0');
});
it('does not fabricate zero failures when an older response lacks the counter or contains invalid data',async()=>{
 await show([base,{...base,id:'SIM-invalid',name:'SIM Invalid',metrics:{...base.metrics,failed:-1}}]);expect(el.querySelector('[aria-label="Situação operacional de SIM Campaign"]')?.textContent).toContain('Não informado');expect(el.querySelector('[aria-label="Situação operacional de SIM Invalid"]')?.textContent).toContain('Não informado');expect(el.textContent).not.toContain('registrados: -1');
});


const campaignRows=(start:number,count:number,label='SIM original')=>Array.from({length:count},(_,i)=>({...base,id:`SIM-${start+i}`,name:`${label} ${start+i}`}));
const rangeCursor={createdAt:'2026-10-17T10:00:00Z',id:'SIM-range-cursor'};
const clickCampaignButton=async(text:string)=>act(async()=>{Array.from(el.querySelectorAll('button')).find(b=>b.textContent===text)!.click();});
it('refreshes the full loaded campaign range atomically instead of shrinking metrics to the first page',async()=>{
 let resolve!:(value:any)=>void;const last=new Promise(r=>resolve=r);
 const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:campaignRows(0,20),pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockResolvedValueOnce({campaigns:campaignRows(20,5)} as never).mockResolvedValueOnce({campaigns:campaignRows(0,20,'SIM refreshed'),pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockReturnValueOnce(last as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton('Carregar mais campanhas');expect(el.textContent).toContain('Campanhas carregadas: 25');await clickCampaignButton('Atualizar Métricas');expect(get).toHaveBeenCalledTimes(4);expect(el.textContent).toContain('SIM original 24');expect(el.textContent).not.toContain('SIM refreshed 0');await act(async()=>resolve({campaigns:campaignRows(20,5,'SIM refreshed')}));expect(el.textContent).toContain('SIM refreshed 24');expect(el.textContent).toContain('Campanhas carregadas: 25');expect(el.textContent).not.toContain('SIM original 0');
});
it('preserves every loaded campaign if the second refresh page fails and requires a full retry',async()=>{
 const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:campaignRows(0,20),pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockResolvedValueOnce({campaigns:campaignRows(20,5),pagination:{hasMore:true,nextCursor:{...rangeCursor,id:'SIM-next'}}} as never).mockResolvedValueOnce({campaigns:campaignRows(0,20,'SIM incomplete'),pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockRejectedValueOnce(new Error('SIM second refresh failed')).mockResolvedValueOnce({campaigns:campaignRows(0,20,'SIM recovered'),pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockResolvedValueOnce({campaigns:campaignRows(20,5,'SIM recovered')} as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton('Carregar mais campanhas');await clickCampaignButton('Atualizar Métricas');expect(el.textContent).toContain('SIM original 24');expect(el.textContent).not.toContain('SIM incomplete 0');expect(el.textContent).toContain('SIM second refresh failed');expect(Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Carregar mais campanhas')!.disabled).toBe(true);await clickCampaignButton('Tentar novamente');expect(get).toHaveBeenCalledTimes(6);expect(el.textContent).toContain('SIM recovered 24');
});
it('blocks a repeated pagination cursor without appending ambiguous rows and recovers through refresh',async()=>{
 const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base],pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockResolvedValueOnce({campaigns:[{...base,id:'SIM-invalid',name:'SIM ambiguous'}],pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockResolvedValue({campaigns:[base]} as never);
 await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton('Carregar mais campanhas');expect(el.textContent).toContain('continuação das campanhas não avançou');expect(el.textContent).not.toContain('SIM ambiguous');await clickCampaignButton('Carregar mais campanhas');expect(get).toHaveBeenCalledTimes(2);await clickCampaignButton('Tentar novamente');expect(get).toHaveBeenCalledTimes(3);expect(el.textContent).not.toContain('continuação das campanhas não avançou');
});


it.each(['SIM_UNKNOWN','constructor','__proto__'])('keeps unknown campaign status %s readable with a review instruction',async status=>{
 await show([{...base,status}]);expect(el.textContent).toContain('Estado não reconhecido');
 expect(el.querySelector('[aria-label="Situação operacional de SIM Campaign"]')?.textContent).toContain('peça revisão antes de decidir uma nova ação');
 expect(el.textContent).toContain('SIM Campaign');expect(el.textContent).not.toContain('function Object');
});


const simVariant={templateName:'SIM variant',category:'UTILITY',sent:2,delivered:2,read:0,replied:0,openRate:0,replyRate:0};
it('marks missing or malformed variant counts as unknown without inventing zero',async()=>{
 await show([{...base,isAbTest:true,abReport:{winner:'TIED',variantA:{...simVariant,sent:undefined,delivered:-1,read:{bad:true},replied:0.5,salesCount:null},variantB:simVariant}}]);
 const report=el.querySelector('[aria-label="Comparação A/B de SIM Campaign"]')!;
 expect(report.textContent).toContain('Não informado envios');expect(report.textContent).toContain('Não informado entregas confirmadas');
 expect(report.textContent).toContain('Não informado lidas');expect(report.textContent).toContain('Não informado respostas');expect(report.textContent).toContain('Quantidade de vendas não informada');
 expect(report.textContent).not.toContain('null vendas');expect(report.textContent).not.toContain('-1 entregas');
});
it.each([{templateName:{bad:true}},{category:[]},{salesFormatted:{bad:true}}])('rejects malformed AB labels: %j',async invalid=>{
 await show([{...base,isAbTest:true,abReport:{winner:'A',variantA:{...simVariant,...invalid},variantB:simVariant}}]);
 expect(el.textContent).toContain('O relatório A/B contém informações incompatíveis');expect(el.textContent).toContain('Sem consulta válida');
});
it.each(['A','TIED'])('does not announce a winner or tie with unconfirmed variant counts: %s',async winner=>{
 await show([{...base,isAbTest:true,abReport:{winner,variantA:{...simVariant,sent:undefined},variantB:simVariant}}]);
 expect(el.textContent).toContain('Comparação não reconhecida');expect(el.textContent).not.toContain('Maior resultado observado: Variante A');expect(el.textContent).not.toContain('Resultados iguais nesta consulta');
});
it('does not interpolate missing or malformed AB percentages as measured rates',async()=>{
 await show([{...base,isAbTest:true,abReport:{winner:'TIED',variantA:{...simVariant,openRate:undefined,replyRate:NaN,conversionRate:-1},variantB:{...simVariant,openRate:25,replyRate:0,conversionRate:0}}}]);
 expect(el.textContent).toContain('Taxa não informada');expect(el.textContent).not.toContain('undefined%');expect(el.textContent).not.toContain('NaN%');expect(el.textContent).not.toContain('-1%');expect(el.textContent).toContain('25%');expect(el.textContent).toContain('0%');
});
it('keeps zero and missing delivery bases distinct in AB rates',async()=>{
 await show([{...base,isAbTest:true,abReport:{winner:'TIED',variantA:{...simVariant,delivered:0},variantB:{...simVariant,delivered:undefined}}}]);
 expect(el.textContent).toContain('Sem base');expect(el.textContent).toContain('Base não informada');expect(el.textContent).not.toContain('undefined%');
});


it.each([undefined,'SIM_UNKNOWN','constructor'])('does not declare an unrecognized AB result %s as a winning variant',async winner=>{
 await show([{...base,isAbTest:true,abReport:{winner,variantA:simVariant,variantB:simVariant}}]);
 const comparison=el.querySelector('[aria-label="Comparação A/B de SIM Campaign"]')!;expect(comparison.textContent).toContain('Comparação não reconhecida');expect(comparison.textContent).not.toContain('Maior resultado observado: Variante');expect(comparison.textContent).not.toContain('Resultados iguais');
});
it('preserves the explicitly reported AB variant and distinguishes it from an unknown result',async()=>{
 await show([{...base,isAbTest:true,abReport:{winner:'A',variantA:simVariant,variantB:simVariant}}]);expect(el.textContent).toContain('Maior resultado observado: Variante A');expect(el.textContent).not.toContain('Comparação não reconhecida');
});


it('keeps campaign metrics unavailable when the list envelope is incomplete',async()=>{
 vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValue({} as never);await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));expect(el.textContent).toContain('A consulta não confirmou uma lista válida de campanhas');expect(el.textContent).toContain('Sem consulta válida');
});
it('preserves campaigns and their cursor after an incomplete older-page response',async()=>{
 const get=vi.spyOn(apiClient,'getBroadcastCampaigns').mockResolvedValueOnce({campaigns:[base],pagination:{hasMore:true,nextCursor:rangeCursor}} as never).mockResolvedValueOnce({} as never).mockResolvedValueOnce({campaigns:[]} as never);await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton('Carregar mais campanhas');expect(el.textContent).toContain('SIM Campaign');expect(el.textContent).toContain('A consulta não confirmou uma lista válida de campanhas');await clickCampaignButton('Tentar carregar mais campanhas');expect(get.mock.calls[1]?.[2]).toEqual(get.mock.calls[2]?.[2]);
});


it.each([{}, {variantA:null,variantB:simVariant}, {variantA:simVariant,variantB:[]}])("rejects incomplete AB structures without rendering broken comparisons",async abReport=>{
 await show([{...base,isAbTest:true,abReport}]);expect(el.textContent).toContain("O relatório A/B está incompleto");expect(el.textContent).toContain("Sem consulta válida");expect(el.querySelector("[aria-label=\"Comparação A/B de SIM Campaign\"]")).toBeNull();
});
it("preserves the last campaign when a refresh loses a variant",async()=>{
 const get=vi.spyOn(apiClient,"getBroadcastCampaigns").mockResolvedValueOnce({campaigns:[base]} as never).mockResolvedValueOnce({campaigns:[{...base,isAbTest:true,abReport:{winner:"A",variantA:simVariant}}]} as never);await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));await clickCampaignButton("Atualizar Métricas");expect(get).toHaveBeenCalledTimes(2);expect(el.textContent).toContain("SIM Campaign");expect(el.textContent).toContain("O relatório A/B está incompleto");expect(el.textContent).not.toContain("Maior resultado observado: Variante A");
});


it.each([{sent:"2"},{delivered:-1},{read:undefined},{replied:0.5},{clicked:NaN}])("does not aggregate unconfirmed campaign counters %j",async invalid=>{await show([{...base,metrics:{...base.metrics,...invalid}}]);expect(el.textContent).toContain("contadores de campanha não confirmados");expect(el.textContent).toContain("Sem consulta válida");});
it("does not interpolate malformed regular campaign rates",async()=>{await show([{...base,metrics:{...base.metrics,deliveryRate:undefined,openRate:NaN,replyRate:-1,ctr:"invalid"}}]);expect(el.textContent).toContain("Taxa não informada");expect(el.textContent).not.toContain("undefined%");expect(el.textContent).not.toContain("NaN%");expect(el.textContent).not.toContain("-1%");});


it("keeps search and clearing filters reachable by keyboard",async()=>{vi.spyOn(apiClient,"getBroadcastCampaigns").mockResolvedValue({campaigns:[]} as never);await act(async()=>root.render(<CampaignsList workspaceId="SIM-company" token="SIM-token" onOpenNewBroadcast={()=>{}}/>));const input=el.querySelector<HTMLInputElement>("input")!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"SIM missing");input.dispatchEvent(new Event("input",{bubbles:true}));});await clickCampaignButton("Buscar campanhas");expect(document.activeElement).toBe(input);expect(el.textContent).toContain("Busca aplicada: SIM missing");await clickCampaignButton("Limpar filtros");expect(document.activeElement).toBe(input);expect(input.value).toBe("");expect(el.textContent).not.toContain("Busca aplicada:");});
