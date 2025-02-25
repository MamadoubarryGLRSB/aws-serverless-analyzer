// notification.service.ts
import { Injectable } from '@nestjs/common';
import {
  QueueServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-queue';

@Injectable()
export class NotificationService {
  private queueServiceClient: QueueServiceClient;
  private queueName: string;

  constructor() {
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = process.env.AZURE_STORAGE_KEY;
    const sharedKeyCredential = new StorageSharedKeyCredential(
      account,
      accountKey,
    );

    this.queueServiceClient = new QueueServiceClient(
      `https://${account}.queue.core.windows.net`,
      sharedKeyCredential,
    );

    this.queueName = process.env.AZURE_QUEUE_NAME;
  }

  async sendNotification(analysisResult: any) {
    const queueClient = this.queueServiceClient.getQueueClient(this.queueName);

    // Créer un message de notification
    const notification = {
      type: 'analysis_completed',
      fileName: analysisResult.fileName,
      timestamp: new Date().toISOString(),
      summary: {
        totalRecords: analysisResult.results.statistics.totalRecords,
        totalAnomalies: analysisResult.results.anomalies.totalAnomalies,
        avgPrice: analysisResult.results.statistics.prices.average,
        avgQuantity: analysisResult.results.statistics.quantities.average,
        avgRating: analysisResult.results.statistics.ratings.average,
      },
    };

    // Encoder en base64 comme requis par Azure Queue Storage
    const message = Buffer.from(JSON.stringify(notification)).toString(
      'base64',
    );

    // Envoyer à la file d'attente
    await queueClient.sendMessage(message);

    return {
      success: true,
      message: 'Notification sent successfully',
      notificationDetails: notification,
    };
  }
}
