import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@sos-sales/ui";
import { NAVIGATION_REVIEW_EVENT, type NavigationReview } from "../utils/request-navigation";

export function useDiscardChanges(dirty: boolean, scope: string, resumeFocus?:()=>HTMLElement|null, warnOnReload=false, navigation?:{first?:boolean;beforeProceed?:()=>void}) {
  useEffect(()=>{
    if(!dirty||!warnOnReload)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[dirty,warnOnReload]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const pending = useRef<{scope:string; action:()=>void; returnFocus:HTMLElement|null}|null>(null);
  const pendingFocus=useRef<{scope:string;target:HTMLElement|null}|null>(null);
  const [pendingScope,setPendingScope]=useState<string|null>(null);
  useEffect(()=>{pending.current=null;setPendingScope(null);},[scope]);
  useLayoutEffect(()=>{
    const next=pendingFocus.current;pendingFocus.current=null;
    if(next?.scope===scope&&next.target?.isConnected&&!next.target.matches(':disabled,[inert]'))next.target.focus();
  },[scope,pendingScope]);
  const clear=()=>{pending.current=null;setPendingScope(null);};
  const requestExit = (action:()=>void)=>{
    if(!dirty){clear();action();return;}
    pending.current={scope,action,returnFocus:document.activeElement instanceof HTMLElement?document.activeElement:null};setPendingScope(scope);
  };
  useEffect(()=>{
    if((!dirty&&!navigation?.first)||!warnOnReload)return;
    const review=(event:Event)=>{
      const reviews=(event as CustomEvent<NavigationReview[]>).detail;
      const confirm:NavigationReview=proceed=>requestExit(()=>{navigation?.beforeProceed?.();proceed();});
      if(navigation?.first)reviews.unshift(confirm);else reviews.push(confirm);
    };
    window.addEventListener(NAVIGATION_REVIEW_EVENT,review);
    return()=>window.removeEventListener(NAVIGATION_REVIEW_EVENT,review);
  },[dirty,warnOnReload,scope,navigation?.first,navigation?.beforeProceed]);
  return {
    isPending: pendingScope===scope,
    requestExit,
    keepEditing: ()=>{pendingFocus.current={scope,target:resumeFocus?.()??pending.current?.returnFocus??null};clear();},
    discard: ()=>{const next=pending.current;clear();if(next?.scope===currentScope.current)next.action();},
  };
}

export function UnsavedChangesNotice({onKeep,onDiscard,disabled=false}:{onKeep:()=>void;onDiscard:()=>void;disabled?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  return <div ref={ref} tabIndex={-1} role="alert" aria-label="Alterações não salvas" style={{padding:12,border:"1px solid var(--border-default)",borderRadius:8}}>
    <p>Há alterações não salvas. Continue editando ou descarte essas alterações para sair.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onKeep}>Continuar editando</Button>
      <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onDiscard}>Descartar alterações</Button>
    </div>
  </div>;
}
