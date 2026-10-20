// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {requestNavigation} from '../utils/request-navigation';
import {PixSection} from '../pages/settings/PixSection';import {apiClient} from '../services/api-client';import type {UseSessionReturn} from '../hooks/useSession';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const refresh=vi.fn();
const session=(changes:Record<string,unknown>={})=>({activeWorkspace:{id:'SIM-ws',role:'owner'},token:'SIM-token',activeWorkspaceDetails:{workspace:{id:'SIM-ws',defaultPixKey:'SIM-key',defaultPixKeyType:'random',defaultPixMerchantName:'SIM nome',defaultPixMerchantCity:'SIM cidade',...changes}},refreshWorkspace:refresh} as unknown as UseSessionReturn);
const field=(n:number)=>el.querySelectorAll('input')[n]!;const saveButton=()=>el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
it.each([false,true])('restores Pix refresh focus without stealing a new control, moved=%s',async(moved)=>{
 let resolve!:()=>void;refresh.mockReturnValueOnce(new Promise<void>(r=>{resolve=r;}));await act(async()=>root.render(<PixSection session={session()}/>));
 const button=Array.from(el.querySelectorAll('button')).find(b=>b.textContent==='Atualizar dados da empresa')!;button.focus();await act(async()=>button.click());button.blur();
 const other=document.createElement('button');document.body.appendChild(other);if(moved)other.focus();await act(async()=>resolve());expect(document.activeElement).toBe(moved?other:button);other.remove();
});
it.each([{}, {workspace:{id:'SIM-other',defaultPixMerchantName:'SIM novo nome'}},{workspace:{id:'SIM-ws'}},{workspace:{id:'SIM-ws',defaultPixMerchantName:'SIM nome divergente'}}])('preserves edits without claiming success for an incompatible Pix response %j',async(response)=>{
 vi.spyOn(apiClient,'updateWorkspace').mockResolvedValue(response as never);await act(async()=>root.render(<PixSection session={session()}/>));await input(1,'SIM novo nome');await submit();
 expect(el.textContent).toContain('O servidor não confirmou os dados Pix');expect(el.textContent).not.toContain('salvas com sucesso');expect(field(1).value).toBe('SIM novo nome');expect(saveButton().disabled).toBe(false);expect(refresh).not.toHaveBeenCalled();
});
async function input(n:number,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field(n),value);field(n).dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);refresh.mockReset().mockResolvedValue(undefined);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.restoreAllMocks();});
it('does not patch an unchanged or reverted form',async()=>{const save=vi.spyOn(apiClient,'updateWorkspace');await act(async()=>root.render(<PixSection session={session()}/>));expect(saveButton().disabled).toBe(true);await submit();expect(save).not.toHaveBeenCalled();await input(1,'SIM alterado');expect(saveButton().disabled).toBe(false);await input(1,'  SIM nome  ');expect(saveButton().disabled).toBe(true);await submit();expect(save).not.toHaveBeenCalled();});
it('patches only the edited merchant field while preserving newer unrelated company settings',async()=>{const save=vi.spyOn(apiClient,'updateWorkspace').mockImplementation(async(id,payload)=>({workspace:{id,...payload}} as never));await act(async()=>root.render(<PixSection session={session()}/>));await input(1,'SIM novo nome');await act(async()=>root.render(<PixSection session={session({defaultPixKey:'SIM chave mais recente',defaultPixMerchantCity:'SIM nova cidade'})}/>));expect(field(0).value).toBe('SIM-key');await submit();expect(save).toHaveBeenCalledExactlyOnceWith('SIM-ws',{defaultPixMerchantName:'SIM novo nome'},{token:'SIM-token'});expect(saveButton().disabled).toBe(true);});
it('sends key and type together when either member of that pair is edited',async()=>{const save=vi.spyOn(apiClient,'updateWorkspace').mockImplementation(async(id,payload)=>({workspace:{id,...payload}} as never));await act(async()=>root.render(<PixSection session={session()}/>));await input(0,'SIM nova chave');await submit();expect(save.mock.calls[0]?.[1]).toEqual({defaultPixKey:'SIM nova chave',defaultPixKeyType:'random'});});
it('clears only an explicitly emptied field and does not truncate untouched historical names',async()=>{const longName='SIM nome historico '.repeat(3);const save=vi.spyOn(apiClient,'updateWorkspace').mockImplementation(async(id,payload)=>({workspace:{id,...payload}} as never));await act(async()=>root.render(<PixSection session={session({defaultPixMerchantName:longName})}/>));await input(2,'');await submit();expect(save.mock.calls[0]?.[1]).toEqual({defaultPixMerchantCity:null});expect(field(1).value).toBe(longName);});
it('preserves an unknown stored key type while editing another field but requires a recognized type for a key change',async()=>{const save=vi.spyOn(apiClient,'updateWorkspace').mockImplementation(async(id,payload)=>({workspace:{id,...payload}} as never));await act(async()=>root.render(<PixSection session={session({defaultPixKeyType:'SIM-legacy'})}/>));expect(el.textContent).toContain('Tipo cadastrado não reconhecido');await input(2,'SIM cidade nova');await submit();expect(save.mock.calls[0]?.[1]).toEqual({defaultPixMerchantCity:'SIM cidade nova'});await input(0,'SIM outra chave');await submit();expect(save).toHaveBeenCalledOnce();expect(el.textContent).toContain('Escolha um tipo de chave reconhecido');});
it('keeps the saved baseline after refresh failure so an unchanged draft is not submitted twice',async()=>{const save=vi.spyOn(apiClient,'updateWorkspace').mockImplementation(async(id,payload)=>({workspace:{id,...payload}} as never));refresh.mockRejectedValueOnce(new Error('SIM refresh'));await act(async()=>root.render(<PixSection session={session()}/>));await input(2,'SIM cidade salva');await submit();expect(el.textContent).toContain('Configuração salva, mas');expect(saveButton().disabled).toBe(true);await submit();expect(save).toHaveBeenCalledOnce();});

it('recognizes uppercase historical key types without silently rewriting them during a name edit',async()=>{
 const save=vi.spyOn(apiClient,'updateWorkspace').mockImplementation(async(id,payload)=>({workspace:{id,...payload}} as never));await act(async()=>root.render(<PixSection session={session({defaultPixKeyType:'CNPJ'})}/>));expect(el.querySelector('select')!.value).toBe('cnpj');expect(el.textContent).not.toContain('Tipo cadastrado não reconhecido');expect(saveButton().disabled).toBe(true);await input(1,'SIM nome novo');await submit();expect(save.mock.calls[0]?.[1]).toEqual({defaultPixMerchantName:'SIM nome novo'});
});

it('accepts fresh company data again after the edit is fully reverted',async()=>{
 await act(async()=>root.render(<PixSection session={session()}/>));await input(1,'SIM rascunho');await input(1,'SIM nome');await act(async()=>root.render(<PixSection session={session({defaultPixMerchantCity:'SIM cidade atual'})}/>));expect(field(2).value).toBe('SIM cidade atual');expect(saveButton().disabled).toBe(true);
});

it('reviews leaving edited Pix settings and restores focus without submitting financial configuration',async()=>{
 const save=vi.spyOn(apiClient,'updateWorkspace'),leave=vi.fn();await act(async()=>root.render(<PixSection session={session()}/>));
 await input(1,'SIM recebedor em revisão');await act(async()=>requestNavigation(leave));expect(leave).not.toHaveBeenCalled();expect(el.querySelector('fieldset')!.disabled).toBe(true);expect(saveButton().disabled).toBe(true);
 await submit();expect(save).not.toHaveBeenCalled();
 const choose=(label:string)=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!;
 await act(async()=>choose('Continuar editando').click());expect(field(1).value).toBe('SIM recebedor em revisão');expect(document.activeElement).toBe(field(1));
 const reload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(reload);expect(reload.defaultPrevented).toBe(true);
 await act(async()=>requestNavigation(leave));await act(async()=>choose('Descartar alterações').click());expect(leave).toHaveBeenCalledOnce();expect(save).not.toHaveBeenCalled();
});
it('removes the exit warning when Pix edits are reverted or the financial editor is unmounted',async()=>{
 const leave=vi.fn();await act(async()=>root.render(<PixSection session={session()}/>));await input(2,'SIM temporário');await input(2,'SIM cidade');await act(async()=>requestNavigation(leave));expect(leave).toHaveBeenCalledOnce();
 await input(2,'SIM outro rascunho');await act(async()=>root.render(<p>SIM editor fechado</p>));await act(async()=>requestNavigation(leave));expect(leave).toHaveBeenCalledTimes(2);
 const reload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(reload);expect(reload.defaultPrevented).toBe(false);
});
