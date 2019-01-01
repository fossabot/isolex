import { isNil, isString } from 'lodash';
import { Inject, MissingValueError } from 'noicejs';

import { BotService } from 'src/BotService';
import { Controller, ControllerData, ControllerOptions } from 'src/controller/Controller';
import { Command } from 'src/entity/Command';
import { Context } from 'src/entity/Context';
import { Message } from 'src/entity/Message';
import { ServiceModule } from 'src/module/ServiceModule';
import { ServiceDefinition } from 'src/Service';
import { Transform, TransformData } from 'src/transform/Transform';
import { getMethods } from 'src/utils';
import { TYPE_JSON, TYPE_TEXT } from 'src/utils/Mime';
import { TemplateScope } from 'src/utils/Template';

import { getHandlerOptions, HandlerOptions } from '.';

export type HandlerMethod = (this: BaseController<ControllerData>, cmd: Command) => Promise<void>;
export type BaseControllerOptions<TData extends ControllerData> = ControllerOptions<TData>;

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

@Inject('services')
export abstract class BaseController<TData extends ControllerData> extends BotService<TData> implements Controller {
  public readonly name: string;

  protected readonly nouns: Set<string>;

  // services
  protected readonly services: ServiceModule;
  protected readonly transforms: Array<Transform>;

  constructor(options: BaseControllerOptions<TData>, schemaPath: string, nouns: Array<string> = []) {
    super(options, schemaPath);

    this.nouns = new Set(nouns);
    this.services = options.services;
    this.transforms = [];
  }

  public async start() {
    await super.start();

    const transforms: Array<ServiceDefinition<TransformData>> = this.data.transforms || [];
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
      if (isNil(options)) {
        continue;
      }

      this.logger.debug({ cmd, options }, 'checking potential handler method');
      if (!this.checkCommand(cmd, options)) {
        continue;
      }

      this.logger.debug({ method: method.name, options }, 'found matching handler method');
      return this.invokeHandler(cmd, options, method as HandlerMethod);
    }

    this.logger.warn({ cmd }, 'no handler method for command');
  }

  protected checkCommand(cmd: Command, options: HandlerOptions): boolean {
    return cmd.noun === options.noun && cmd.verb === options.verb;
  }

  protected async invokeHandler(cmd: Command, options: HandlerOptions, handler: HandlerMethod): Promise<void> {
    if (options.rbac) {
      if (options.rbac.user && !cmd.context.user) {
        return this.errorReply(cmd.context, ErrorReplyType.SessionMissing);
      }

      const grants = [];
      if (Array.isArray(options.rbac.grants)) {
        grants.push(...options.rbac.grants);
      }

      if (options.rbac.defaultGrant) {
        grants.push(`${options.noun}:${options.verb}`);
      }

      if (!cmd.context.checkGrants(grants)) {
        return this.errorReply(cmd.context, ErrorReplyType.GrantMissing);
      }
    }

    try {
      return handler.call(this, cmd);
    } catch (err) {
      this.logger.error(err, 'error during handler method');
      return this.errorReply(cmd.context, ErrorReplyType.Unknown, err.message);
    }
  }

  protected async transform(cmd: Command, type: string, body: TemplateScope): Promise<TemplateScope> {
    if (this.transforms.length === 0) {
      this.logger.debug('controller has no transforms, skipping');
      return body;
    }

    let result = body;
    for (const transform of this.transforms) {
      const check = await transform.check(cmd);
      if (check) {
        this.logger.debug({ transform: transform.name }, 'executing transform');
        result = await transform.transform(cmd, type, result);
      } else {
        this.logger.debug({ transform: transform.name }, 'skipping transform');
      }
    }
    return result;
  }

  protected async transformJSON(cmd: Command, data: TemplateScope): Promise<void> {
    this.logger.debug({ data }, 'transforming json body');

    const body = await this.transform(cmd, TYPE_JSON, data);

    if (isString(body)) {
      return this.reply(cmd.context, body);
    } else {
      this.logger.error({ body }, 'final transform did not return a string');
    }
  }

  protected async errorReply(ctx: Context, errCode: ErrorReplyType, msg?: string): Promise<void> {
    switch (errCode) {
      case ErrorReplyType.GrantMissing:
        return this.reply(ctx, 'permission denied');
      case ErrorReplyType.SessionMissing:
        return this.reply(ctx, 'must be logged in');
      default:
        return this.reply(ctx, `${errCode} error: ${msg}`);
    }
  }

  protected async reply(ctx: Context, body: string): Promise<void> {
    await this.bot.sendMessage(Message.reply(ctx, TYPE_TEXT, body));
  }

  protected getSourceOrFail(ctx: Context) {
    const source = ctx.source;
    if (isNil(source)) {
      throw new MissingValueError('context source must not be nil');
    }
    return source;
  }

  protected getUserOrFail(ctx: Context) {
    const user = ctx.user;
    if (isNil(user)) {
      throw new MissingValueError('context user must not be nil');
    }
    return user;
  }
}
