// @vitest-environment happy-dom
import {act,useState} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {SegmentedControl} from '../components/SegmentedControl/SegmentedControl';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,el:HTMLDivElement;const change=vi.fn();const options=[{value:'a',label:'SIM A'},{value:'b',label:'SIM B',disabled:true},{value:'c',label:'SIM C'}];
function View({initial='a'}:{initial?:string}){const [value,setValue]=useState(initial);return <SegmentedControl aria-label="SIM filtros" value={value} options={options} onChange={next=>{change(next);setValue(next);}}/>;}
const radios=()=>Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
async function key(index:number,value:string,composing=false){await act(async()=>radios()[index]!.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,isComposing:composing})));}
beforeEach(()=>{change.mockReset();el=document.createElement('div');document.body.append(el);root=createRoot(el);});afterEach(async()=>{await act(async()=>root.unmount());el.remove();});
it('uses one tab stop and skips disabled options while wrapping with arrows',async()=>{
 await act(async()=>root.render(<View/>));expect(radios().map(r=>r.tabIndex)).toEqual([0,-1,-1]);await key(0,'ArrowRight');expect(change).toHaveBeenLastCalledWith('c');expect(document.activeElement).toBe(radios()[2]);expect(radios()[2]!.getAttribute('aria-checked')).toBe('true');expect(radios().map(r=>r.tabIndex)).toEqual([-1,-1,0]);await key(2,'ArrowRight');expect(document.activeElement).toBe(radios()[0]);await key(0,'ArrowLeft');expect(document.activeElement).toBe(radios()[2]);
});
it('supports Home and End and does not intercept text composition',async()=>{
 await act(async()=>root.render(<View/>));await key(0,'End');expect(document.activeElement).toBe(radios()[2]);await key(2,'Home');expect(document.activeElement).toBe(radios()[0]);const calls=change.mock.calls.length;await key(0,'ArrowRight',true);expect(change).toHaveBeenCalledTimes(calls);expect(radios()[0]!.getAttribute('aria-checked')).toBe('true');
});
it('keeps the first enabled option reachable when no current option is selected',async()=>{
 await act(async()=>root.render(<View initial="missing"/>));expect(radios().map(r=>r.tabIndex)).toEqual([0,-1,-1]);expect(radios().every(r=>r.getAttribute('aria-checked')==='false')).toBe(true);await key(0,'ArrowDown');expect(radios()[2]!.getAttribute('aria-checked')).toBe('true');
});
