import { Container, Module } from 'noicejs';
import * as sourceMapSupport from 'source-map-support';
import { Bot } from 'src/Bot';
import { loadConfig } from 'src/config';
import { BotModule } from 'src/module/BotModule';
import { ControllerModule } from 'src/module/ControllerModule';
import { FilterModule } from 'src/module/FilterModule';
import { ListenerModule } from 'src/module/ListenerModule';
import { MigrationModule } from 'src/module/MigrationModule';
import { ParserModule } from 'src/module/ParserModule';
import { BunyanLogger } from 'src/utils/BunyanLogger';
import { signal, SIGNAL_STOP } from 'src/utils/Signal';

// webpack environment defines
declare const BUILD_JOB: string;
declare const BUILD_RUNNER: string;
declare const GIT_BRANCH: string;
declare const GIT_COMMIT: string;
declare const NODE_VERSION: string;
declare const RUNNER_VERSION: string;
declare const WEBPACK_VERSION: string;

const VERSION_INFO = {
  build: {
    job: BUILD_JOB,
    runner: BUILD_RUNNER,
  },
  git: {
    branch: GIT_BRANCH,
    commit: GIT_COMMIT,
  },
  version: {
    node: NODE_VERSION,
    runner: RUNNER_VERSION,
    webpack: WEBPACK_VERSION,
  },
};

sourceMapSupport.install({
  environment: 'node',
  handleUncaughtExceptions: true,
  hookRequire: true,
});

const STATUS_SUCCESS = 0;
const STATUS_ERROR = 1;

async function main(): Promise<number> {
  const config = await loadConfig();
  const logger = BunyanLogger.create(config.logger);

  logger.info(VERSION_INFO, 'version info');

  const botModule = new BotModule({ logger });
  const modules: Array<Module> = [
    botModule,
    new FilterModule(),
    new ParserModule(),
    new ListenerModule(),
    new ControllerModule(),
  ];

  if (config.migrate) {
    modules.push(new MigrationModule());
  }

  const ctr = Container.from(...modules);
  await ctr.configure({ logger });

  const bot = await ctr.create<Bot, any>(Bot, { config });
  botModule.setBot(bot);

  await bot.start();
  await signal(SIGNAL_STOP);
  await bot.stop();

  return STATUS_SUCCESS;
}

main().then((status) => process.exit(status)).catch((err) => {
  /* tslint:disable-next-line:no-console */
  console.error('uncaught error during main:', err);
  process.exit(STATUS_ERROR);
});
