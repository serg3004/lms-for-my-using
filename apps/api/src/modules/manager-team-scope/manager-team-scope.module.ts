import { Global, Module } from '@nestjs/common';
import { ManagerTeamScope } from './manager-team-scope.js';

@Global()
@Module({ providers: [ManagerTeamScope], exports: [ManagerTeamScope] })
export class ManagerTeamScopeModule {}
