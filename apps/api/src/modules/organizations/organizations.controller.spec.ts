const GUARDS_METADATA = '__guards__';

import { AuthGuard } from '../auth/auth.guard';
import { rolePolicies, rolesMetadataKey } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { OrganizationsController } from './organizations.controller';
import { CreateOrganizationInput } from './organizations.schemas';
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
});
