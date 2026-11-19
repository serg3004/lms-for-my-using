export { CustomRolesModule } from './custom-roles.module.js';
export { CustomRolesService } from './custom-roles.service.js';
export {
  computeEffectivePermissions,
  diffBuiltInDecisions,
  hasPermission,
  scopeFilter,
} from './effective-permissions.js';
export type { EffectivePermissions, ScopeFilter } from './effective-permissions.js';
