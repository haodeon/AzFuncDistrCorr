import { Context, HttpRequest, TraceContext } from "@azure/functions";
import { EventGridDeserializer } from "@azure/eventgrid";
import * as opentelemetry from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const httpTrigger = async (context: Context, req: HttpRequest): Promise<void> => {
  context.log('HTTP trigger function processed a request.');
  context.log(`context.traceContext: ${JSON.stringify(context.traceContext)}`);
  context.log(`req: ${JSON.stringify(req)}`);

  const consumer = new EventGridDeserializer();
  const event = (await consumer.deserializeCloudEvents(req.body))[0];

  // Endpoint validation with CloudEvents v1.0
  // https://learn.microsoft.com/en-us/azure/event-grid/webhook-event-delivery#endpoint-validation-with-cloudevents-v10
  if (req.method === "OPTIONS") {
    if (req.headers["webhook-request-origin"] === undefined) {
      context.log("Error during validation.");
    }
    context.res = {
      headers: {
        'Webhook-Allowed-Origin': req.headers["webhook-request-origin"],
        'WebHook-Allowed-Rate': '*'
      }
    };
  } else {
    const resource =
      Resource.default().merge(
        new Resource({
          [SemanticResourceAttributes.FAAS_NAME]: "EventGrid Function",
          [SemanticResourceAttributes.FAAS_VERSION]: "0.1.0",
        })
      );
    const provider = new NodeTracerProvider({
      resource: resource,
    });
    const exporter = new AzureMonitorTraceExporter({
      connectionString:
        process.env["APPLICATIONINSIGHTS_CONNECTION_STRING"],
    });
    const processor = new BatchSpanProcessor(exporter);
    provider.addSpanProcessor(processor);
    provider.register();

    const tracer = opentelemetry.trace.getTracer("EventGridConsumer");

    const cloudeventGetter: opentelemetry.TextMapGetter<TraceContext> = {
      get(carrier: TraceContext, key: string) {
        if (key === "traceparent") {
          return carrier.traceparent;
        } else if (key === "tracestate") {
          return carrier.tracestate;
        }
      },
      keys(carrier: TraceContext) {
        return ["traceparent", "tracestate"];
      },
    };

    const propagator = new W3CTraceContextPropagator();
    const ctxProd = propagator.extract(
      opentelemetry.ROOT_CONTEXT,
      {
        traceparent: event.extensionAttributes.traceparent,
        tracestate: event.extensionAttributes.tracestate,
        attributes: undefined
      },
      cloudeventGetter
    );

    const ctxProdSpan = opentelemetry.trace.getSpan(ctxProd);

    const options: opentelemetry.SpanOptions = {
      links: [
        {
          context: ctxProdSpan.spanContext()
        }
      ]
    };

    tracer.startActiveSpan('Process EventGrid event', options, async (span) => {
      span.addEvent("EventGrid function executed");
      span.addEvent(`span.spanContext() in span: ${JSON.stringify(span.spanContext())}`);
      span.end();
    });

    context.res = {
      // status: 200, /* Defaults to 200 */
      body: event.data
    };
  }
};

export default httpTrigger;