import { ChannelBase, withRetry } from '../channel-base';
import { log, logError, logWarn } from '../../../utils/logger';
import type {
  RemoteMessage,
  RemoteResponse,
  RemoteResponseContent,
  TelegramChannelConfig,
} from '../../types';

type GrammyBot = import('grammy').Bot;
type GrammyContext = import('grammy').Context;
type TelegramUser = Awaited<ReturnType<import('grammy').Api['getMe']>>;

export class TelegramChannel extends ChannelBase {
  readonly type = 'telegram' as const;

  private config: TelegramChannelConfig;
  private bot?: GrammyBot;
  private botInfo?: TelegramUser;

  constructor(config: TelegramChannelConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this._connected) {
      logWarn('[Telegram] Channel already started');
      return;
    }

    if (!this.config.botToken?.trim()) {
      throw new Error('botToken is required for Telegram remote control');
    }

    this.logStatus('Starting channel...');

    try {
      const { Bot } = await import('grammy');
      this.bot = new Bot(this.config.botToken);
      this.botInfo = await this.bot.api.getMe();

      this.bot.on('message:text', async (ctx) => {
        this.handleTextMessage(ctx);
      });

      if (this.config.webhookUrl) {
        await this.bot.api.setWebhook(this.config.webhookUrl);
        this.logStatus('Webhook configured', { webhookUrl: this.config.webhookUrl });
      } else {
        this.bot.start({
          onStart: (botInfo) => {
            log('[Telegram] Long polling started:', botInfo.username);
          },
        });
      }

      this._connected = true;
      this.logStatus('Channel started successfully', {
        username: this.botInfo.username,
        mode: this.config.webhookUrl ? 'webhook' : 'polling',
      });
    } catch (error) {
      logError('[Telegram] Failed to start channel:', error);
      this._connected = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._connected && !this.bot) return;

    this.logStatus('Stopping channel...');

    try {
      if (this.config.webhookUrl) {
        await this.bot?.api.deleteWebhook();
      } else {
        await this.bot?.stop();
      }
    } catch (error) {
      logWarn('[Telegram] Error while stopping channel:', String(error));
    }

    this.bot = undefined;
    this.botInfo = undefined;
    this._connected = false;
    this.logStatus('Channel stopped');
  }

  async send(response: RemoteResponse): Promise<void> {
    if (!this._connected || !this.bot) {
      throw new Error('Channel not connected');
    }

    await withRetry(
      async () => {
        await this.sendMessage(response.channelId, response.content, response.replyTo);
      },
      {
        maxRetries: 3,
        delayMs: 1000,
        onRetry: (attempt, error) => {
          logWarn(`[Telegram] Send retry ${attempt}:`, error.message);
        },
      }
    );
  }

  async handleWebhook(body: string): Promise<{ status: number; data: Record<string, unknown> }> {
    if (!this.bot) {
      return { status: 503, data: { error: 'Telegram bot not initialized' } };
    }

    try {
      const update = JSON.parse(body) as Parameters<GrammyBot['handleUpdate']>[0];
      await this.bot.handleUpdate(update);
      return { status: 200, data: { ok: true } };
    } catch (error) {
      logError('[Telegram] Webhook handling error:', error);
      return { status: 500, data: { error: 'Internal error' } };
    }
  }

  private handleTextMessage(ctx: GrammyContext): void {
    try {
      const message = ctx.message;
      const from = message?.from;
      const chat = message?.chat;
      const rawText = message?.text || '';

      if (!message || !from || !chat || from.is_bot) return;

      const isGroup = chat.type === 'group' || chat.type === 'supergroup';
      const isMentioned = this.isBotMentioned(rawText);
      const text = this.stripBotMention(rawText).trim();

      const remoteMessage: RemoteMessage = {
        id: String(message.message_id),
        channelType: 'telegram',
        channelId: String(chat.id),
        sender: {
          id: String(from.id),
          name: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username,
          isBot: false,
          extra: {
            username: from.username,
            languageCode: from.language_code,
          },
        },
        content: {
          type: 'text',
          text,
        },
        timestamp: message.date * 1000,
        isGroup,
        isMentioned,
        raw: message,
      };

      this.emitMessage(remoteMessage);
    } catch (error) {
      logError('[Telegram] Error processing message:', error);
    }
  }

  private async sendMessage(
    channelId: string,
    content: RemoteResponseContent,
    replyTo?: string
  ): Promise<void> {
    if (!this.bot) throw new Error('Bot not initialized');

    const text = this.responseText(content);
    const chunks = this.splitMessage(text, 3900);
    const replyMessageId = replyTo ? Number(replyTo) : undefined;

    for (const chunk of chunks) {
      await this.bot.api.sendMessage(channelId, chunk, {
        reply_parameters:
          replyMessageId && Number.isFinite(replyMessageId)
            ? { message_id: replyMessageId, allow_sending_without_reply: true }
            : undefined,
      });
      if (chunks.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  private responseText(content: RemoteResponseContent): string {
    switch (content.type) {
      case 'text':
        return content.text || '';
      case 'markdown':
        return content.markdown || '';
      default:
        return content.text || String(content);
    }
  }

  private isBotMentioned(text: string): boolean {
    const username = this.botInfo?.username;
    if (!username) return false;
    return new RegExp(`(^|\\s)@${this.escapeRegExp(username)}\\b`, 'i').test(text);
  }

  private stripBotMention(text: string): string {
    const username = this.botInfo?.username;
    if (!username) return text;
    return text.replace(new RegExp(`(^|\\s)@${this.escapeRegExp(username)}\\b`, 'gi'), ' ').trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
