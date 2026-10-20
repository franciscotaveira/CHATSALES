// @vitest-environment happy-dom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {useConnectivity,type ConnectivityState} from "../hooks/useConnectivity";
import {ApiClient,apiClient,ApiError,NetworkError} from "../services/api-client";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const ready={status:"ready",checks:{database:{healthy:true,latencyMs:12},redis:{healthy:true,latencyMs:2}}};
let root:Root,host:HTMLDivElement,state:ConnectivityState;
function Harness({interval=15000}:{interval?:number}){state=useConnectivity(interval);return createElement("div",null,state.status);}
async function render(interval=15000){await act(async()=>root.render(createElement(Harness,{interval})));}
beforeEach(()=>{vi.useFakeTimers();host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it("does not mask readiness HTTP failure with process liveness",async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"degraded"}),{status:503,headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",fetch);
 await expect(new ApiClient("http://localhost:4400").getReady()).rejects.toMatchObject({status:503});expect(fetch).toHaveBeenCalledTimes(1);
});
it("treats a missing readiness route plus live process as unverified dependencies",async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response("{}",{status:404,headers:{"content-type":"application/json"}})).mockResolvedValueOnce(new Response(JSON.stringify({status:"live"}),{headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",fetch);
 await expect(new ApiClient("http://localhost:4400").getReady()).resolves.toEqual({status:"degraded"});expect(fetch).toHaveBeenCalledTimes(2);
});
it("clears successful latency when a later readiness check fails",async()=>{
 vi.spyOn(apiClient,"getReady").mockResolvedValueOnce(ready).mockRejectedValue(new ApiError(503,"Indisponível","SIM DB down"));await render();expect(state.status).toBe("connected");expect(state.dbLatencyMs).toBe(12);
 await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(state.status).toBe("degraded");expect(state.dbLatencyMs).toBeNull();expect(state.redisLatencyMs).toBeNull();expect(state.lastChecked).toBeInstanceOf(Date);
});
it("requires both dependency confirmations and does not display invalid latency",async()=>{
 vi.spyOn(apiClient,"getReady").mockResolvedValueOnce({status:"ready"}).mockResolvedValue({...ready,checks:{database:{healthy:true,latencyMs:-1},redis:{healthy:true,latencyMs:NaN}}});await render();expect(state.status).toBe("degraded");await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(state.status).toBe("connected");expect(state.dbLatencyMs).toBeNull();expect(state.redisLatencyMs).toBeNull();
});
it("keeps a single check in flight across timer ticks and manual requests",async()=>{
 let resolve!:(value:typeof ready)=>void;const get=vi.spyOn(apiClient,"getReady").mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValue(ready);await render();await act(async()=>vi.advanceTimersByTimeAsync(45000));let finished=false;const joined=state.checkNow();void joined.then(()=>{finished=true;});expect(state.checkNow()).toBe(joined);expect(finished).toBe(false);expect(get).toHaveBeenCalledTimes(1);await act(async()=>{resolve(ready);await joined;});expect(finished).toBe(true);expect(state.status).toBe("connected");await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(get).toHaveBeenCalledTimes(2);
});
it("discards an old check after polling lifecycle changes and aborts transport on unmount",async()=>{
 let resolve!:(value:typeof ready)=>void;const get=vi.spyOn(apiClient,"getReady").mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValue({status:"degraded"});await render();const oldSignal=get.mock.calls[0]![0]!.signal!;await render(20000);expect(oldSignal.aborted).toBe(true);expect(state.status).toBe("degraded");await act(async()=>resolve(ready));expect(state.status).toBe("degraded");
});
it("marks a network failure offline without keeping latency from a previous success",async()=>{
 vi.spyOn(apiClient,"getReady").mockResolvedValueOnce(ready).mockRejectedValue(new NetworkError("SIM offline"));await render();await act(async()=>vi.advanceTimersByTimeAsync(15000));expect(state.status).toBe("offline");expect(state.dbLatencyMs).toBeNull();
});

it("releases the connectivity operation after a synchronous transport failure and permits a fresh retry",async()=>{
 const get=vi.spyOn(apiClient,'getReady').mockImplementationOnce(()=>{throw new Error('SIM synchronous failure');}).mockResolvedValue(ready);await render();expect(state.status).toBe('offline');await act(async()=>state.checkNow());expect(get).toHaveBeenCalledTimes(2);expect(state.status).toBe('connected');
});
