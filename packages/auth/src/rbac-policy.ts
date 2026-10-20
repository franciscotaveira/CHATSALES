import type { AuthUser, IAuthorizationPolicy, Permission } from "./types";
import {hasWorkspacePermission} from "@sos-sales/contracts";


export class RbacAuthorizationPolicy implements IAuthorizationPolicy {
  public hasPermission(user: AuthUser, permission: Permission): boolean {
    return hasWorkspacePermission(user.role,permission);
  }

  public canAccessWorkspace(user: AuthUser, targetWorkspaceId: string): boolean {
    if (!user.workspaceId || !targetWorkspaceId) return false;
    return user.workspaceId === targetWorkspaceId;
  }
}
