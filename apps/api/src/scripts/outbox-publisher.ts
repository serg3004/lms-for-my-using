import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { OutboxPublisherService, TransactionalOutboxService } from '../modules/transactional-outbox/public.js';

const application = await NestFactory.createApplicationContext(AppModule);
const publisher = application.get(OutboxPublisherService);
const outbox = application.get(TransactionalOutboxService);
const intervalMs = Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? 1_000);
let stopping = false;

const stop = async () => { stopping = true; await application.close(); };
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

while (!stopping) {
  const published = await publisher.publishBatch();
  const lag = await outbox.getLag();
  if (lag.pending > 0) console.info('outbox_lag', lag);
  if (published === 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
