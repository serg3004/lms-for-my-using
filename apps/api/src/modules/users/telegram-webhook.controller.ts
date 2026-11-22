import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';

import { isTelegramWebhookAuthentic } from '../../common/telegram/telegram.js';
import { PublicAccess } from '../auth/public.js';
import { TelegramDeliveryService } from './telegram-delivery.service.js';

/** PR 503: Telegram calls this when someone writes to the bot; only the secret header proves it is Telegram. */
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly delivery: TelegramDeliveryService) {}

  @Post('webhook')
  @PublicAccess()
  @HttpCode(200)
  async receive(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() body: unknown) {
    if (!isTelegramWebhookAuthentic(secret)) throw new ForbiddenException();
    await this.delivery.handleUpdate(body);
    return { ok: true };
  }
}
