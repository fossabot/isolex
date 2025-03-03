import { Column } from 'typeorm';

import { DataEntity, DataEntityOptions } from 'src/entity/base/DataEntity';
import { CommandVerb } from 'src/entity/Command';
import { doesExist } from 'src/utils';
import { getHeadOrDefault } from 'src/utils/Map';

export interface BaseCommandOptions extends DataEntityOptions<Array<string>> {
  noun: string;
  verb: CommandVerb;
}

export abstract class BaseCommand extends DataEntity<Array<string>> {
  @Column()
  public noun: string = '';

  @Column()
  public verb: CommandVerb = CommandVerb.Help;

  constructor(options: BaseCommandOptions) {
    super(options);

    if (doesExist(options)) {
      this.noun = options.noun;
      this.verb = options.verb;
    }
  }

  public getHead(key: string): string {
    const value = this.get(key);
    return value[0];
  }

  public getNumber(key: string): number {
    return Number(this.getHead(key));
  }

  public getHeadOrDefault(key: string, defaultValue: string): string {
    return getHeadOrDefault(this.data, key, defaultValue);
  }

  public getHeadOrNumber(key: string, defaultValue: number): number {
    if (this.has(key)) {
      const value = Number(this.get(key));
      if (isNaN(value)) {
        return defaultValue;
      } else {
        return value;
      }
    } else {
      return defaultValue;
    }
  }

  public abstract toJSON(): object;
}
