import yargs from 'yargs-parser';

import { NOUN_FRAGMENT } from 'src/controller/CompletionController';
import { Command, CommandDataValue, CommandVerb } from 'src/entity/Command';
import { Context } from 'src/entity/Context';
import { Fragment } from 'src/entity/Fragment';
import { Message } from 'src/entity/Message';
import { Dict, dictToMap, dictValuesToArrays, mergeMap } from 'src/utils';

import { BaseParser } from './BaseParser';
import { Parser, ParserData, ParserOptions } from './Parser';

export interface ArgsParserData extends ParserData {
  args: {
    array: Array<string>;
    boolean: Array<string>;
    configuration: Partial<yargs.Configuration>;
    count: Array<string>;
    default: Array<string>;
    number: Array<string>;
    required: Array<string>;
    string: Array<string>;
    '--': boolean;
  };
}

export type ArgsParserOptions = ParserOptions<ArgsParserData>;

export class ArgsParser extends BaseParser<ArgsParserData> implements Parser {
  constructor(options: ArgsParserOptions) {
    super(options);
  }

  public async complete(context: Context, fragment: Fragment, value: CommandDataValue): Promise<Array<Command>> {
    const args = await this.decodeBody(value.join(' '));
    const data = mergeMap(fragment.data, dictToMap(args));

    this.logger.debug({ args, fragment, value }, 'completing command fragment');
    return this.emit(context, data);
  }

  public async decode(msg: Message): Promise<Dict<Array<string>>> {
    return this.decodeBody(this.removeTags(msg.body));
  }

  public async parse(msg: Message): Promise<Array<Command>> {
    const data = await this.decode(msg);
    return this.emit(msg.context, dictToMap(data));
  }

  protected async decodeBody(body: string): Promise<Dict<Array<string>>> {
    return dictValuesToArrays<string>(yargs(body, this.data.args));
  }

  protected emit(context: Context, data: Map<string, Array<string>>): Promise<Array<Command>> {
    const missing = this.validate(data);
    if (missing.length) {
      this.logger.debug({ missing }, 'missing required arguments, emitting completion');
      return this.emitCompletion(context, data, missing);
    } else {
      this.logger.debug('required arguments present, emitting command');
      return this.emitCommand(context, data);
    }
  }

  protected validate(data: Map<string, Array<string>>): Array<string> {
    const missing = [];
    for (const req of this.data.args.required) {
      if (!data.has(req)) {
        missing.push(req);
      }
    }
    return missing;
  }

  protected async emitCompletion(context: Context, data: Map<string, Array<string>>, missing: Array<string>): Promise<Array<Command>> {
    await this.bot.execute(Command.create({
      context,
      data: mergeMap(data, dictToMap({
        key: missing,
        msg: [`missing required arguments: ${missing.join(', ')}`],
        noun: [this.data.emit.noun],
        parser: [this.id],
        verb: [this.data.emit.verb],
      })),
      labels: {},
      noun: NOUN_FRAGMENT,
      verb: CommandVerb.Create,
    }));
    return [];
  }

  protected async emitCommand(context: Context, data: Map<string, Array<string>>): Promise<Array<Command>> {
    return [Command.create({
      context,
      data,
      labels: this.data.emit.labels,
      noun: this.data.emit.noun,
      verb: this.data.emit.verb,
    })];
  }
}
