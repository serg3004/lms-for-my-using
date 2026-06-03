import { handleStartupError, toStartupErrorDetails } from './startup';

describe('startup error handling', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('normalizes unknown startup failures without throwing', () => {
    expect(toStartupErrorDetails('failed to start')).toEqual({
      name: 'UnknownError',
      message: 'failed to start',
    });
  });

  it('redacts sensitive startup error lines', () => {
    const error = new Error('Invalid API_KEY=secret-value');
    error.stack = ['Error: Invalid API_KEY=secret-value', 'at bootstrap'].join('\n');

    expect(toStartupErrorDetails(error)).toEqual({
      name: 'Error',
      message: '[redacted]',
      stack: ['[redacted]', 'at bootstrap'].join('\n'),
    });
  });

  it('logs startup failures and marks the process as failed', () => {
    const loggedMessages: string[] = [];
    const logger = {
      error(message: string) {
        loggedMessages.push(message);
      },
    };

    handleStartupError(new Error('Database unavailable'), logger);

    expect(loggedMessages).toEqual(['API startup failed']);
    expect(process.exitCode).toBe(1);
  });
});
