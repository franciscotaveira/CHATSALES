import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {ApiClient} from "../services/api-client";
import {ApiReadTimeoutError,withReadDeadline} from "../services/read-deadline";
import {userFacingError} from "../utils/user-facing-error";
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it("ends a hanging read and aborts its transport without retry",async()=>{
 let signal:AbortSignal|undefined;const fetch=vi.fn((_url:RequestInfo|URL,init?:RequestInit)=>{signal=init?.signal??undefined;return new Promise<Response>(()=>{});});vi.stubGlobal("fetch",fetch);
 const client=new ApiClient("http://localhost:4400");const result=client.getChannels("SIM-workspace").catch(error=>error);
 await vi.advanceTimersByTimeAsync(30_000);const error=await result;expect(error).toBeInstanceOf(ApiReadTimeoutError);expect(signal?.aborted).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);expect(userFacingError(error,"fallback")).toContain("Tente consultar novamente");expect(vi.getTimerCount()).toBe(0);
});
it("also bounds a stalled JSON body after headers have arrived",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,headers:new Headers({"content-type":"application/json"}),json:()=>new Promise(()=>{})}));
 const result=new ApiClient("http://localhost:4400").getChannels("SIM-workspace").catch(error=>error);await vi.advanceTimersByTimeAsync(30_000);expect(await result).toBeInstanceOf(ApiReadTimeoutError);
});
it("preserves caller cancellation and does not start an already cancelled read",async()=>{
 const controller=new AbortController();const task=vi.fn((_signal:AbortSignal)=>new Promise<never>(()=>{}));const result=withReadDeadline(task,controller.signal).catch(error=>error);controller.abort();expect((await result).name).toBe("AbortError");expect(task.mock.calls[0]![0].aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
 const stopped=vi.fn();await expect(withReadDeadline(stopped,controller.signal)).rejects.toHaveProperty("name","AbortError");expect(stopped).not.toHaveBeenCalled();
});
it("cleans its timer after success and ignores a late result after expiration",async()=>{
 await expect(withReadDeadline(async()=>({value:"SIM"}))).resolves.toEqual({value:"SIM"});expect(vi.getTimerCount()).toBe(0);
 let resolve!:(value:string)=>void;const result=withReadDeadline(()=>new Promise<string>(done=>{resolve=done;}),undefined,50).catch(error=>error);await vi.advanceTimersByTimeAsync(50);expect(await result).toBeInstanceOf(ApiReadTimeoutError);resolve("late");await Promise.resolve();expect(await result).toBeInstanceOf(ApiReadTimeoutError);
});
it("does not impose the read deadline on mutations or repeat a write",async()=>{
 let resolve!:(response:Response)=>void;const fetch=vi.fn(()=>new Promise<Response>(done=>{resolve=done;}));vi.stubGlobal("fetch",fetch);
 const request=new ApiClient("http://localhost:4400").updateContact("SIM-ws","SIM-contact",{name:"SIM name"});await vi.advanceTimersByTimeAsync(31_000);expect(vi.getTimerCount()).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);resolve(new Response(JSON.stringify({contact:{id:"SIM-contact"}}),{headers:{"content-type":"application/json"}}));await expect(request).resolves.toMatchObject({contact:{id:"SIM-contact"}});
});
