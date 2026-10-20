/** Poll dependency readiness; process liveness alone never implies a usable system. */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient, ApiError } from "../services/api-client";

export type ConnectivityStatus = "checking" | "connected" | "degraded" | "offline";
export interface ConnectivityState {
  status: ConnectivityStatus;
  dbLatencyMs: number | null;
  redisLatencyMs: number | null;
  lastChecked: Date | null;
  checkNow: () => Promise<void>;
}
const latency=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null;

export function useConnectivity(pollIntervalMs = 15000): ConnectivityState {
  const [status,setStatus]=useState<ConnectivityStatus>("checking");
  const [dbLatencyMs,setDbLatencyMs]=useState<number|null>(null);
  const [redisLatencyMs,setRedisLatencyMs]=useState<number|null>(null);
  const [lastChecked,setLastChecked]=useState<Date|null>(null);
  const mounted=useRef(false),generation=useRef(0),inFlight=useRef<AbortController|null>(null),pending=useRef<Promise<void>|null>(null);
  const checkNow=useCallback(()=>{
    if(!mounted.current)return Promise.resolve();
    if(pending.current)return pending.current;
    const controller=new AbortController(),epoch=generation.current;inFlight.current=controller;
    const current=()=>mounted.current&&generation.current===epoch&&inFlight.current===controller;
    const run=Promise.resolve().then(async()=>{
    try{
      const data=await apiClient.getReady({signal:controller.signal});
      if(!current())return;
      const ready=data.status==="ready"&&data.checks?.database?.healthy===true&&data.checks?.redis?.healthy===true;
      setStatus(ready?"connected":"degraded");
      setDbLatencyMs(ready?latency(data.checks?.database?.latencyMs):null);
      setRedisLatencyMs(ready?latency(data.checks?.redis?.latencyMs):null);
    }catch(error){
      if(!current())return;
      setStatus(error instanceof ApiError?"degraded":"offline");setDbLatencyMs(null);setRedisLatencyMs(null);
    }finally{
      if(current())setLastChecked(new Date());
      if(inFlight.current===controller){inFlight.current=null;pending.current=null;}
    }
    });
    pending.current=run;return run;
  },[]);
  useEffect(()=>{
    mounted.current=true;generation.current++;void checkNow();
    const timer=setInterval(()=>void checkNow(),pollIntervalMs);
    return()=>{mounted.current=false;generation.current++;clearInterval(timer);inFlight.current?.abort();inFlight.current=null;pending.current=null;};
  },[checkNow,pollIntervalMs]);
  return {status,dbLatencyMs,redisLatencyMs,lastChecked,checkNow};
}
