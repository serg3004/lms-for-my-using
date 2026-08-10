import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TelemetryContext = {
  requestId: string;
};

const telemetryContext = new AsyncLocalStorage<TelemetryContext>();

export function getTelemetryContext(): TelemetryContext | undefined {
  return telemetryContext.getStore();
}

export function runWithTelemetryContext<T>(context: TelemetryContext, callback: () => T): T {
  return telemetryContext.run(context, callback);
}

export function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? undefined : value?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate.toLowerCase() : randomUUID();
}

type NextFunction = () => void;

export function createTelemetryContextMiddleware() {
  return (request: IncomingMessage, response: ServerResponse, next: NextFunction): void => {
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    runWithTelemetryContext({ requestId }, next);
  };
}
