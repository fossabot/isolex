import { MathJsStatic } from 'mathjs';
import { Inject } from 'noicejs';

import { BaseController } from 'src/controller/BaseController';
import { Controller, ControllerData, ControllerOptions } from 'src/controller/Controller';
import { Command } from 'src/entity/Command';

const DICE_MINIMUM = 1;

export const NOUN_ROLL = 'roll';

export type DiceControllerData = ControllerData;

export type DiceControllerOptions = ControllerOptions<DiceControllerData>;

@Inject('math')
export class DiceController extends BaseController<DiceControllerData> implements Controller {
  protected math: MathJsStatic;

  constructor(options: DiceControllerOptions) {
    super(options, 'isolex#/definitions/service-controller-dice', [NOUN_ROLL]);

    this.math = options.math.create({});
  }

  public async handle(cmd: Command): Promise<void> {
    const args = cmd.data.get('args');
    if (!args || !args.length) {
      return this.reply(cmd.context, 'no arguments were provided!');
    }

    const [count, sides] = args;

    const results: Array<number> = [];
    for (let i = 0; i < Number(count); i++) {
      const rollResult = this.math.randomInt(DICE_MINIMUM, Number(sides));
      results.push(rollResult);
    }

    this.logger.debug({ args }, 'handling dice results');
    const sum = results.reduce((a, b) => a + b, 0);

    return this.reply(cmd.context, `The results of your rolls were: ${results}. The sum is ${sum}.`);
  }
}
