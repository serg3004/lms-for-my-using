import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LibraryFoldersController } from './library-folders.controller.js';
import { LibraryFoldersService } from './library-folders.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [LibraryFoldersController],
  providers: [LibraryFoldersService],
})
export class LibraryFoldersModule {}
