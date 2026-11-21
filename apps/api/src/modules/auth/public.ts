export { AuthGuard } from './auth.guard.js';
export type { AuthenticatedRequest } from './auth.guard.js';
export type { CurrentUser } from './auth.schemas.js';
export { OrganizationScope, organizationScopeMetadataKey } from './organization-scope.js';
export { OrganizationScopeGuard } from './organization-scope.guard.js';
export { AuthService } from './auth.service.js';
export { hashPassword } from './passwords.js';
export { loadPasswordPolicy } from './password-policy.js';
export {
  AuthenticatedAccess,
  PublicAccess,
  Roles,
  isLearnerOnly,
  rolePolicies,
  rolesMetadataKey,
} from './roles.js';
export type { UserRole } from './roles.js';
export { RolesGuard } from './roles.guard.js';
export { builtInActionsForRole, builtInRolesFor } from './permission-catalog.adapter.js';
export {
  computeEffectivePermissions,
  diffBuiltInDecisions,
  hasPermission,
  scopeFilter,
} from './effective-permissions.js';
export type { EffectivePermissions, ScopeFilter } from './effective-permissions.js';
export { EffectivePermissionsLookup, loadEffectivePermissions } from './effective-permissions.loader.js';
export { customUserScope, isOrgWideGrant, isOwnOnlyGrant } from './access-scope.js';
