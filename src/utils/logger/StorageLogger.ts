import { BaseOptions, Logger, LogLevel, logWithLevel } from 'noicejs';
import { Logger as OrmLogger } from 'typeorm/logger/Logger';

import { classLogger } from 'src/utils/logger';

export interface StorageLoggerOptions extends BaseOptions {
  logger: Logger;
}

export class StorageLogger implements OrmLogger {
  protected logger: Logger;

  constructor(options: StorageLoggerOptions) {
    this.logger = classLogger(options.logger, StorageLogger);
  }

  public log(level: string, message: string) {
    logWithLevel(this.logger, level as LogLevel, {}, message);
  }

  public logMigration(migration: string) {
    this.logger.info({ migration }, 'orm running migration');
  }

  public logQuery(query: string, params?: Array<unknown>) {
    this.logger.debug({ params, query }, 'orm logged query');
  }

  public logQueryError(error: string, query: string, params?: Array<unknown>) {
    this.logger.warn({ error, params, query }, 'orm logged query error');
  }

  public logQuerySlow(time: number, query: string, params?: Array<unknown>) {
    this.logger.warn({ params, query, time }, 'orm logged slow query');
  }

  public logSchemaBuild(schema: string) {
    this.logger.info({ schema }, 'orm building schema');
  }
}
