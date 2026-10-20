import {canAccessPage} from './navigation-access';
import {hasWorkspacePermission,type Permission} from '@sos-sales/contracts';
const contextual:Record<string,Permission>={
 'act-new-broadcast':'cockpit:send_message',
 'act-new-product':'cockpit:access',
 'act-whatsapp-instances':'workspace:manage',
};
export function canUseCommand(id:string,role:string|null|undefined,canCreateCompany:boolean){
 if(id.startsWith('nav-'))return canAccessPage(role,id.slice(4));
 if(id==='act-create-workspace')return canCreateCompany;
 if(Object.hasOwn(contextual,id))return hasWorkspacePermission(role,contextual[id]!);
 return !id.startsWith('act-')||id==='act-sync-session'||id==='act-logout';
}
export function canCreateCompany(workspaces:ReadonlyArray<{role:string}>,activeRole?:string|null){return activeRole==='owner'||workspaces.some(item=>item.role==='owner');}
