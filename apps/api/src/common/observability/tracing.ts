import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk: NodeSDK | undefined;

async function startTracing(): Promise<void> {
  if (!process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) return;
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'lms-api',
      [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? 'unknown',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request) => request.url?.split('?')[0] === '/api/v1/metrics',
      },
    })],
  });
  await sdk.start();
}

export async function stopTracing(): Promise<void> {
  await sdk?.shutdown();
}

await startTracing();
