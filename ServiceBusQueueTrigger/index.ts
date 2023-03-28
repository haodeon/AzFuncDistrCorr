import * as appInsights from 'applicationinsights';
appInsights.setup(process.env["APPLICATIONINSIGHTS_CONNECTION_STRING"])
  .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);
appInsights.defaultClient.setAutoPopulateAzureProperties(true);
appInsights.start();

import { AzureFunction, Context } from "@azure/functions"

const serviceBusQueueTrigger: AzureFunction = async function(context: Context, mySbMsg: any): Promise<void> {
    context.log('ServiceBus queue trigger function processed message', mySbMsg);
};

export default serviceBusQueueTrigger;
