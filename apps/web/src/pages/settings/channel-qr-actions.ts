import type { WahaConnectionState, WahaConnectionAction } from "../../services/api-client";

export type QrReviewAction=WahaConnectionAction|"activate"|"review";
type ObservedConnection=WahaConnectionState&{pollingPaused?:boolean;isLoading?:boolean;isRefreshing?:boolean;isActing?:boolean};

/** A retained revision is not proof that the latest consultation succeeded. */
export function canReviewQrAction(state:ObservedConnection|undefined,action:QrReviewAction):boolean{
 if(!state?.success||state.isSimulated||!state.revision||state.error||state.pollingPaused||state.isLoading||state.isRefreshing||state.isActing)return false;
 if(action==="review")return state.operation?.state==="uncertain"&&Boolean(state.operation.id);
 if(state.operation)return false;
 if(action==="create")return state.status==="NOT_FOUND"&&state.canCreate===true;
 if(action==="start")return ["STOPPED","FAILED"].includes(state.status??"");
 if(action==="activate")return state.requiresConfirmation===true&&Boolean(state.verifiedPhoneNumber);
 return Boolean(state.status)&&state.status!=="NOT_FOUND";
}
