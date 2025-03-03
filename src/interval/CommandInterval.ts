import { Command, CommandOptions } from 'src/entity/Command';
import { Context } from 'src/entity/Context';
import { Tick } from 'src/entity/Tick';
import { IntervalData } from 'src/interval';
import { BaseInterval, BaseIntervalOptions } from 'src/interval/BaseInterval';

export interface CommandIntervalData extends IntervalData {
  defaultCommand: CommandOptions;
}

export class CommandInterval extends BaseInterval<CommandIntervalData> {
  constructor(options: BaseIntervalOptions<CommandIntervalData>) {
    super(options, 'isolex#/definitions/service-interval-command');
  }

  public async tick(context: Context, next: Tick, last?: Tick): Promise<number> {
    const cmd = new Command({
      ...this.data.defaultCommand,
      context,
    });
    await this.bot.executeCommand(cmd);
    return 0;
  }
}
