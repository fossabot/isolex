import { Inject } from 'noicejs';
import { Command } from 'src/entity/Command';
import { Context } from 'src/entity/Context';
import { Message } from 'src/entity/Message';
import { Trigger } from 'src/entity/Trigger';
import { BaseHandler } from 'src/handler/BaseHandler';
import { Handler, HandlerConfig, HandlerOptions } from 'src/handler/Handler';
import { ServiceOptions } from 'src/Service';
import { Connection, Repository } from 'typeorm';

export interface LearnHandlerConfig extends HandlerConfig {
  emit: string;
  mode: {
    create: string;
    delete: string;
    execute: string;
  };
}

export interface LearnHandlerOptions extends HandlerOptions<LearnHandlerConfig> {
  storage: Connection;
}

@Inject('storage')
export class LearnHandler extends BaseHandler<LearnHandlerConfig> implements Handler {
  protected storage: Connection;
  protected triggerRepository: Repository<Trigger>;

  constructor(options: LearnHandlerOptions) {
    super(options);

    this.storage = options.storage;
    this.triggerRepository = this.storage.getRepository(Trigger);
  }

  public async handle(cmd: Command): Promise<void> {
    const args: Array<string> = cmd.get('args');
    if (!args) {
      throw new Error('missing args to learn handler');
    }

    const [mode, name, ...body] = args;

    switch (mode) {
      case this.config.mode.create:
        return this.createTrigger(name, body, cmd);
      case this.config.mode.delete:
        return this.deleteTrigger(name, cmd);
      case this.config.mode.execute:
        return this.executeTrigger(name, cmd);
      default:
        throw new Error('unknown learn mode');
    }
  }

  protected async createTrigger(name: string, args: Array<string>, cmd: Command): Promise<void> {
    const trigger = Trigger.create({
      command: Command.create({
        context: cmd.context,
        data: { args },
        name: this.config.emit,
        type: cmd.type
      }),
      name
    });

    this.logger.debug({ args, cmd, name, trigger }, 'learning command');

    if (await this.triggerRepository.findOne(name)) {
      await this.bot.send(Message.create({
        body: `Command already exists: ${name}`,
        context: cmd.context,
        reactions: []
      }));

      return;
    }

    await this.triggerRepository.save(trigger);

    await this.bot.send(Message.create({
      body: `Learned command ${name}.`,
      context: cmd.context,
      reactions: []
    }));
  }

  protected async deleteTrigger(name: string, cmd: Command) {
    const trigger = await this.triggerRepository.findOne(name);

    if (!trigger) {
      await this.bot.send(Message.create({
        body: `Command ${name} does not exist.`,
        context: cmd.context,
        reactions: []
      }));

      return;
    }

    await this.triggerRepository.delete(name);

    await this.bot.send(Message.create({
      body: `Deleted command ${name}.`,
      context: cmd.context,
      reactions: []
    }));
  }

  protected async executeTrigger(name: string, cmd: Command) {
    const trigger = await this.triggerRepository.findOne(name, {
      relations: ['command', 'command.context']
    });

    if (!trigger || !trigger.command) {
      throw new Error('missing trigger or command');
    }

    const emit = Command.create(trigger.command);
    emit.context = Context.create(cmd.context);

    this.logger.debug({ emit, trigger }, 'triggering command');

    await this.bot.handle(emit);
  }
}
