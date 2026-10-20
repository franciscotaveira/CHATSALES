// @vitest-environment happy-dom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CommandPalette} from '../components/CommandPalette/CommandPalette';import type {CommandItem} from '../components/CommandPalette/CommandPalette.types';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const close=vi.fn();
const item=(id:string,category:CommandItem['category']='navigation'):CommandItem=>({id,title:`SIM ${id}`,category,onSelect:vi.fn()});
const input=()=>document.querySelector<HTMLInputElement>('[role="combobox"]')!;
const view=(items:CommandItem[])=><CommandPalette isOpen onClose={close} items={items}/>;
async function key(key:string){await act(async()=>input().dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));}
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);close.mockReset();});afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
it('preserves the selected command identity after items are reordered',async()=>{const a=item('a'),b=item('b'),c=item('c');await act(async()=>root.render(view([a,b,c])));await key('ArrowDown');expect(document.querySelector('[aria-selected="true"]')?.textContent).toContain('SIM b');await act(async()=>root.render(view([c,a,b])));await key('Enter');expect(b.onSelect).toHaveBeenCalledOnce();expect(a.onSelect).not.toHaveBeenCalled();expect(c.onSelect).not.toHaveBeenCalled();});
it('does not execute the replacement row after the selected command disappears',async()=>{const a=item('a'),b=item('b'),c=item('c');await act(async()=>root.render(view([a,b])));await key('ArrowDown');await act(async()=>root.render(view([a,c])));await key('Enter');expect(a.onSelect).not.toHaveBeenCalled();expect(b.onSelect).not.toHaveBeenCalled();expect(c.onSelect).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(input().getAttribute('aria-activedescendant')).toBeNull();expect(document.body.textContent).toContain('A opção selecionada não está mais disponível');await key('ArrowDown');await key('Enter');expect(a.onSelect).toHaveBeenCalledOnce();});
it('resets selection for a new query and follows grouped visual order',async()=>{const action=item('ação','actions'),nav=item('navegação');await act(async()=>root.render(view([action,nav])));expect(document.querySelector('[aria-selected="true"]')?.textContent).toContain('SIM navegação');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input(),'sim acao');input().dispatchEvent(new Event('input',{bubbles:true}));});expect(Array.from(document.querySelectorAll('[role="option"]')).map(o=>o.textContent)).toEqual(['SIM ação']);await key('Enter');expect(action.onSelect).toHaveBeenCalledOnce();expect(nav.onSelect).not.toHaveBeenCalled();});
it('selects the final available option with ArrowUp after the previous selection is removed',async()=>{const a=item('a'),b=item('b'),c=item('c');await act(async()=>root.render(view([a])));await act(async()=>root.render(view([b,c])));await key('ArrowUp');await key('Enter');expect(c.onSelect).toHaveBeenCalledOnce();expect(b.onSelect).not.toHaveBeenCalled();});

it('does not execute or dismiss commands while a composed character is being confirmed',async()=>{
 const a=item('a');await act(async()=>root.render(view([a])));
 for(const key of ['Enter','Escape','ArrowDown'])await act(async()=>input().dispatchEvent(new KeyboardEvent('keydown',{key,isComposing:true,bubbles:true,cancelable:true})));
 expect(a.onSelect).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 await act(async()=>input().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true})));expect(a.onSelect).not.toHaveBeenCalled();await key('Enter');expect(a.onSelect).toHaveBeenCalledOnce();
});
