const GUARDS_METADATA = '__guards__';

import { AuthGuard } from '../auth/auth.guard';
import { organizationScopeMetadataKey } from '../auth/organization-scope';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard';
import { rolePolicies, rolesMetadataKey } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { OrganizationsController } from './organizations.controller';
import { CreateOrganizationInput, ThemeSettingsInput } from './organizations.schemas';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsController', () => {
  const createOrganizationInput = {
    name: 'Acme Academy',
    slug: 'acme-academy',
  };

  it('keeps workspace registration public', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizationsController.prototype.registerOrganization);

    expect(guards).toBeUndefined();
  });

  it('requires auth and admin role for direct organization creation', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizationsController.prototype.createOrganization);
    const roles = Reflect.getMetadata(rolesMetadataKey, OrganizationsController.prototype.createOrganization);

    expect(guards).toEqual([AuthGuard, RolesGuard]);
    expect(roles).toEqual(rolePolicies.organizationsCreate);
  });

  it('creates an organization through the guarded controller action', () => {
    const calls: CreateOrganizationInput[] = [];
    const createOrganization = (input: CreateOrganizationInput) => {
      calls.push(input);

      return {
        id: 'organization-id',
        ...input,
      };
    };
    const controller = new OrganizationsController({
      createOrganization,
    } as unknown as OrganizationsService);

    const result = controller.createOrganization(createOrganizationInput);

    expect(calls).toEqual([{
      ...createOrganizationInput,
      status: 'active',
      plan: 'trial',
    }]);
    expect(result).toEqual({
      id: 'organization-id',
      ...createOrganizationInput,
      status: 'active',
      plan: 'trial',
    });
  });

  it('requires auth, organization scope, and admin role to write theme settings', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizationsController.prototype.updateThemeSettings);
    const roles = Reflect.getMetadata(rolesMetadataKey, OrganizationsController.prototype.updateThemeSettings);
    const scope = Reflect.getMetadata(organizationScopeMetadataKey, OrganizationsController.prototype.updateThemeSettings);

    expect(guards).toEqual([AuthGuard, RolesGuard, OrganizationScopeGuard]);
    expect(roles).toEqual(rolePolicies.themeSettingsWrite);
    expect(scope).toEqual({ location: 'param', name: 'id' });
  });

  it('allows any authenticated role in the organization to read theme settings', () => {
    const roles = Reflect.getMetadata(rolesMetadataKey, OrganizationsController.prototype.getThemeSettings);

    expect(roles).toEqual(rolePolicies.themeSettingsRead);
  });

  it('updates theme settings through the guarded controller action', () => {
    const calls: Array<{ organizationId: string; themeSettings: ThemeSettingsInput }> = [];
    const themeSettings: ThemeSettingsInput = {
      colorPrimary: '#4f46e5',
      colorPrimaryHover: '#4338ca',
      colorBackground: '#f5f7fb',
      colorSurface: '#ffffff',
      colorSurfaceMuted: '#f8fafc',
      colorBorder: '#e3e8ef',
      colorText: '#172033',
      colorTextMuted: '#667085',
      shadowCard: '0 8px 24px rgb(23 32 51 / 5%)',
      radiusSm: '6px',
      radiusMd: '11px',
      radiusLg: '18px',
      spacePage: 'clamp(16px, 4vw, 48px)',
      adminSidebarBackground: '#111827',
      adminSidebarText: '#ffffff',
      adminSidebarTextMuted: '#cbd5e1',
      platformName: 'LearnSpace',
    };
    const controller = new OrganizationsController({
      updateThemeSettings: (organizationId: string, input: ThemeSettingsInput) => {
        calls.push({ organizationId, themeSettings: input });

        return { themeSettings: input };
      },
    } as unknown as OrganizationsService);

    const result = controller.updateThemeSettings('organization-id', themeSettings, { currentUser: { id: 'actor-id' } } as never);

    expect(calls).toEqual([{ organizationId: 'organization-id', themeSettings }]);
    expect(result).toEqual({ themeSettings });
  });
});
