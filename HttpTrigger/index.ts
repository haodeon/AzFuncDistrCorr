import * as appInsights from 'applicationinsights';
appInsights.setup(process.env["APPLICATIONINSIGHTS_CONNECTION_STRING"])
  .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);
appInsights.defaultClient.setAutoPopulateAzureProperties(true);
appInsights.start();

import { Context, HttpRequest } from "@azure/functions";
import { EventGridPublisherClient, AzureKeyCredential } from "@azure/eventgrid";
import { context as ctxapi, propagation } from '@opentelemetry/api';

const httpTrigger = async (context: Context, req: HttpRequest): Promise<void> => {
  context.log('HTTP trigger function processed a request.');
  context.log(`context.traceContext: ${JSON.stringify(context.traceContext)}`);
  context.log(`req: ${JSON.stringify(req)}`);

  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";
  
  const client = new EventGridPublisherClient(
    process.env["EVENTGRID_ENDPOINT"],
    "CloudEvent",
    new AzureKeyCredential(process.env["EVENTGRID_ACCESS_KEY"])
  );

  const ctx = propagation.extract(ctxapi.active(), context.traceContext)
  await client.send([
    {
      type: "azure.sdk.eventgrid.samples.cloudevent",
      source: "/azure/sdk/eventgrid/samples/sendEventSample",
      data: {
        message: responseMessage
      },
    },
  ],
    {
      tracingOptions: {
        tracingContext: ctx,
      },
    },
  );

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: responseMessage
  };

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