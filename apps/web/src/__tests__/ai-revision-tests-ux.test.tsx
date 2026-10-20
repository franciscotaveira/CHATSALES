// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {AiRevisionTests} from '../pages/settings/AiRevisionTests';
import {apiClient} from '../services/api-client';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;
const scenario={id:'human',title:'Pedido humano',question:'Quero uma pessoa',expected:'Encaminhar',origin:'base' as const};
const listing={revision:1,currentRevision:1,verifierVersion:'text-intent-v1',scenarios:[scenario],runs:[]};
const result={id:'sim-run',revision:1,scenarioId:'human',title:scenario.title,question:scenario.question,expected:scenario.expected,status:'completed' as const,replyText:'SIMULADO Resposta',checks:[{id:'actions',label:'Execução de ações operacionais',status:'not_verified' as const}],needsHandoff:true,offerPixProductId:null,provider:'SIM',model:'SIM',createdAt:'2026-10-17T10:00:00Z',completedAt:'2026-10-17T10:00:01Z',failureMessage:null,isSynthetic:true,reviewRevision:0,qualityReview:null,catalogSnapshot:[]};
const button=(text:string)=>[...el.querySelectorAll('button')].find(node=>node.textContent===text)!;
const render=async(workspaceId='a',dirty=false)=>act(async()=>root.render(<AiRevisionTests workspaceId={workspaceId} token="synthetic" revision={1} dirty={dirty}/>));
async function note(value:string){await act(async()=>{const node=el.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);vi.spyOn(apiClient,'getAiRevisionTests').mockResolvedValue(listing);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
describe('Saved revision text test UX',()=>{
 it('blocks runs with unsaved changes and serializes double clicks',async()=>{
 const execute=vi.spyOn(apiClient,'runAiRevisionTest').mockResolvedValue(result);
 await render('a',true);expect(button('Executar cenário').disabled).toBe(true);await render();await act(async()=>{button('Executar cenário').click();button('Executar cenário').click();});
 expect(execute).toHaveBeenCalledOnce();expect(execute.mock.calls[0]![1]).toMatchObject({expectedRevision:1,scenarioId:'human'});expect(el.textContent).toContain('SIMULADO');expect(el.textContent).toContain('não verificado');
 });
 it('does not let old company results replace the current company',async()=>{
 let resolve!:(value:typeof result)=>void;vi.spyOn(apiClient,'runAiRevisionTest').mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 await render();await act(async()=>button('Executar cenário').click());await render('b');await act(async()=>resolve(result));expect(el.textContent).not.toContain('SIMULADO Resposta');expect(button('Executar cenário').disabled).toBe(false);
 });
 it('keeps request identity after an uncertain failure and preserves notes on refresh',async()=>{
 const execute=vi.spyOn(apiClient,'runAiRevisionTest').mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(result);
 await render();await act(async()=>button('Executar cenário').click());await act(async()=>button('Executar cenário').click());expect(execute.mock.calls[0]![1].requestKey).toBe(execute.mock.calls[1]![1].requestKey);
 await note('SIMULADO observação preservada');vi.mocked(apiClient.getAiRevisionTests).mockResolvedValue({...listing,runs:[result]});await act(async()=>button('Atualizar resultados').click());expect(el.querySelector('textarea')!.value).toBe('SIMULADO observação preservada');
 });
 it('records quality without presenting unverified actions as approved',async()=>{
 vi.mocked(apiClient.getAiRevisionTests).mockResolvedValue({...listing,runs:[result]});const save=vi.spyOn(apiClient,'reviewAiRevisionTest').mockResolvedValue({...result,reviewRevision:1,qualityReview:{revision:1,verdict:'adequate',note:'SIM revisão adequada',reviewedAt:'2026-10-17T10:01:00Z'}});
 await render();expect(button('Resposta adequada').disabled).toBe(true);await note('SIM revisão adequada');await act(async()=>button('Resposta adequada').click());expect(save.mock.calls[0]![2]).toMatchObject({expectedRevision:1,expectedReviewRevision:0,verdict:'adequate'});expect(el.textContent).toContain('não verificado');expect(el.textContent).toContain('Não aprova ações nem libera atendimento automático');
 });
});

it('explains the review minimum and locks the submitted note until the response returns',async()=>{vi.mocked(apiClient.getAiRevisionTests).mockResolvedValue({...listing,runs:[result]});let reject!:(e:unknown)=>void;const save=vi.spyOn(apiClient,'reviewAiRevisionTest').mockImplementation(()=>new Promise((_,r)=>{reject=r;}));await render();const field=el.querySelector('textarea')!;expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent).toContain('pelo menos 10 caracteres');await note('SIM observação enviada');await act(async()=>button('Resposta adequada').click());expect(field.disabled).toBe(true);expect(button('Precisa de ajustes').disabled).toBe(true);expect(save).toHaveBeenCalledOnce();await act(async()=>reject(new Error('SIM avaliação rejeitada')));expect(field.disabled).toBe(false);expect(field.value).toBe('SIM observação enviada');expect(el.textContent).toContain('SIM avaliação rejeitada');expect(document.activeElement).toBe(el.querySelector('[role="alert"]'));});

it('preserves an unrecorded quality comment before rerunning and restores focus after explicit discard',async()=>{
 vi.mocked(apiClient.getAiRevisionTests).mockResolvedValue({...listing,runs:[result]});const execute=vi.spyOn(apiClient,'runAiRevisionTest');await render();await note('SIM comentário ainda não registrado');
 expect(button('Executar novamente').disabled).toBe(true);await act(async()=>button('Executar novamente').click());expect(execute).not.toHaveBeenCalled();expect(el.querySelector('textarea')!.value).toBe('SIM comentário ainda não registrado');expect(el.textContent).toContain('Registre a avaliação ou descarte');
 await act(async()=>button('Descartar comentário não registrado').click());expect(button('Executar novamente').disabled).toBe(false);expect(el.querySelector('textarea')!.value).toBe('');expect(document.activeElement).toBe(el.querySelector('textarea'));expect(execute).not.toHaveBeenCalled();
});
it('unlocks rerun once the current quality comment has been recorded',async()=>{
 vi.mocked(apiClient.getAiRevisionTests).mockResolvedValue({...listing,runs:[result]});const text='SIM avaliação registrada';vi.spyOn(apiClient,'reviewAiRevisionTest').mockResolvedValue({...result,reviewRevision:1,qualityReview:{revision:1,verdict:'adequate',note:text,reviewedAt:'2026-10-18T10:00:00Z'}});
 await render();await note(text);await act(async()=>button('Resposta adequada').click());expect(button('Executar novamente').disabled).toBe(false);expect(button('Descartar comentário não registrado')).toBeUndefined();expect(el.textContent).toContain('Avaliação registrada');
});

it('does not let a refreshed execution hide the result whose comment is still being edited',async()=>{
 const query=vi.mocked(apiClient.getAiRevisionTests).mockResolvedValue({...listing,runs:[result]});await render();await note('SIM comentário pendente');
 query.mockResolvedValue({...listing,runs:[{...result,id:'SIM-new-run',replyText:'SIM nova execução'}]});
 expect(button('Atualizar resultados').disabled).toBe(true);await act(async()=>button('Atualizar resultados').click());expect(query).toHaveBeenCalledTimes(1);expect(el.textContent).toContain('SIMULADO Resposta');expect(el.textContent).not.toContain('SIM nova execução');expect(el.querySelector('textarea')!.value).toBe('SIM comentário pendente');
 await act(async()=>button('Descartar comentário não registrado').click());expect(button('Atualizar resultados').disabled).toBe(false);await act(async()=>button('Atualizar resultados').click());expect(query).toHaveBeenCalledTimes(2);expect(el.textContent).toContain('SIM nova execução');
});

it.each([{revision:2},{scenarioId:'unknown'},{checks:[{id:'SIM-invalid',label:'SIM check',status:'UNKNOWN'}]}])('does not publish a mismatched test run and retains its request identity %j',async patch=>{
 const execute=vi.spyOn(apiClient,'runAiRevisionTest').mockResolvedValueOnce({...result,...patch} as never).mockResolvedValueOnce(result);await render();await act(async()=>button('Executar cenário').click());expect(el.textContent).toContain('resultados recebidos não correspondem');expect(el.textContent).not.toContain('SIMULADO Resposta');await act(async()=>button('Executar cenário').click());expect(execute.mock.calls[0]?.[1].requestKey).toBe(execute.mock.calls[1]?.[1].requestKey);expect(el.textContent).toContain('SIMULADO Resposta');
});
it('rejects a test list that belongs to another revision and allows a valid reload',async()=>{
 vi.mocked(apiClient.getAiRevisionTests).mockResolvedValueOnce({...listing,revision:2}).mockResolvedValueOnce(listing);await render();expect(el.textContent).toContain('resultados recebidos não correspondem');expect(button('Executar cenário')).toBeUndefined();await act(async()=>button('Atualizar resultados').click());expect(button('Executar cenário')).toBeDefined();
});

it('preserves confirmed test results after refresh failure and blocks actions until consultation recovers',async()=>{
 vi.mocked(apiClient.getAiRevisionTests).mockResolvedValueOnce({...listing,runs:[result]}).mockRejectedValueOnce(new Error('SIM refresh unavailable')).mockResolvedValueOnce({...listing,runs:[result]});const execute=vi.spyOn(apiClient,'runAiRevisionTest');await render();expect(el.textContent).toContain('SIMULADO Resposta');await act(async()=>button('Atualizar resultados').click());expect(el.textContent).toContain('SIM refresh unavailable');expect(el.textContent).toContain('SIMULADO Resposta');expect(el.textContent).toContain('última consulta concluída');expect(button('Executar novamente').disabled).toBe(true);await act(async()=>button('Executar novamente').click());expect(execute).not.toHaveBeenCalled();await act(async()=>button('Atualizar resultados').click());expect(button('Executar novamente').disabled).toBe(false);expect(el.textContent).not.toContain('última consulta concluída');
});
