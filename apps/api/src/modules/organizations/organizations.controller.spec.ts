import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from '../auth/auth.guard.js';
import { rolePolicies, rolesMetadataKey } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

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
    const createOrganization = jest.fn((input: typeof createOrganizationInput) => ({
      id: 'organization-id',
      ...input,
    }));
    const controller = new OrganizationsController({
      createOrganization,
    } as unknown as OrganizationsService);

    const result = controller.createOrganization(createOrganizationInput);

    expect(createOrganization).toHaveBeenCalledWith({
      ...createOrganizationInput,
      status: 'active',
      plan: 'trial',
    });
    expect(result).toEqual({
      id: 'organization-id',
      ...createOrganizationInput,
      status: 'active',
      plan: 'trial',
    });
  });
});
