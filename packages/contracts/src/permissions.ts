import type {Role} from "./workspace";

export type Permission =
  | "workspace:view"
  | "workspace:manage"
  | "workspace:invite"
  | "cockpit:access"
  | "cockpit:send_message"
  | "cockpit:handoff"
  | "journey:view"
  | "journey:transition_stage"
  | "outcome:register"
  | "integration:view"
  | "integration:manage"
  | "integration:candidates:read"
  | "integration:suggestions:create"
  | "integration:suggestions:manage"
  | "capi:dispatch"
  | "audit:view";


const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set([
    "workspace:view",
    "workspace:manage",
    "workspace:invite",
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:view",
    "integration:manage",
    "integration:suggestions:manage",
    "capi:dispatch",
    "audit:view",
  ]),
  admin: new Set([
    "workspace:view",
    "workspace:manage",
    "workspace:invite",
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:view",
    "integration:manage",
    "integration:suggestions:manage",
    "capi:dispatch",
    "audit:view",
  ]),
  manager: new Set([
    "workspace:view",
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:view",
    "integration:suggestions:manage",
    "audit:view",
  ]),
  operator: new Set([
    "cockpit:access",
    "cockpit:send_message",
    "cockpit:handoff",
    "journey:view",
    "journey:transition_stage",
    "outcome:register",
    "integration:suggestions:manage",
  ]),
  analyst: new Set([
    "workspace:view",
    "journey:view",
    "integration:view",
    "audit:view",
  ]),
  integration_service: new Set([
    "journey:view",
    "integration:candidates:read",
    "integration:suggestions:create",
  ]),
  support_auditor: new Set([
    "workspace:view",
    "audit:view",
  ]),
};


export function hasWorkspacePermission(role:string|null|undefined,permission:Permission):boolean {
  if(!role||!Object.hasOwn(ROLE_PERMISSIONS,role))return false;
  return ROLE_PERMISSIONS[role as Role].has(permission);
}
