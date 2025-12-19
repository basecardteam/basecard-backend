import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class CustomLogger extends ConsoleLogger {
  constructor() {
    super();
    // Disable timestamp
    this.setContext('');
  }

  protected formatPid(pid: number): string {
    return ''; // Hide PID
  }

  protected getTimestamp(): string {
    return ''; // Hide Timestamp
  }

  protected formatMessage(
    logLevel: any,
    message: any,
    pidMessage: any,
    formattedTimestamp: any,
    contextMessage: any,
    timestampDiff: any,
  ): string {
    const output = super.formatMessage(
      logLevel,
      message,
      pidMessage,
      formattedTimestamp,
      contextMessage,
      timestampDiff,
    );
    return output.replace(/^\s+/, '');
  }

  log(message: any, context?: string) {
    const caller = this.getCaller();
    const meta = context
      ? caller
        ? `${context}] [${caller}`
        : context
      : caller || '';
    super.log(message, meta);
  }

  error(message: any, stack?: string, context?: string) {
    const caller = this.getCaller();
    const meta = context
      ? caller
        ? `${context}] [${caller}`
        : context
      : caller || '';
    super.error(message, stack, meta);
  }

  warn(message: any, context?: string) {
    const caller = this.getCaller();
    const meta = context
      ? caller
        ? `${context}] [${caller}`
        : context
      : caller || '';
    super.warn(message, meta);
  }

  debug(message: any, context?: string) {
    const caller = this.getCaller();
    const meta = context
      ? caller
        ? `${context}] [${caller}`
        : context
      : caller || '';
    super.debug(message, meta);
  }

  verbose(message: any, context?: string) {
    const caller = this.getCaller();
    const meta = context
      ? caller
        ? `${context}] [${caller}`
        : context
      : caller || '';
    super.verbose(message, meta);
  }

  private getCaller(): string | null {
    const stack = new Error().stack;
    if (!stack) return null;

    const stackLines = stack.split('\n');

    for (const line of stackLines) {
      if (
        line.includes('CustomLogger') ||
        line.includes('node_modules') ||
        line.includes('Error')
      ) {
        continue;
      }

      // Parse file path and line number
      const match = line.match(/\((.*):(\d+):(\d+)\)/);
      if (match) {
        const filePath = match[1];
        const lineNumber = match[2];
        if (filePath.includes('/src/')) {
          const relativePath = filePath.split('/src/').pop();
          return `${relativePath}:${lineNumber}`;
        }
      }

      const match2 = line.match(/at\s+(.*):(\d+):(\d+)/);
      if (match2) {
        const filePath = match2[1];
        const lineNumber = match2[2];
        if (filePath.includes('/src/')) {
          const relativePath = filePath.split('/src/').pop();
          return `${relativePath}:${lineNumber}`;
        }
      }
    }

    return null;
  }
}
