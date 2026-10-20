// @vitest-environment happy-dom
import {act,useRef} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {requestNavigation} from '../utils/request-navigation';
import {useDiscardChanges,UnsavedChangesNotice} from '../pages/UnsavedChangesNotice';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const exit=vi.fn();
function Editor({scope='SIM-a',preferField=false,dirty=true,warnOnReload=false}:{scope?:string;preferField?:boolean;dirty?:boolean;warnOnReload?:boolean}){const field=useRef<HTMLInputElement>(null);const guard=useDiscardChanges(dirty,scope,preferField?()=>field.current:undefined,warnOnReload);return <div>{guard.isPending&&<UnsavedChangesNotice onKeep={guard.keepEditing} onDiscard={guard.discard}/>}<fieldset disabled={guard.isPending}><input aria-label="SIM campo" ref={field}/><button onClick={()=>guard.requestExit(exit)}>Sair</button></fieldset></div>;}
const button=(label:string)=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!;
async function requestExit(){await act(async()=>{button('Sair').focus();button('Sair').click();});expect(document.activeElement).toBe(el.querySelector('[aria-label="Alterações não salvas"]'));}
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);exit.mockReset();});afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
it('restores the original trigger after keeping changes when no field is specified',async()=>{await act(async()=>root.render(<Editor/>));await requestExit();await act(async()=>button('Continuar editando').click());expect(document.activeElement).toBe(button('Sair'));expect(exit).not.toHaveBeenCalled();});
it('resumes on the preferred field after its fieldset is re-enabled',async()=>{await act(async()=>root.render(<Editor preferField/>));await requestExit();expect(el.querySelector('fieldset')!.disabled).toBe(true);await act(async()=>button('Continuar editando').click());expect(el.querySelector('fieldset')!.disabled).toBe(false);expect(document.activeElement).toBe(el.querySelector('input'));expect(exit).not.toHaveBeenCalled();});
it('does not pull focus into another context after the discard review is invalidated',async()=>{await act(async()=>root.render(<Editor preferField/>));await requestExit();await act(async()=>root.render(<Editor scope="SIM-b" preferField/>));expect(el.querySelector('[aria-label="Alterações não salvas"]')).toBeNull();expect(document.activeElement).not.toBe(el.querySelector('input'));expect(exit).not.toHaveBeenCalled();});

it('warns on reload only while an enabled editor has unsaved changes and cleans up after unmount',async()=>{const attempt=()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};await act(async()=>root.render(<Editor warnOnReload/>));expect(attempt()).toBe(true);await act(async()=>root.render(<Editor warnOnReload dirty={false}/>));expect(attempt()).toBe(false);await act(async()=>root.render(<Editor warnOnReload/>));expect(attempt()).toBe(true);await act(async()=>root.render(<Editor/>));expect(attempt()).toBe(false);await act(async()=>root.render(<Editor warnOnReload/>));await act(async()=>root.render(<p>SIM fechado</p>));expect(attempt()).toBe(false);});

it('reviews internal navigation, preserves editing on cancellation and proceeds once after discard',async()=>{
 await act(async()=>root.render(<Editor warnOnReload preferField/>));
 await act(async()=>requestNavigation(exit));
 expect(exit).not.toHaveBeenCalled();expect(el.querySelector('fieldset')!.disabled).toBe(true);
 await act(async()=>button('Continuar editando').click());expect(exit).not.toHaveBeenCalled();expect(document.activeElement).toBe(el.querySelector('input'));
 await act(async()=>requestNavigation(exit));await act(async()=>button('Descartar alterações').click());expect(exit).toHaveBeenCalledTimes(1);
});
it('does not navigate after an editor context changes during review, and unregisters closed editors',async()=>{
 await act(async()=>root.render(<Editor warnOnReload/>));await act(async()=>requestNavigation(exit));
 await act(async()=>root.render(<Editor scope="SIM-next" warnOnReload dirty={false}/>));expect(exit).not.toHaveBeenCalled();
 await act(async()=>requestNavigation(exit));expect(exit).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<p>SIM fechado</p>));await act(async()=>requestNavigation(exit));expect(exit).toHaveBeenCalledTimes(2);
});
it('collects every open editor review before performing one navigation',async()=>{
 await act(async()=>root.render(<><Editor scope="SIM-first" warnOnReload/><Editor scope="SIM-second" warnOnReload/></>));
 await act(async()=>requestNavigation(exit));expect(el.querySelectorAll('[aria-label="Alterações não salvas"]')).toHaveLength(1);
 await act(async()=>button('Descartar alterações').click());expect(exit).not.toHaveBeenCalled();expect(el.querySelectorAll('[aria-label="Alterações não salvas"]')).toHaveLength(1);
 await act(async()=>button('Descartar alterações').click());expect(exit).toHaveBeenCalledTimes(1);
});
