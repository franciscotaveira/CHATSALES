import {it,expect} from 'vitest';
import {hasWorkspacePermission} from '../permissions';
it('grants configuration management only to owner and admin',()=>{
 for(const role of ['owner','admin'])for(const permission of ['workspace:manage','workspace:invite','integration:manage'] as const)expect(hasWorkspacePermission(role,permission)).toBe(true);
 for(const role of ['manager','operator','analyst','integration_service','support_auditor'])for(const permission of ['workspace:manage','workspace:invite','integration:manage'] as const)expect(hasWorkspacePermission(role,permission)).toBe(false);
});
it('preserves reading and operation boundaries across human and integration profiles',()=>{
 expect(hasWorkspacePermission('manager','integration:view')).toBe(true);expect(hasWorkspacePermission('operator','cockpit:access')).toBe(true);expect(hasWorkspacePermission('operator','workspace:view')).toBe(false);expect(hasWorkspacePermission('analyst','workspace:view')).toBe(true);expect(hasWorkspacePermission('analyst','cockpit:access')).toBe(false);expect(hasWorkspacePermission('integration_service','integration:suggestions:create')).toBe(true);expect(hasWorkspacePermission('support_auditor','audit:view')).toBe(true);
});
it('fails closed for missing, unknown and prototype-property role names',()=>{
 for(const role of [null,undefined,'','__proto__','constructor','toString','OWNER','owner '])expect(hasWorkspacePermission(role,'workspace:manage')).toBe(false);
});
