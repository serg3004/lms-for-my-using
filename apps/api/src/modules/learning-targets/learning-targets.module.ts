import { Global, Module } from '@nestjs/common';

import { LearningTargetResolverService } from './learning-target-resolver.service.js';

// @Global(), matching ManagerTeamScopeModule -- ProgressService (and any other consumer)
// constructs LearningTargetResolverService via a default constructor param, but Nest's DI
// still tries to resolve every constructor parameter type by itself and needs to find a
// provider for it somewhere, exactly as it does for ManagerTeamScope.
@Global()
@Module({
  providers: [LearningTargetResolverService],
  exports: [LearningTargetResolverService],
})
export class LearningTargetsModule {}
