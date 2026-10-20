import { type FC, useEffect, useRef, useState } from "react";
import { Button, EmptyState, LoadingState } from "@sos-sales/ui";
import { MessageSquare } from "lucide-react";
import type { ThreadMessageSummary } from "../../../services/api-client";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ThreadMessageSummary[];
  isLoading: boolean;
  emptyDescription?:string;
  error?:string|null;
  onRetry?:()=>void;
}

export const MessageList: FC<MessageListProps> = ({ messages, isLoading,error,onRetry,emptyDescription }) => {
  const listRef=useRef<HTMLDivElement|null>(null),followLatest=useRef(true),previousLastId=useRef<string|undefined>(undefined);
  const contentRef=useRef<HTMLDivElement|null>(null);
  const hasMessages=messages.length>0;
  const [hasNewMessages,setHasNewMessages]=useState(false);
  const lastId=messages[messages.length-1]?.id;
  const showLatest=()=>{
    followLatest.current=true;setHasNewMessages(false);
    if(listRef.current){listRef.current.scrollTop=listRef.current.scrollHeight;listRef.current.focus({preventScroll:true});}
  };
  useEffect(()=>{
    const list=listRef.current;
    if(!messages.length){followLatest.current=true;setHasNewMessages(false);previousLastId.current=undefined;return;}
    if(list&&followLatest.current){list.scrollTop=list.scrollHeight;setHasNewMessages(false);}
    else if(lastId&&previousLastId.current&&lastId!==previousLastId.current)setHasNewMessages(true);
    previousLastId.current=lastId;
  },[messages.length,lastId]);

  useEffect(()=>{
    const list=listRef.current,content=contentRef.current;
    if(!list||!content||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(()=>{if(followLatest.current&&listRef.current===list)list.scrollTop=list.scrollHeight;});
    observer.observe(content);observer.observe(list);
    return()=>observer.disconnect();
  },[hasMessages]);

  if (isLoading && messages.length === 0) {
    return (
      <div
        style={{
          flex: 1, minHeight:0, overflowY:"auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-surface-subtle)",
        }}
      >
        <LoadingState variant="skeleton" lines={4} />
      </div>
    );
  }

  if(error&&messages.length===0)return <div role="alert" style={{flex:1,minHeight:0,overflowY:"auto",padding:"var(--space-6)",display:"grid",alignContent:"center",gap:12,overflowWrap:"anywhere"}}><h3>Não foi possível consultar as mensagens</h3><p>{error}</p><p>O histórico ainda não foi confirmado. Tente consultar novamente.</p>{onRetry&&<Button variant="secondary" disabled={isLoading} onClick={onRetry}>Consultar mensagens novamente</Button>}</div>;

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1, minHeight:0, overflowY:"auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-surface-subtle)",
          padding: "var(--space-6)",
        }}
      >
        <EmptyState
          icon={<MessageSquare size={48} />}
          title="Nenhuma mensagem nesta conversa"
          description={emptyDescription??"Inicie a conversa enviando uma mensagem ou selecione um modelo aprovado."}
        />
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="log"
      tabIndex={0}
      aria-label="Mensagens da conversa"
      onScroll={()=>{const list=listRef.current;if(!list)return;followLatest.current=list.scrollHeight-list.clientHeight-list.scrollTop<=48;if(followLatest.current)setHasNewMessages(false);}}
      style={{
        flex: 1, minHeight:0, overflowY:"auto",
        backgroundColor: "var(--bg-surface-subtle)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {error&&<div role="alert"><p>{error}</p><p>As mensagens exibidas são da última consulta concluída e podem estar desatualizadas.</p>{onRetry&&<Button variant="secondary" disabled={isLoading} onClick={onRetry}>Consultar mensagens novamente</Button>}</div>}
      <div ref={contentRef} style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
        {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      </div>
      {hasNewMessages&&<Button variant="secondary" onClick={showLatest} style={{position:"sticky",bottom:8,alignSelf:"center",flexShrink:0}}>Ver novas mensagens</Button>}
    </div>
  );
};
