export class ApiReadTimeoutError extends Error {
  constructor() { super("A consulta demorou mais que o esperado. Tente consultar novamente."); this.name="ApiReadTimeoutError"; }
}

/** Bound the entire read, including response decoding, without retrying it. */
export async function withReadDeadline<T>(task:(signal:AbortSignal)=>Promise<T>,external?:AbortSignal,timeoutMs=30_000):Promise<T> {
  if(external?.aborted)throw external.reason??new DOMException("Consulta cancelada","AbortError");
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let onAbort:(()=>void)|undefined;
  const stopped=new Promise<never>((_,reject)=>{
    onAbort=()=>{reject(external?.reason??new DOMException("Consulta cancelada","AbortError"));controller.abort(external?.reason);};
    external?.addEventListener("abort",onAbort,{once:true});
    timer=setTimeout(()=>{reject(new ApiReadTimeoutError());controller.abort();},timeoutMs);
  });
  try{return await Promise.race([task(controller.signal),stopped]);}
  finally{if(timer!==undefined)clearTimeout(timer);if(onAbort)external?.removeEventListener("abort",onAbort);}
}
