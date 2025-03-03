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

    try {
      // Vérification et récupération sécurisée des données
      const statistics = analysisResult.results?.statistics || {};
      const anomalies = analysisResult.results?.anomalies || {};

      const notification = {
        type: 'analysis_completed',
        fileName: analysisResult.fileName,
        timestamp: new Date().toISOString(),
        summary: {
          totalRecords: statistics.totalRecords || 0,
          totalAnomalies:
            (anomalies.prix?.length || 0) +
            (anomalies.quantite?.length || 0) +
            (anomalies.note?.length || 0),
          avgPrice: statistics.prix?.moyenne || 0,
          avgQuantity: statistics.quantite?.moyenne || 0,
          avgRating: statistics.note?.moyenne || 0,
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
    } catch (error) {
      return {
        success: false,
        message: `Error sending notification: ${error.message}`,
      };
    }
  }
}
