import { Global, Module } from '@nestjs/common';

import { OutboxPublisherService } from './outbox-publisher.service.js';
import { TransactionalOutboxService } from './transactional-outbox.service.js';

@Global()
@Module({
  providers: [TransactionalOutboxService, OutboxPublisherService],
  exports: [TransactionalOutboxService, OutboxPublisherService],
})
export class TransactionalOutboxModule {}
