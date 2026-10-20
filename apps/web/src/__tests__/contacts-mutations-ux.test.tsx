// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {ContactsPage} from '../pages/ContactsPage';
import {apiClient,ApiError,type ContactSummary} from '../services/api-client';
import type {UseSessionReturn} from '../hooks/useSession';
// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const contact={id:'contact-a',name:'SIMULADO',phoneE164:'+5511999999999',optOut:false,metadata:{notes:'Original',tags:['LAB'],totalOrders:2},createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z'} as ContactSummary;
let root:Root,container:HTMLDivElement;
const button=(text:string)=>Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent===text)!;
const field=(text:string)=>{const label=Array.from(document.body.querySelectorAll('label')).find(l=>l.textContent?.includes(text))!;return document.getElementById(label.htmlFor) as HTMLInputElement;};
function setValue(el:HTMLInputElement,text:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}
async function render(id='ws-a'){await act(async()=>root.render(createElement(ContactsPage,{session:{activeWorkspace:{id},token:'synthetic'} as UseSessionReturn})));await act(async()=>vi.advanceTimersByTimeAsync(300));}
async function editNote(value:string){await act(async()=>{const note=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,value);note.dispatchEvent(new Event('input',{bubbles:true}));});}
async function open(){await act(async()=>{(document.querySelector('tr[role="button"]') as HTMLElement).click();});}
beforeEach(()=>{vi.useFakeTimers();container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.spyOn(apiClient,'getContacts').mockResolvedValue({contacts:[contact],total:1});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.useRealTimers();});
describe('contact mutations',()=>{
 it('preserves an edited contact on cancel and requires explicit discard on close',async()=>{
  const update=vi.spyOn(apiClient,'updateContact');await render();await open();await act(async()=>button('Editar dados').click());await editNote('SIM unsaved note');
  await act(async()=>button('Cancelar').click());expect(document.body.textContent).toContain('Há alterações não salvas.');expect(document.querySelector('textarea')!.value).toBe('SIM unsaved note');expect(document.querySelector('textarea')!.disabled).toBe(true);expect(button('Salvar').disabled).toBe(true);await act(async()=>button('Salvar').click());expect(update).not.toHaveBeenCalled();
  await act(async()=>button('Continuar editando').click());expect(document.body.textContent).not.toContain('Há alterações não salvas.');expect(document.activeElement).toBe(field('Nome'));
  await act(async()=>document.querySelector<HTMLButtonElement>('button[aria-label="Fechar painel"]')!.click());expect(document.body.textContent).toContain('Há alterações não salvas.');
  await act(async()=>button('Descartar alterações').click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(update).not.toHaveBeenCalled();
 });
 it('does not submit creation when keeping or discarding its unsaved inputs',async()=>{
  const create=vi.spyOn(apiClient,'createContact');await render();await act(async()=>button('Novo Contato').click());await act(async()=>setValue(field('Nome'),'SIM unsaved create'));
  await act(async()=>button('Cancelar').click());expect(document.body.textContent).toContain('Há alterações não salvas.');expect(button('Salvar').disabled).toBe(true);await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(create).not.toHaveBeenCalled();
  await act(async()=>button('Continuar editando').click());expect(document.activeElement).toBe(field('Telefone'));expect(field('Nome').value).toBe('SIM unsaved create');expect(create).not.toHaveBeenCalled();
  await act(async()=>button('Cancelar').click());await act(async()=>button('Descartar alterações').click());expect(document.body.textContent).not.toContain('Cadastrar Novo Contato');expect(create).not.toHaveBeenCalled();
 });
 it('does not ask for discard when the edit was reverted to its original value',async()=>{
  await render();await open();await act(async()=>button('Editar dados').click());await editNote('SIM changed');await editNote('Original');await act(async()=>button('Cancelar').click());expect(document.body.textContent).not.toContain('Há alterações não salvas.');expect(button('Editar dados')).toBeTruthy();
 });

 it('does not submit a contact form with no edits',async()=>{const update=vi.spyOn(apiClient,'updateContact');await render();await open();await act(async()=>button('Editar dados').click());await act(async()=>button('Salvar').click());expect(update).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Nenhuma alteração para salvar.');});

 it('keeps the note baseline from opening the editor when a pending list refresh completes',async()=>{
  const update=vi.spyOn(apiClient,'updateContact').mockRejectedValue(new Error('SIM stop after payload'));
  await render();let resolve!:(v:{contacts:ContactSummary[];total:number})=>void;
  vi.mocked(apiClient.getContacts).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  await act(async()=>setValue(document.querySelector('input[aria-label="Buscar contatos por telefone ou nome"]')!,'SIM'));
  await act(async()=>vi.advanceTimersByTimeAsync(300));await open();await act(async()=>button('Editar dados').click());await editNote('SIM draft');
  await act(async()=>resolve({contacts:[{...contact,metadata:{...contact.metadata,notes:'Changed during editing'}}],total:1}));
  await act(async()=>button('Salvar').click());expect(update.mock.calls[0]![2]).toMatchObject({expectedNotes:'Original',metadata:{notes:'SIM draft'}});
 });

 it('reviews a conflicting note without losing the other edits and retries using the chosen baseline',async()=>{
  const update=vi.spyOn(apiClient,'updateContact').mockRejectedValueOnce(new ApiError(409,'Nota alterada','SIM conflito')).mockResolvedValue({contact});
  await render();await open();await act(async()=>button('Editar dados').click());
  await act(async()=>{const note=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'SIM minha edição');note.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Salvar').click());expect(button('Salvar').disabled).toBe(true);
  vi.mocked(apiClient.getContacts).mockRejectedValueOnce(new Error('SIM consulta indisponível'));
  await act(async()=>button('Consultar nota atual').click());expect(document.body.textContent).toContain('SIM consulta indisponível');expect(document.querySelector('textarea')!.value).toBe('SIM minha edição');
  vi.mocked(apiClient.getContacts).mockResolvedValue({contacts:[{...contact,metadata:{...contact.metadata,notes:'SIM recebida'}}],total:1});
  await act(async()=>button('Consultar nota atual').click());expect(document.body.textContent).toContain('SIM recebida');
  await act(async()=>button('Cancelar').click());expect(button('Consultar nota atual').disabled).toBe(true);expect(button('Usar nota atual').disabled).toBe(true);expect(button('Manter minha edição da nota').disabled).toBe(true);await act(async()=>button('Usar nota atual').click());expect(document.querySelector('textarea')!.value).toBe('SIM minha edição');await act(async()=>button('Continuar editando').click());expect(button('Usar nota atual').disabled).toBe(false);
  await act(async()=>button('Manter minha edição da nota').click());expect(document.querySelector('textarea')!.value).toBe('SIM minha edição');
  await act(async()=>button('Salvar').click());expect(update.mock.calls[1]![2]).toMatchObject({expectedNotes:'SIM recebida',metadata:{notes:'SIM minha edição'}});
 });

 it('prevents repeated create and closing during the request',async()=>{
  let resolve!:(v:{contact:ContactSummary})=>void;const create=vi.spyOn(apiClient,'createContact').mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await act(async()=>button('Novo Contato').click());await act(async()=>setValue(field('Telefone WhatsApp'),contact.phoneE164));
  await act(async()=>{const form=document.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));button('Cancelar').click();});
  expect(create).toHaveBeenCalledTimes(1);expect(document.body.textContent).toContain('Cadastrar Novo Contato');
  await act(async()=>resolve({contact}));expect(document.body.textContent).not.toContain('Cadastrar Novo Contato');expect(document.body.textContent).toContain('telefone já cadastrado reutiliza');
 });
 it('ignores a save result from a previous company',async()=>{
  let resolve!:(v:{contact:ContactSummary})=>void;vi.spyOn(apiClient,'updateContact').mockImplementation(()=>new Promise(r=>{resolve=r;}));await render();await open();await act(async()=>button('Editar dados').click());await editNote('SIM pending draft');await act(async()=>button('Salvar').click());
  vi.mocked(apiClient.getContacts).mockResolvedValue({contacts:[],total:0});await render('ws-b');
  await act(async()=>resolve({contact:{...contact,name:'OUTRA EMPRESA'}}));expect(document.body.textContent).not.toContain('OUTRA EMPRESA');expect(document.querySelector('[role="dialog"]')).toBeNull();
 });
 it('keeps edit fields and reports failure without changing preference metadata',async()=>{
  const update=vi.spyOn(apiClient,'updateContact').mockRejectedValue(new Error('Falha controlada'));await render();await open();await act(async()=>button('Editar dados').click());await act(async()=>setValue(field('Nome'),'Nome editado'));await act(async()=>button('Salvar').click());
  expect(field('Nome').value).toBe('Nome editado');expect(document.body.textContent).toContain('Falha controlada');expect(update.mock.calls[0]?.[2]).toMatchObject({name:'Nome editado'});expect(update.mock.calls[0]?.[2]).not.toHaveProperty('optOut');
 });
 it('requires consent evidence before requesting commercial resumption',async()=>{
  vi.mocked(apiClient.getContacts).mockResolvedValue({contacts:[{...contact,optOut:true}],total:1});const update=vi.spyOn(apiClient,'updateContact').mockResolvedValue({contact});await render();await open();await act(async()=>button('Retomar mensagens comerciais').click());await act(async()=>button('Confirmar retomada').click());
  expect(update).not.toHaveBeenCalled();expect(document.body.textContent).toContain('onde e quando');
  await act(async()=>button('Retomar mensagens comerciais').click());await act(async()=>setValue(field('Origem e momento'),'SIMULADO — pedido explícito hoje às 14h'));await act(async()=>button('Confirmar retomada').click());
  expect(update).toHaveBeenCalledWith('ws-a','contact-a',{optOut:false,consentEvidence:'SIMULADO — pedido explícito hoje às 14h'},{token:'synthetic'});
 });
});
