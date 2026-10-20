import {hasWorkspacePermission} from "@sos-sales/contracts";
import type {HistoryImportResult} from "../../settings/HistoryImportDialog";
import { userFacingError } from "../../../utils/user-facing-error";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiClient, type CommercialThreadSummary, type ChannelSummary } from "../../../services/api-client";
import type { UseSessionReturn } from "../../../hooks/useSession";

export type QueueFilter = "open" | "needs_attention" | "all" | "closed";

function validateThreadPage(result: Awaited<ReturnType<typeof apiClient.getThreads>>) {
  const invalid = () => new Error("A consulta retornou conversas ou continuação inválidas. Atualize a fila; os dados anteriores foram preservados.");
  if (!result || !Array.isArray(result.threads)) throw invalid();
  const ids = new Set<string>();
  for (const thread of result.threads) {
    if (!thread || typeof thread !== "object" || typeof thread.id !== "string" || !thread.id.trim() || ids.has(thread.id)
      || typeof thread.contactPhone !== "string" || !thread.contactPhone.trim()
      || (thread.contactName != null && typeof thread.contactName !== "string")
      || !["active", "waiting_client", "waiting_human", "closed"].includes(thread.status)) throw invalid();
    ids.add(thread.id);
    if (thread.lastMessage != null && (typeof thread.lastMessage !== "object"
      || typeof thread.lastMessage.body !== "string"
      || !["inbound", "outbound"].includes(thread.lastMessage.direction))) throw invalid();
    if (thread.handoffReason != null && typeof thread.handoffReason !== "string") throw invalid();
    if (thread.nextAction != null) {
      const action = thread.nextAction;
      if (typeof action !== "object" || Array.isArray(action)
        || typeof action.id !== "string" || !action.id.trim()
        || typeof action.title !== "string" || !action.title.trim()
        || typeof action.status !== "string" || !action.status.trim()
        || (action.dueAt != null && (typeof action.dueAt !== "string" || !Number.isFinite(Date.parse(action.dueAt))))) throw invalid();
    }
  }
  const page = result.pagination;
  if (page !== undefined) {
    if (!page || typeof page !== "object" || typeof page.hasMore !== "boolean") throw invalid();
    const cursor = page.nextCursor;
    if (cursor != null && (typeof cursor !== "object" || typeof cursor.id !== "string" || !cursor.id.trim()
      || typeof cursor.activityAt !== "string" || !Number.isFinite(Date.parse(cursor.activityAt)))) throw invalid();
    if (page.hasMore && !cursor) throw invalid();
  }
}

export const useInbox = (session: UseSessionReturn) => {
  const { token, activeWorkspace } = session;
  const workspaceId = activeWorkspace?.id;
  const role=session.isLoadingMe||session.isLoadingWorkspace||session.error?undefined:activeWorkspace?.role;
  const syncEpoch=useRef(0),syncBusy=useRef(false),syncScope=useRef("");syncScope.current=JSON.stringify([workspaceId,token,role]);
  const [historyReview,setHistoryReview]=useState<ChannelSummary|null>(null),[historyAcknowledged,setHistoryAcknowledged]=useState(false),[historyResult,setHistoryResult]=useState<HistoryImportResult|null>(null),[historyError,setHistoryError]=useState<string|null>(null),[historyRefreshError,setHistoryRefreshError]=useState(false),[channelsLoading,setChannelsLoading]=useState(true);
  const [threads, setThreads] = useState<CommercialThreadSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string | "all">("all");
  const [search,setSearch]=useState("");
  useEffect(()=>{const timer=setTimeout(()=>setSearch(searchQuery.trim().slice(0,200)),300);return()=>clearTimeout(timer);},[searchQuery]);
  type Page={hasMore:boolean;nextCursor:{activityAt:string;id:string}|null};
  const [pagination,setPagination]=useState<Page>({hasMore:false,nextCursor:null}),[isLoadingMoreThreads,setIsLoadingMoreThreads]=useState(false),[isRefreshingThreads,setIsRefreshingThreads]=useState(false);
  const pageRef=useRef<Page>({hasMore:false,nextCursor:null}),threadCache=useRef<CommercialThreadSummary[]>([]);
  const queryKey=JSON.stringify([workspaceId,token,queueFilter,search,selectedChannelId]);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const scopeRef = useRef({ workspaceId, token, queueFilter,queryKey });
  scopeRef.current = { workspaceId, token, queueFilter,queryKey };
  const requestSequence = useRef(0);
  const channelSequence = useRef(0);
  const inFlight=useRef<{key:string;sequence:number}|null>(null);
  const rangeInvalid=useRef(false);
  const [requiresThreadRefresh,setRequiresThreadRefresh]=useState(false);

  useEffect(() => {
    syncEpoch.current++;syncBusy.current=false;setHistoryReview(null);setHistoryAcknowledged(false);setHistoryResult(null);setHistoryError(null);setHistoryRefreshError(false);setChannelsLoading(true);
    setChannels([]); setSearchQuery(""); setSelectedChannelId("all");
    setChannelError(null); setSyncError(null); setSyncNotice(null); setIsSyncing(false);
    if (!workspaceId || !token){setChannelsLoading(false);return;}
    let cancelled = false;
    const sequence=++channelSequence.current;
    apiClient.getChannels(workspaceId, { token }).then(result => {
      if (!cancelled && sequence===channelSequence.current && scopeRef.current.workspaceId === workspaceId && scopeRef.current.token === token) setChannels(result.channels);
    }).catch(error => {
      if (!cancelled && sequence===channelSequence.current) setChannelError(userFacingError(error,"Não foi possível consultar os canais."));
    }).finally(()=>{if(!cancelled&&sequence===channelSequence.current)setChannelsLoading(false);});
    return () => { cancelled = true;syncEpoch.current++; };
  }, [workspaceId, token,role]);

  const loadThreads = useCallback(async (showLoading = false,append=false,propagateError=false) => {
    if (!workspaceId || !token || append&&(!pageRef.current.nextCursor||rangeInvalid.current)) return;
    if(inFlight.current?.key===queryKey&&(!showLoading||append))return;
    const sequence=++requestSequence.current;inFlight.current={key:queryKey,sequence};
    const isCurrent=()=>sequence===requestSequence.current&&scopeRef.current.queryKey===queryKey;
    if(showLoading)setIsLoadingThreads(true);setIsRefreshingThreads(true);if(append)setIsLoadingMoreThreads(true);
    try{
      let items=append?[...threadCache.current]:[],cursor=append?pageRef.current.nextCursor:null;
      const refreshRange=!append&&threadCache.current.length>0;
      const target=append?items.length+50:Math.max(50,threadCache.current.length),seen=new Set<string>(cursor?[JSON.stringify(cursor)]:[]);let page:Page={hasMore:false,nextCursor:null};
      const maxPages=Math.ceil(target/50)+1;let queriedPages=0;
      do{
        if(++queriedPages>maxPages)throw new Error('A atualização não conseguiu conferir o alcance da fila dentro do limite de páginas. As conversas anteriores foram preservadas; atualize antes de continuar.');
        const result=await apiClient.getThreads(workspaceId,{status:queueFilter==='open'?'open':queueFilter==='closed'?'closed':undefined,needsAttention:queueFilter==='needs_attention'?true:undefined,limit:50,search:search||undefined,channelInstanceId:selectedChannelId==='all'?undefined:selectedChannelId,...(cursor?{beforeActivityAt:cursor.activityAt,beforeId:cursor.id}:{})},{token});
        if(!isCurrent())return;
        validateThreadPage(result);
        items=Array.from(new Map([...items,...result.threads].map(thread=>[thread.id,thread])).values());page=result.pagination??{hasMore:false,nextCursor:null};
        if(page.hasMore){if(!page.nextCursor||!result.threads.length||seen.has(JSON.stringify(page.nextCursor)))throw new Error('A consulta não retornou uma continuação válida. Atualize a fila.');seen.add(JSON.stringify(page.nextCursor));}
        cursor=page.nextCursor;
      }while(refreshRange&&page.hasMore&&items.length<target);
      if(isCurrent()){threadCache.current=items;pageRef.current=page;setThreads(items);setPagination(page);setThreadsError(null);if(!append){rangeInvalid.current=false;setRequiresThreadRefresh(false);}}
    }catch(error){if(isCurrent()){if(!append){rangeInvalid.current=true;setRequiresThreadRefresh(true);}setThreadsError(userFacingError(error,'Não foi possível atualizar a fila. As conversas já consultadas foram preservadas.'));if(propagateError)throw error;}}
    finally{if(inFlight.current?.sequence===sequence)inFlight.current=null;if(isCurrent()){setIsLoadingThreads(false);setIsLoadingMoreThreads(false);setIsRefreshingThreads(false);}}
  },[workspaceId,token,queueFilter,queryKey,search,selectedChannelId]);

  useEffect(()=>{
    rangeInvalid.current=false;setRequiresThreadRefresh(false);threadCache.current=[];pageRef.current={hasMore:false,nextCursor:null};setThreads([]);setPagination(pageRef.current);setThreadsError(null);setIsLoadingMoreThreads(false);setIsRefreshingThreads(false);
    if(!workspaceId||!token){setIsLoadingThreads(false);return;}
    void loadThreads(true);const interval=setInterval(()=>{void loadThreads();},3500);
    return()=>{clearInterval(interval);++requestSequence.current;};
  },[loadThreads,workspaceId,token]);
  const filteredThreads=threads;
  const loadMoreThreads=useCallback(()=>loadThreads(false,true),[loadThreads]);

  const activeChannel = useMemo(() => selectedChannelId === "all"
    ? channels.find(channel => channel.status === "connected") || channels[0] || null
    : channels.find(channel => channel.id === selectedChannelId) || null, [channels, selectedChannelId]);

  const latestLoad=useRef(loadThreads);latestLoad.current=loadThreads;
  const historyImportAvailable=Boolean(!channelsLoading&&!channelError&&hasWorkspacePermission(role,"cockpit:access")&&activeChannel?.provider==="waha"&&activeChannel.isActive&&activeChannel.status==="connected");
  const syncActiveChannel=useCallback(async(channelId?:string)=>{
    if(!workspaceId||!token||syncBusy.current||channelsLoading||channelError||!hasWorkspacePermission(role,"cockpit:access"))return;
    const target=channelId||(selectedChannelId!=="all"?selectedChannelId:activeChannel?.id);
    setSyncError(null);setSyncNotice(null);
    const channel=channels.find(row=>row.id===target);
    if(!channel||channel.provider!=="waha"||!channel.isActive||channel.status!=="connected"){setSyncError("Conecte um canal WAHA ativo em Configurações e selecione-o antes de importar o histórico.");return;}
    setHistoryAcknowledged(false);setHistoryResult(null);setHistoryError(null);setHistoryRefreshError(false);setHistoryReview(channel);
  },[workspaceId,token,role,channelsLoading,channelError,selectedChannelId,activeChannel,channels]);
  const confirmHistoryImport=async()=>{
    if(!workspaceId||!token||!historyReview||!historyAcknowledged||historyResult||historyError||syncBusy.current||channelsLoading||channelError||!hasWorkspacePermission(role,"cockpit:access"))return;
    const channel=channels.find(row=>row.id===historyReview.id);
    if(!channel||channel.provider!=="waha"||!channel.isActive||channel.status!=="connected"||channel.revision!==historyReview.revision){setHistoryReview(null);setSyncError("O canal mudou. Consulte os canais e revise novamente; a importação não foi iniciada.");return;}
    const requestedScope=syncScope.current,epoch=syncEpoch.current;
    const current=()=>requestedScope===syncScope.current&&epoch===syncEpoch.current;
    syncBusy.current=true;setIsSyncing(true);
    try{
      const result=await apiClient.syncChannelChats(workspaceId,channel.id,{token,signal:AbortSignal.timeout(60000)});
      if(!current())return;setHistoryResult(result);
      if(!result.success){setHistoryError(result.message||"O servidor não confirmou a importação.");return;}
      try{await latestLoad.current(true,false,true);}catch{if(current())setHistoryRefreshError(true);}
    }catch(error){if(current())setHistoryError(userFacingError(error,"Não foi possível confirmar a importação."));}
    finally{if(current()){syncBusy.current=false;setIsSyncing(false);}}
  };
  const closeHistoryImport=()=>{if(!syncBusy.current)setHistoryReview(null);};

  const refreshThreads = useCallback(() => loadThreads(true), [loadThreads]);
  const retry = useCallback(async()=>{
    if(!workspaceId || !token)return;
    const sequence=++channelSequence.current;setChannelsLoading(true);
    await Promise.all([loadThreads(true),apiClient.getChannels(workspaceId,{token}).then(result=>{
      if(sequence===channelSequence.current && scopeRef.current.workspaceId===workspaceId && scopeRef.current.token===token){setChannels(result.channels);setChannelError(null);setSyncError(null);}
    }).catch(error=>{
      if(sequence===channelSequence.current && scopeRef.current.workspaceId===workspaceId && scopeRef.current.token===token)setChannelError(userFacingError(error,"Não foi possível consultar os canais."));
    }).finally(()=>{if(sequence===channelSequence.current)setChannelsLoading(false);})]);
  },[workspaceId,token,syncError,threadsError,channelError,syncActiveChannel,loadThreads]);
  return {
    historyImportAvailable,historyReview,historyAcknowledged,setHistoryAcknowledged,historyResult,historyError,historyRefreshError,confirmHistoryImport,closeHistoryImport,
    channelsLoading,channelError,requiresThreadRefresh,pagination,isLoadingMoreThreads,isRefreshingThreads,loadMoreThreads,
    threads, filteredThreads, channels, activeChannel, selectedChannelId, setSelectedChannelId,
    isLoadingThreads:isLoadingThreads||searchQuery.trim().slice(0,200)!==search, isSyncing, syncActiveChannel, queueFilter, setQueueFilter, searchQuery, setSearchQuery, refreshThreads,
    retry,
    error: threadsError || channelError || syncError,
    notice: syncNotice,
  };
};
