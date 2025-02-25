// src/shared/config/azure.config.ts
export const azureConfig = {
  storage: {
    account: process.env.AZURE_STORAGE_ACCOUNT,
    key: process.env.AZURE_STORAGE_KEY,
    container: process.env.AZURE_STORAGE_CONTAINER,
  },
  function: {
    endpoint: process.env.AZURE_FUNCTION_ENDPOINT,
    key: process.env.AZURE_FUNCTION_KEY,
  },
  queue: {
    account: process.env.AZURE_STORAGE_ACCOUNT,
    key: process.env.AZURE_STORAGE_KEY,
    queueName: process.env.AZURE_QUEUE_NAME,
  },
};
