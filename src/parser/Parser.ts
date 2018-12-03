import { ChildServiceOptions } from 'src/ChildService';
import { Command, CommandData, CommandDataValue } from 'src/entity/Command';
import { Fragment } from 'src/entity/Fragment';
import { Message } from 'src/entity/Message';
import { Service } from 'src/Service';
import { Context } from 'src/entity/Context';

export interface ParserData {
  emit: CommandData;
  tags: Array<string>;
}

export type ParserOptions<TData extends ParserData> = ChildServiceOptions<TData>;

export type ParserValue = Buffer | string;

/**
 * Parse incoming events into valid commands for the bot to handle.
 */
export interface Parser extends Service {
  /**
   * Check whether this parser can parse an event (has the correct type, tags, etc).
   * @param msg the incoming message to be parsed
   */
  match(msg: Message): Promise<boolean>;

  /**
   * Parse an event into commands.
   */
  parse(msg: Message): Promise<Array<Command>>;

  /**
   * Parse the body of an event into structured data. Binary data should be passed as a buffer or base64-encoded
   * string, text data should be passed as a string.
   *
   * If the MIME type is not one this parser can handle, it should throw.
   *
   * This allows access to the parser's data for use by transforms.
   */
  decode(msg: Message): Promise<any>;

  /**
   * Complete a command from an existing fragment and new value.
   */
  complete(context: Context, fragment: Fragment, value: CommandDataValue): Promise<Array<Command>>;
}
