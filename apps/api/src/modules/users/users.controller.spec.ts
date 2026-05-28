import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from '../auth/auth.guard.js';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard.js';
import { rolePolicies, rolesMetadataKey } from '../auth/roles.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  const createUserInput = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    email: 'new.user@example.com',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  it('requires auth, roles, and organization scope for single user creation', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATAI, UsersController.prototype.createUser);
    const roles = Reflect.getMetadata(rolesMetadataKey, UsersController.prototype.createUser);

    expect(guards).toEqual([AuthGuard, RolesGuard, OrganizationScopeGuard]);
    expect(roles).toEqual(rolePolicies.usersCreate);
  });

  it('creates a user through the guarded controller action', () => {
    const createUser = jest.fn((input: typeof createUserInput) => ({ id: 'user-id', ...input }));
    const controller = new UsersController({ createUser } as unknown as UsersService);

    const result = controller.createUser(createUserInput);

    expect(createUser).toHaveBeenCalledWith({
      ...createUserInput,
      email: 'new.user@example.com',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });
    expect(result).toEqual({
      id: 'user-id',
      ...createUserInput,
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });
  });
});
