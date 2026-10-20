// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {CreateProductDialog} from '../pages/products/CreateProductDialog';
import {apiClient,type ProductRecord} from '../services/api-client';
// @ts-expect-error React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;const close=vi.fn(),created=vi.fn();
const product={id:'product-a',retailerId:'SIM-PRODUCT',catalogId:'catalog-other',title:'SIMULADO',subtitle:'Preservar',description:'Descrição',priceCents:150000,currency:'BRL',category:'LAB',imageUrl:'https://example.invalid/image.png',badge:'LAB',status:'ACTIVE',isFeatured:true,updatedAt:'2026-10-01T12:00:00Z'} as ProductRecord;
const field=(label:string)=>{const l=Array.from(document.querySelectorAll('label')).find(l=>l.textContent?.includes(label))!;return document.getElementById(l.htmlFor) as HTMLInputElement;};
function value(el:HTMLInputElement,text:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}
async function render(overrides:Record<string,unknown>={}){await act(async()=>root.render(createElement(CreateProductDialog,{isOpen:true,onClose:close,onCreated:created,workspaceId:'ws-a',token:'synthetic',product,...overrides})));}
async function submit(){await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
beforeEach(()=>{container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
describe('product editing and image upload',()=>{
 it('preserves advanced fields, uses reais and provides the revision being edited',async()=>{
  const save=vi.spyOn(apiClient,'createProduct').mockResolvedValue({product});await render();await act(async()=>{value(field('Preço'),'1500');value(field('Título'),'SIMULADO revisado');});await submit();
  expect(save.mock.calls[0]?.[1]).toMatchObject({priceCents:150000,expectedProductId:product.id,expectedUpdatedAt:product.updatedAt,catalogId:product.catalogId,subtitle:product.subtitle,currency:'BRL',badge:'LAB',isFeatured:true});expect(close).toHaveBeenCalledTimes(1);
 });
 it('rejects an ambiguous amount instead of silently changing its magnitude',async()=>{
  const save=vi.spyOn(apiClient,'createProduct');await render();await act(async()=>value(field('Preço'),'1,2,3'));await submit();expect(save).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Informe um preço válido');
 });
 it('ignores an upload result after changing company and product',async()=>{
  let resolve!:(v:{mediaUrl:string})=>void;const upload=vi.spyOn(apiClient,'uploadMedia').mockImplementation(()=>new Promise(r=>{resolve=r;}) as never);await render();
  const input=document.querySelector('input[type="file"]')!;Object.defineProperty(input,'files',{value:[new File(['synthetic'],'sim.png',{type:'image/png'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  expect(upload).toHaveBeenCalledTimes(1);await render({workspaceId:'ws-b',product:{...product,id:'product-b',imageUrl:'https://example.invalid/new.png'}});await act(async()=>resolve({mediaUrl:'https://example.invalid/old-upload.png'}));
  expect((document.querySelector('[aria-label="URL da imagem do produto"]') as HTMLInputElement).value).toBe('https://example.invalid/new.png');
 });
 it('rejects unsupported images without starting an upload',async()=>{
  const upload=vi.spyOn(apiClient,'uploadMedia');await render();const input=document.querySelector('input[type="file"]')!;Object.defineProperty(input,'files',{value:[new File(['synthetic'],'sim.gif',{type:'image/gif'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));expect(upload).not.toHaveBeenCalled();expect(document.body.textContent).toContain('JPEG, PNG ou WebP de até 5 MB');
 });
 it('does not duplicate a save or repeat it after refresh failure',async()=>{
  let resolve!:(v:{product:ProductRecord})=>void;const save=vi.spyOn(apiClient,'createProduct').mockImplementation(()=>new Promise(r=>{resolve=r;}));created.mockRejectedValueOnce(new Error('Refresh failed'));await render();await act(async()=>value(field('Título'),'SIMULADO revisado'));
  await act(async()=>{const form=document.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(save).toHaveBeenCalledTimes(1);
  await act(async()=>resolve({product}));expect(close).not.toHaveBeenCalled();expect(document.body.textContent).toContain('Produto salvo');await submit();expect(save).toHaveBeenCalledTimes(1);
 });
});
