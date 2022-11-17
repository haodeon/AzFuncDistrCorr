#!/bin/bash

# use Azure CLI command 'az login' to sign in to your account and select your subscription
# execute deploy.sh script

resourceGroupName='EGFA_resourcegroup'
deploymentName='EGFA_deployment'
subscriptionId=$(az account show --query id --output tsv)

az group create --name $resourceGroupName --location westeurope
az deployment group create --name $deploymentName --resource-group $resourceGroupName --template-file main.bicep

functionAppName=$(az deployment group show \
    -g $resourceGroupName \
    -n $deploymentName \
    --query properties.outputs.functionappName.value \
    --output tsv)
functionName='CloudEventsTrigger'

echo "sleep for 30s"
sleep 30

npm install
npm run build
npm prune --production
func azure functionapp fetch-app-settings $functionAppName
func azure functionapp publish $functionAppName
npm install

eventgridTopic=$(az deployment group show \
    -g $resourceGroupName \
    -n $deploymentName \
    --query properties.outputs.eventgridTopic.value \
    --output tsv)

MSYS_NO_PATHCONV=1 az eventgrid event-subscription create \
	--name eventSubscription \
    --source-resource-id /subscriptions/$subscriptionId/resourceGroups/$resourceGroupName/providers/Microsoft.EventGrid/topics/$eventgridTopic \
    --endpoint https://$functionAppName.azurewebsites.net/api/$functionName \
    --event-delivery-schema cloudeventschemav1_0

# az group delete --name $resourceGroupName --yes
# eg: az group delete --name EGFA_resourcegroup --yes