// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {installAppHistory,pushAppHistory,type HistoryTarget} from '../utils/app-history';
import {NAVIGATION_REVIEW_EVENT,type NavigationReview} from '../utils/request-navigation';
class HistoryLab extends EventTarget implements HistoryTarget {
 entries:Array<{state:any;path:string}>=[{state:{foreign:'SIM preserved'},path:'/'}];index=0;jobs:number[]=[];
 history:HistoryTarget['history'];navigation?:HistoryTarget['navigation'];
 constructor(native=false){super();const host=this;this.history={get state(){return host.entries[host.index]!.state;},replaceState(data,_unused,url){host.entries[host.index]={state:data,path:String(url)};},pushState(data,_unused,url){host.entries.splice(host.index+1);host.entries.push({state:data,path:String(url)});host.index++;},go(delta=0){host.jobs.push(delta);}};if(native)this.navigation={get currentEntry(){return {index:host.index};}};}
 get location(){const url=new URL(this.entries[this.index]!.path,'https://lab.invalid');return {pathname:url.pathname,search:url.search,hash:url.hash};}
 get path(){return this.entries[this.index]!.path;}
 flush(){const delta=this.jobs.shift();if(delta===undefined)return;const before=this.path,next=Math.min(this.entries.length-1,Math.max(0,this.index+delta));if(next===this.index)return;this.index=next;this.dispatchEvent(new Event('popstate'));if(new URL(before,'https://lab.invalid').hash!==new URL(this.path,'https://lab.invalid').hash)this.dispatchEvent(new Event('hashchange'));}
 flushAll(){let limit=30;while(this.jobs.length&&limit--)this.flush();expect(this.jobs).toHaveLength(0);}
}
let dispose:(()=>void)|undefined;
afterEach(()=>dispose?.());
function setup(native=false){const host=new HistoryLab(native),changed=vi.fn();dispose=installAppHistory(changed,host);pushAppHistory('/produtos',host);pushAppHistory('/settings',host);let dirty=true,pending:(()=>void)|undefined;const reviewed=vi.fn();host.addEventListener(NAVIGATION_REVIEW_EVENT,event=>{if(dirty)(event as CustomEvent<NavigationReview[]>).detail.push(proceed=>{reviewed();pending=proceed;});});return {host,changed,reviewed,clean:()=>{dirty=false;},keep:()=>{pending=undefined;},discard:()=>{const next=pending;pending=undefined;next?.();}};}
it('restores the original entry before review and preserves both backward and forward history after keeping edits',()=>{
 const lab=setup(),original=lab.host.history.state;lab.host.history.go(-1);lab.host.flush();expect(lab.host.path).toBe('/produtos');expect(lab.changed).not.toHaveBeenCalled();expect(lab.reviewed).not.toHaveBeenCalled();lab.host.flush();expect(lab.host.path).toBe('/settings');expect(lab.reviewed).toHaveBeenCalledOnce();lab.keep();expect(lab.host.entries).toHaveLength(3);expect(lab.host.history.state).toEqual(original);expect(lab.host.entries[0]!.state.foreign).toBe('SIM preserved');
 lab.clean();lab.host.history.go(-1);lab.host.flushAll();expect(lab.host.path).toBe('/produtos');lab.host.history.go(1);lab.host.flushAll();expect(lab.host.path).toBe('/settings');expect(lab.changed).toHaveBeenCalledTimes(2);
});
it('executes a confirmed multi-entry backward traversal once without adding or replacing entries',()=>{
 const lab=setup();const entries=structuredClone(lab.host.entries);lab.host.history.go(-2);lab.host.flushAll();expect(lab.host.path).toBe('/settings');lab.discard();lab.host.flushAll();expect(lab.host.path).toBe('/');expect(lab.changed).toHaveBeenCalledOnce();expect(lab.host.entries).toEqual(entries);
});
it('reviews forward traversal too and suppresses duplicated popstate/hashchange events',()=>{
 const lab=setup();lab.clean();pushAppHistory('/contacts#one',lab.host);lab.host.history.go(-1);lab.host.flushAll();expect(lab.host.path).toBe('/settings');let proceed:(()=>void)|undefined;lab.host.addEventListener(NAVIGATION_REVIEW_EVENT,event=>(event as CustomEvent<NavigationReview[]>).detail.push(next=>{proceed=next;}));const count=lab.changed.mock.calls.length;lab.host.history.go(1);lab.host.flushAll();expect(lab.host.path).toBe('/settings');expect(lab.host.jobs).toHaveLength(0);proceed?.();lab.host.flushAll();expect(lab.host.path).toBe('/contacts#one');expect(lab.changed).toHaveBeenCalledTimes(count+1);
});
it('uses the native navigation index for older same-document entries without an app marker',()=>{
 const host=new HistoryLab(true);host.history.pushState(null,'','/settings');const changed=vi.fn();dispose=installAppHistory(changed,host);let proceed:(()=>void)|undefined;host.addEventListener(NAVIGATION_REVIEW_EVENT,event=>(event as CustomEvent<NavigationReview[]>).detail.push(next=>{proceed=next;}));const original=structuredClone(host.entries);host.history.go(-1);host.flushAll();expect(host.path).toBe('/settings');expect(changed).not.toHaveBeenCalled();proceed?.();host.flushAll();expect(host.path).toBe('/');expect(host.entries).toEqual(original);expect(changed).toHaveBeenCalledOnce();
});
it('invalidates an old history confirmation when an already-reviewed menu navigation takes over',()=>{
 const lab=setup();lab.host.history.go(-1);lab.host.flushAll();const entered=vi.fn();pushAppHistory('/contacts',lab.host,entered);lab.discard();lab.host.flushAll();expect(lab.host.path).toBe('/contacts');expect(entered).toHaveBeenCalledOnce();expect(lab.changed).not.toHaveBeenCalled();
});
it('queues an already-reviewed menu destination while restoration is in flight',()=>{
 const lab=setup();lab.host.history.go(-1);lab.host.flush();const entered=vi.fn();pushAppHistory('/contacts',lab.host,entered);expect(entered).not.toHaveBeenCalled();lab.host.flushAll();expect(lab.host.path).toBe('/contacts');expect(entered).toHaveBeenCalledOnce();expect(lab.changed).not.toHaveBeenCalled();lab.discard();expect(lab.host.jobs).toHaveLength(0);
});
it('queues a menu destination while the confirmed history move is in flight',()=>{
 const lab=setup();lab.host.history.go(-1);lab.host.flushAll();lab.discard();const entered=vi.fn();pushAppHistory('/contacts',lab.host,entered);lab.host.flushAll();expect(lab.host.path).toBe('/contacts');expect(entered).toHaveBeenCalledOnce();expect(lab.changed).not.toHaveBeenCalled();
});
it('coalesces repeated history input while keeping the mounted editor at its original position',()=>{
 const lab=setup();lab.host.history.go(-1);lab.host.history.go(-1);lab.host.flushAll();expect(lab.host.path).toBe('/settings');expect(lab.changed).not.toHaveBeenCalled();lab.discard();lab.host.flushAll();expect(lab.host.path).toBe('/produtos');expect(lab.changed).toHaveBeenCalledOnce();
});
it('does not guess a direction or overwrite an unindexed foreign entry on legacy browsers',()=>{
 const host=new HistoryLab();host.history.pushState(null,'','/settings');const changed=vi.fn();dispose=installAppHistory(changed,host);const entries=structuredClone(host.entries);host.history.go(-1);host.flushAll();expect(host.entries).toEqual(entries);expect(host.path).toBe('/');expect(changed).toHaveBeenCalledOnce();
});
