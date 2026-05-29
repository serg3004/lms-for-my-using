import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from '../auth/auth.guard';
import { OrganizationScopeGuard } from '../auth/organization-scope.guard';
import { rolePolicies, rolesMetadataKey } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { UsersController } from './users.controller';
import { CreateUserInput } from './users.schemas';
import { UsersService } from './users.service';

describe('UsersController', () => {
  const createUserInput = {
    organizationId: '11111111-1111-1111-1111-111111111111',
    email: 'new.user@example.com',
    password: 'password123',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  it('requires auth, roles, and organization scope for single user creation', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.createUser);
    const roles = Reflect.getMetadata(rolesMetadataKey, UsersController.prototype.createUser);

    expect(guards).toEqual([AuthGuard, RolesGuard, OrganizationScopeGuard]);
    expect(roles).toEqual(rolePolicies.usersCreate);
  });

  it('creates a user through the guarded controller action', () => {
    const calls: CreateUserInput[] = [];
    const createUser = (input: CreateUserInput) => {
      calls.push(input);

      return { id: 'user-id', ...input };
    };
    const controller = new UsersController({ createUser } as unknown as UsersService);

    const result = controller.createUser(createUserInput);

    expect(calls).toEqual([{
      ...createUserInput,
      email: 'new.user@example.com',
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    }]);
    expect(result).toEqual({
      id: 'user-id',
      ...createUserInput,
      status: 'active',
      locale: 'ru',
      timezone: 'Asia/Almaty',
    });
  });
});
