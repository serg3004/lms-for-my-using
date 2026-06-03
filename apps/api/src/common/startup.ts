const SENSITIVE_KEY_PATTERN = /(secret|password|token|authorization|api[-_]?key)/i;

type StartupErrorDetails = {
  name: string;
  message: string;
  stack?: string;
};

type StartupLogger = {
  error: (message: string, details?: StartupErrorDetails) => void;
};

function redactSensitiveText(text: string): string {
  return text
    .split(/\r+|\n+/)
    .map((line) => (SENSITIVE_KEY_PATTERN.test(line) ? '[redacted]' : line))
    .join('\n');
}

export function toStartupErrorDetails(error: unknown): StartupErrorDetails {
  if (error instanceof Error) {
    return {
      name: redactSensitiveText(error.name),
      message: redactSensitiveText(error.message),
      ...(error.stack ? { stack: redactSensitiveText(error.stack) } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: redactSensitiveText(String(error)),
  };
}

export function handleStartupError(error: unknown, logger: StartupLogger = console): void {
  logger.error('API startup failed', toStartupErrorDetails(error));
  process.exitCode = 1;
}
