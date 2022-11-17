import * as appInsights from 'applicationinsights';
appInsights.setup(process.env["APPLICATIONINSIGHTS_CONNECTION_STRING"])
  .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);
appInsights.defaultClient.setAutoPopulateAzureProperties(true);
appInsights.start();

import { Context, HttpRequest } from "@azure/functions";
import { EventGridDeserializer } from "@azure/eventgrid";

const httpTrigger = async (context: Context, req: HttpRequest): Promise<void> => {
  context.log('HTTP trigger function processed a request.');
  context.log(`context.traceContext: ${JSON.stringify(context.traceContext)}`);
  context.log(`req: ${JSON.stringify(req)}`);

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
    const consumer = new EventGridDeserializer();
    const event = (await consumer.deserializeCloudEvents(req.body))[0];
    context.log(`event: ${JSON.stringify(event)}`);
    context.res = {
      // status: 200, /* Defaults to 200 */
      body: event.data
    };
  }
};

// Default export wrapped with Application Insights FaaS context propagation
export default async function contextPropagatingHttpTrigger(context, req) {
  // Start an AI Correlation Context using the provided Function context
  const correlationContext = appInsights.startOperation(context, req);

  // Wrap the Function runtime with correlationContext
  return appInsights.wrapWithCorrelationContext(async () => {
      // Run the Function
      const result = await httpTrigger(context, req);

      appInsights.defaultClient.flush();
      
      return result;
  }, correlationContext)();
};
