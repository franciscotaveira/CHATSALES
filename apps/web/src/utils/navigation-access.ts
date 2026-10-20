import {hasWorkspacePermission,type Permission} from '@sos-sales/contracts';
const pages:Record<string,Permission>={cockpit:'cockpit:access',contacts:'cockpit:access',oportunidades:'journey:view',modelos:'cockpit:access',produtos:'cockpit:access',conversoes:'outcome:register',campaigns:'outcome:register'};
/** Settings retains the personal session even without a current company role. */
export function canAccessPage(role:string|null|undefined,page:string){if(page==='settings')return true;return Object.hasOwn(pages,page)&&hasWorkspacePermission(role,pages[page]!);}
