import { MathJsStatic } from 'mathjs';
import { Inject } from 'noicejs';

import { INJECT_MATH } from 'src/BaseService';
import { CheckRBAC, Controller, ControllerData, Handler } from 'src/controller';
import { BaseController, BaseControllerOptions } from 'src/controller/BaseController';
import { Command, CommandVerb } from 'src/entity/Command';
import { Context } from 'src/entity/Context';
import { mustExist } from 'src/utils';
import { formatResult, ResultFormatOptions } from 'src/utils/Math';

export const NOUN_MATH = 'math';

export interface MathControllerData extends ControllerData {
  format: ResultFormatOptions;
  math: {
    matrix: string;
    number: string;
  };
}

@Inject(INJECT_MATH)
export class MathController extends BaseController<MathControllerData> implements Controller {
  protected math: MathJsStatic;

  constructor(options: BaseControllerOptions<MathControllerData>) {
    super(options, 'isolex#/definitions/service-controller-math', [NOUN_MATH]);

    this.math = mustExist(options[INJECT_MATH]).create(options.data.math);
  }

  @Handler(NOUN_MATH, CommandVerb.Create)
  @CheckRBAC()
  public async createMath(cmd: Command, ctx: Context): Promise<void> {
    this.logger.debug({ cmd }, 'calculating command');

    const inputExpr = cmd.get('expr');
    if (inputExpr.length === 0) {
      return this.reply(ctx, 'no expression given');
    }

    const expr = inputExpr.join(';\n');
    this.logger.debug({ expr }, 'evaluating expression');

    const body = '`' + this.solve(ctx, expr, { cmd }) + '`';
    return this.reply(ctx, body);
  }

  @Handler(NOUN_MATH, CommandVerb.Help)
  public async getHelp(cmd: Command, ctx: Context): Promise<void> {
    return this.reply(ctx, this.defaultHelp(cmd));
  }

  protected solve(ctx: Context, expr: string, scope: object): string {
    try {
      const body = this.math.eval(expr, scope);
      this.logger.debug({ body, expr }, 'evaluated expression');

      return formatResult(body, scope, this.data.format);
    } catch (err) {
      return this.translate(ctx, 'create.error', {
        msg: err.message,
      });
    }
  }
}
