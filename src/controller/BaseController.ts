import { isNil, isString } from 'lodash';
import { Inject, MissingValueError } from 'noicejs';

import { INJECT_SERVICES } from 'src/BaseService';
import { BotService, BotServiceOptions, INJECT_LOCALE } from 'src/BotService';
import { Controller, ControllerData, getHandlerOptions, HandlerOptions } from 'src/controller';
import { User } from 'src/entity/auth/User';
import { Command } from 'src/entity/Command';
import { Context } from 'src/entity/Context';
import { Message } from 'src/entity/Message';
import { Listener } from 'src/listener';
import { Locale, TranslateOptions } from 'src/locale';
import { ServiceModule } from 'src/module/ServiceModule';
import { ServiceDefinition } from 'src/Service';
import { Transform, TransformData } from 'src/transform';
import { applyTransforms } from 'src/transform/helpers';
import { doesExist, getMethods, mustCoalesce, mustExist } from 'src/utils';
import { TYPE_JSON, TYPE_TEXT } from 'src/utils/Mime';
import { TemplateScope } from 'src/utils/Template';

export type HandlerMethod = (this: BaseController<ControllerData>, cmd: Command, ctx: Context) => Promise<void>;
export type BaseControllerOptions<TData extends ControllerData> = BotServiceOptions<TData>;

export enum ErrorReplyType {
  EntityExists = 'entity-exists',
  EntityMissing = 'entity-missing',
  GrantMissing = 'grant-missing',
  InvalidNoun = 'invalid-noun',
  InvalidVerb = 'invalid-verb',
  SessionExists = 'session-exists',
  SessionMissing = 'session-missing',
  Unknown = 'unknown',
}

@Inject(INJECT_LOCALE)
export abstract class BaseController<TData extends ControllerData> extends BotService<TData> implements Controller {
  protected readonly nouns: Set<string>;

  // services
  protected readonly locale: Locale;
  protected readonly services: ServiceModule;
  protected readonly transforms: Array<Transform>;

  constructor(options: BaseControllerOptions<TData>, schemaPath: string, nouns: Array<string> = []) {
    super(options, schemaPath);

    this.locale = mustExist(options[INJECT_LOCALE]);
    this.nouns = new Set(nouns);
    this.services = mustExist(options[INJECT_SERVICES]);
    this.transforms = [];
  }

  public getNouns(): ReadonlyArray<string> {
    return Array.from(this.nouns);
  }

  public async start() {
    await super.start();

    const transforms: Array<ServiceDefinition<TransformData>> = this.data.transforms;
    for (const def of transforms) {
      const transform = await this.services.createService<Transform, TransformData>(def);
      this.transforms.push(transform);
    }
  }

  public async check(cmd: Command): Promise<boolean> {
    this.logger.debug({ controllerId: this.id, noun: cmd.noun, verb: cmd.verb }, 'checking command');

    if (!this.nouns.has(cmd.noun)) {
      this.logger.debug({ noun: cmd.noun }, 'command noun not present');
      return false;
    }

    if (!await this.checkFilters(cmd, this.filters)) {
      this.logger.debug('command failed filters');
      return false;
    }

    this.logger.debug({ cmd }, 'controller can handle command');
    return true;
  }

  public async handle(cmd: Command): Promise<void> {
    this.logger.debug({ cmd }, 'finding handler method for command');

    for (const method of getMethods(this)) {
      const options = getHandlerOptions(method);
      if (doesExist(options) && this.checkCommand(cmd, options)) {
        this.logger.debug({ method: method.name, options }, 'found matching handler method');
        return this.invokeHandler(cmd, options, method as HandlerMethod);
      }
    }

    this.logger.warn({ cmd }, 'no handler method for command');
  }

  protected checkCommand(cmd: Command, options: HandlerOptions): boolean {
    return cmd.noun === options.noun && cmd.verb === options.verb;
  }

  protected async invokeHandler(cmd: Command, options: HandlerOptions, handler: HandlerMethod): Promise<void> {
    const ctx = mustExist(cmd.context);
    if (doesExist(options.rbac)) {
      if (options.rbac.user === true && isNil(ctx.user)) {
        return this.errorReply(ctx, ErrorReplyType.SessionMissing);
      }

      const grants = [];
      if (Array.isArray(options.rbac.grants)) {
        grants.push(...options.rbac.grants);
      }

      if (options.rbac.defaultGrant === true) {
        grants.push(`${options.noun}:${options.verb}`);
      }

      this.logger.debug({ ctx, grants }, 'checking context for handler grants');
      if (!ctx.checkGrants(grants)) {
        return this.errorReply(ctx, ErrorReplyType.GrantMissing);
      }
    }

    try {
      await handler.call(this, cmd, ctx);
    } catch (err) {
      this.logger.error(err, 'error during handler method');
      return this.errorReply(ctx, ErrorReplyType.Unknown, err.message);
    }
  }

  protected async transform(cmd: Command, type: string, body: TemplateScope): Promise<TemplateScope> {
    return applyTransforms(this.transforms, cmd, type, body);
  }

  protected async transformJSON(cmd: Command, data: TemplateScope, ctx?: Context): Promise<void> {
    this.logger.debug({ data }, 'transforming json body');

    const body = await this.transform(cmd, TYPE_JSON, data);

    if (isString(body)) {
      return this.reply(mustCoalesce(ctx, cmd.context), body);
    } else {
      this.logger.error({ body }, 'final transform did not return a string');
    }
  }

  protected async errorReply(ctx: Context, errCode: ErrorReplyType, msg?: string): Promise<void> {
    switch (errCode) {
      case ErrorReplyType.GrantMissing:
        return this.reply(ctx, this.locale.translate('error.grant.missing'));
      case ErrorReplyType.SessionMissing:
        return this.reply(ctx, this.locale.translate('error.session.missing'));
      default:
        return this.reply(ctx, this.locale.translate('error.unknown', {
          code: errCode,
          msg,
        }));
    }
  }

  protected async reply(ctx: Context, body: string): Promise<void> {
    await this.bot.sendMessage(Message.reply(ctx, TYPE_TEXT, body));
  }

  protected getSourceOrFail(ctx: Context): Listener {
    const source = ctx.source;
    if (isNil(source)) {
      throw new MissingValueError('context source must not be nil');
    }
    return source;
  }

  protected getUserOrFail(ctx: Context): User {
    const user = ctx.user;
    if (isNil(user)) {
      throw new MissingValueError('context user must not be nil');
    }
    return user;
  }

  protected translate(ctx: Context, key: string, options: TranslateOptions = {}): string {
    const lngs = this.translateLangs(ctx);
    this.logger.debug({ ctx, key, lngs }, 'translating message');
    return this.locale.translate(`service.${this.kind}.${key}`, {
      ...options,
      lngs,
    });
  }

  protected translateLangs(ctx: Context): Array<string> {
    const langs = [this.bot.getLocale().lang];
    if (doesExist(ctx.user)) {
      langs.unshift(ctx.user.locale.lang);
    }
    return langs;
  }

  protected defaultHelp(cmd: Command): string {
    const ctx = mustExist(cmd.context);
    const data = {
      data: this.data,
    };
    const desc = this.translate(ctx, 'help.desc', data);

    if (cmd.has('topic')) {
      const topic = cmd.getHead('topic');
      const topicDesc = this.translate(ctx, `help.${topic}`, data);
      return `${desc}\n${topicDesc}`;
    }

    return desc;
  }
}
