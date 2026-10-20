import {collectNavigationReviews,requestNavigation} from "./request-navigation";

const ENTRY_KEY="__chatSalesEntry";
const PUSH_EVENT="chat-sales:history-pushed";
type EntryPosition={session:string;index:number};
export interface HistoryTarget extends EventTarget {
 history:Pick<History,"state"|"pushState"|"replaceState"|"go">;
 location:Pick<Location,"pathname"|"search"|"hash">;
 navigation?:{currentEntry?:{index:number}|null};
}
type Entry={path:string;position:EntryPosition|null;nativeIndex:number|null};
type Push=(path:string,after?:()=>void)=>void;
const controllers=new WeakMap<HistoryTarget,Push>();
function position(target:HistoryTarget):EntryPosition|null {
 const value=target.history.state?.[ENTRY_KEY];
 return value&&typeof value.session==="string"&&Number.isSafeInteger(value.index)&&value.index>=0?value:null;
}
function path(target:HistoryTarget){return target.location.pathname+target.location.search+target.location.hash;}
function snapshot(target:HistoryTarget):Entry {
 const index=target.navigation?.currentEntry?.index;
 return {path:path(target),position:position(target),nativeIndex:typeof index==="number"&&index>=0?index:null};
}
function ensurePosition(target:HistoryTarget){
 const existing=position(target);if(existing)return existing;
 const next={session:crypto.randomUUID(),index:0};
 const state=target.history.state;
 target.history.replaceState({...(state&&typeof state==="object"?state:{}),[ENTRY_KEY]:next},"",path(target));
 return next;
}
function pushRaw(nextPath:string,target:HistoryTarget){
 const previous=ensurePosition(target);
 target.history.pushState({[ENTRY_KEY]:{session:previous.session,index:previous.index+1}},"",nextPath);
 target.dispatchEvent(new Event(PUSH_EVENT));
}
export function pushAppHistory(nextPath:string,target:HistoryTarget=window,after?:()=>void){
 const controller=controllers.get(target);
 if(controller){controller(nextPath,after);return;}
 pushRaw(nextPath,target);after?.();
}
function distance(from:Entry,to:Entry):number|null {
 if(from.position&&to.position&&from.position.session===to.position.session&&from.position.index!==to.position.index)return to.position.index-from.position.index;
 if(from.nativeIndex!==null&&to.nativeIndex!==null)return to.nativeIndex-from.nativeIndex;
 return from.position&&to.position&&from.position.session===to.position.session?0:null;
}
function sameEntry(a:Entry,b:Entry){return a.path===b.path&&distance(a,b)===0;}

/** Keep the mounted editor while a managed history traversal is reviewed.
 * Native entry indexes also cover same-document entries made before our marker.
 * A foreign entry without either index cannot be safely reversed with History API.
 */
export function installAppHistory(onLocation:()=>void,target:HistoryTarget=window){
 ensurePosition(target);
 let current=snapshot(target),ticket=0,disposed=false;
 let restoring:{origin:Entry;destination:Entry;ticket:number;lastObserved:Entry}|null=null;
 let queuedPush:{path:string;after?:()=>void}|null=null;
 let permitted:Entry|null=null;
 const flushPush=()=>{const next=queuedPush;queuedPush=null;if(next){pushRaw(next.path,target);next.after?.();}};
 const push:Push=(nextPath,after)=>{
  if(disposed)return;
  if(restoring||permitted){ticket++;queuedPush={path:nextPath,after};return;}
  pushRaw(nextPath,target);after?.();
 };
 const pushed=()=>{ticket++;restoring=null;permitted=null;current=snapshot(target);};
 const moved=()=>{
  if(disposed)return;
  const actual=snapshot(target);
  if(restoring){
   const pending=restoring;
   if(sameEntry(actual,pending.lastObserved))return;
   pending.lastObserved=actual;
   const remaining=distance(actual,pending.origin);
   if(!sameEntry(actual,pending.origin)){
    if(remaining!==null&&remaining!==0)target.history.go(remaining);
    return;
   }
   restoring=null;
   if(queuedPush){flushPush();return;}
   const delta=distance(pending.origin,pending.destination);
   requestNavigation(()=>{
    if(disposed||ticket!==pending.ticket||!sameEntry(snapshot(target),pending.origin)||delta===null)return;
    permitted=pending.destination;target.history.go(delta);
   },collectNavigationReviews(target));
   return;
  }
  if(sameEntry(actual,current))return;
  if(permitted&&sameEntry(actual,permitted)){
   permitted=null;current=actual;ticket++;if(queuedPush)flushPush();else onLocation();return;
  }
  permitted=null;
  const delta=distance(current,actual),reviews=collectNavigationReviews(target);
  if(reviews.length&&delta!==null&&delta!==0){
   restoring={origin:current,destination:actual,ticket:++ticket,lastObserved:actual};
   target.history.go(-delta);
   return;
  }
  // Unknown legacy positions are never guessed or overwritten to conceal a traversal.
  current=actual;ticket++;onLocation();
 };
 controllers.set(target,push);
 target.addEventListener(PUSH_EVENT,pushed);
 target.addEventListener("popstate",moved);
 target.addEventListener("hashchange",moved);
 return ()=>{disposed=true;ticket++;if(controllers.get(target)===push)controllers.delete(target);target.removeEventListener(PUSH_EVENT,pushed);target.removeEventListener("popstate",moved);target.removeEventListener("hashchange",moved);};
}
