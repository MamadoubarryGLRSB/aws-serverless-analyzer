import { Injectable, Logger } from '@nestjs/common';
import {
  BlobServiceClient,
  StorageSharedKeyCredential as BlobStorageSharedKeyCredential,
} from '@azure/storage-blob';
import {
  QueueServiceClient,
  StorageSharedKeyCredential as QueueStorageSharedKeyCredential,
} from '@azure/storage-queue';
import { parse } from 'csv-parse';

export interface CSVRow {
  ID: number;
  Nom: string;
  Prix: number;
  Quantité: number;
  Note_Client: number;
}

export interface StatisticsResult {
  prix: {
    moyenne: number;
    mediane: number;
    ecartType: number;
  };
  quantite: {
    moyenne: number;
    mediane: number;
    ecartType: number;
  };
  note: {
    moyenne: number;
    mediane: number;
    ecartType: number;
  };
}

export interface Anomaly {
  ligne: number;
  valeur: number;
  raison: string;
}

export interface AnomaliesResult {
  prix: Anomaly[];
  quantite: Anomaly[];
  note: Anomaly[];
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private blobServiceClient: BlobServiceClient;
  private queueServiceClient: QueueServiceClient;
  private containerName: string;
  private queueName: string;

  constructor() {
    // Configuration Azure
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = process.env.AZURE_STORAGE_KEY;

    // Créer des instances séparées de SharedKeyCredential pour blob et queue
    const blobCredential = new BlobStorageSharedKeyCredential(
      account,
      accountKey,
    );
    const queueCredential = new QueueStorageSharedKeyCredential(
      account,
      accountKey,
    );

    this.blobServiceClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      blobCredential,
    );

    this.queueServiceClient = new QueueServiceClient(
      `https://${account}.queue.core.windows.net`,
      queueCredential,
    );

    this.containerName = process.env.AZURE_STORAGE_CONTAINER;
    this.queueName = process.env.AZURE_QUEUE_NAME;
  }

  public getBlobServiceClient(): BlobServiceClient {
    return this.blobServiceClient;
  }

  async analyzeFile(fileName: string) {
    try {
      // 1. Récupérer le fichier CSV depuis Azure Blob Storage
      const containerClient = this.blobServiceClient.getContainerClient(
        this.containerName,
      );
      const blobClient = containerClient.getBlobClient(fileName);

      const downloadResponse = await blobClient.download();
      const fileContent = await this.streamToString(
        downloadResponse.readableStreamBody,
      );

      // 2. Parser le CSV avec une approche robuste
      const data = await this.parseCSV(fileContent);

      // 3. Calculer les statistiques et détecter les anomalies
      const statistics = this.calculateStatistics(data);
      const anomalies = this.detectAnomalies(data);

      // 4. Préparer le résultat
      const analysisResult = {
        statistics,
        anomalies,
      };

      // 5. Sauvegarder les résultats dans un nouveau blob
      const resultFileName = `analysis-result-${fileName}`;
      const resultBlobClient =
        containerClient.getBlockBlobClient(resultFileName);
      await resultBlobClient.upload(
        JSON.stringify(analysisResult),
        JSON.stringify(analysisResult).length,
      );

      // 6. Envoyer une notification dans la file d'attente
      await this.sendNotification(fileName, analysisResult);

      return {
        success: true,
        fileName: resultFileName,
        url: resultBlobClient.url,
        results: analysisResult,
      };
    } catch (error) {
      this.logger.error(`Error analyzing file ${fileName}: ${error.message}`);
      return {
        success: false,
        message: `Error analyzing file: ${error.message}`,
      };
    }
  }

  public async streamToString(
    readableStream: NodeJS.ReadableStream,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on('data', (data) => {
        chunks.push(data.toString());
      });
      readableStream.on('end', () => {
        resolve(chunks.join(''));
      });
      readableStream.on('error', reject);
    });
  }

  private async parseCSV(content: string): Promise<CSVRow[]> {
    return new Promise((resolve, reject) => {
      parse(
        content,
        {
          columns: true,
          delimiter: ',',
          skip_empty_lines: true,
          trim: true,
        },
        (error, data) => {
          if (error) reject(error);
          else {
            const parsedData = data.map((row, index) => {
              // Trouver la colonne Quantité avec toutes les variations possibles
              const quantityKey = Object.keys(row).find((key) =>
                key.replace(/\s+/g, '').toLowerCase().includes('quantit'),
              );

              if (!quantityKey) {
                this.logger.error(
                  `No quantity column found in row ${index + 1}`,
                );
                this.logger.debug('Available columns:', Object.keys(row));
              }

              return {
                ID: parseInt(row.ID),
                Nom: row.Nom,
                Prix: parseFloat(row.Prix),
                Quantité: quantityKey ? parseFloat(row[quantityKey]) : 0,
                Note_Client: parseFloat(row.Note_Client),
              };
            });

            resolve(parsedData);
          }
        },
      );
    });
  }

  private calculateStatistics(data: CSVRow[]): StatisticsResult {
    const calculateStats = (values: number[]) => {
      const numbers = values.filter((n) => !isNaN(n) && n !== null);
      if (numbers.length === 0) return { moyenne: 0, mediane: 0, ecartType: 0 };

      const moyenne = Number(
        (numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(2),
      );
      const sorted = [...numbers].sort((a, b) => a - b);
      const mediane = Number(sorted[Math.floor(sorted.length / 2)].toFixed(2));
      const ecartType = Number(
        Math.sqrt(
          numbers.reduce((a, b) => a + Math.pow(b - moyenne, 2), 0) /
            numbers.length,
        ).toFixed(2),
      );

      return { moyenne, mediane, ecartType };
    };

    return {
      prix: calculateStats(data.map((row) => row.Prix)),
      quantite: calculateStats(data.map((row) => row.Quantité)),
      note: calculateStats(data.map((row) => row.Note_Client)),
    };
  }

  private detectAnomalies(data: CSVRow[]): AnomaliesResult {
    const anomalies: AnomaliesResult = {
      prix: [],
      quantite: [],
      note: [],
    };

    data.forEach((row, index) => {
      // Prix (10€ à 500€)
      if (row.Prix < 0) {
        anomalies.prix.push({
          ligne: index + 2,
          valeur: row.Prix,
          raison: 'Prix négatif',
        });
      } else if (row.Prix < 10) {
        anomalies.prix.push({
          ligne: index + 2,
          valeur: row.Prix,
          raison: 'Prix inférieur à 10€',
        });
      } else if (row.Prix > 500) {
        anomalies.prix.push({
          ligne: index + 2,
          valeur: row.Prix,
          raison: 'Prix supérieur à 500€',
        });
      }

      // Quantité
      const qte = row.Quantité;
      if (qte < 0) {
        anomalies.quantite.push({
          ligne: index + 2,
          valeur: qte,
          raison: 'Quantité négative',
        });
      } else if (qte === 0) {
        anomalies.quantite.push({
          ligne: index + 2,
          valeur: qte,
          raison: 'Quantité nulle',
        });
      } else if (qte >= 1000) {
        anomalies.quantite.push({
          ligne: index + 2,
          valeur: qte,
          raison: 'Quantité excessivement haute (>=1000)',
        });
      }

      // Notes (1.0 à 5.0)
      if (row.Note_Client < 1) {
        anomalies.note.push({
          ligne: index + 2,
          valeur: row.Note_Client,
          raison: 'Note inférieure à 1',
        });
      } else if (row.Note_Client > 5) {
        anomalies.note.push({
          ligne: index + 2,
          valeur: row.Note_Client,
          raison: 'Note supérieure à 5',
        });
      }
    });

    return anomalies;
  }

  private async sendNotification(fileName: string, analysisResult: any) {
    try {
      const queueClient = this.queueServiceClient.getQueueClient(
        this.queueName,
      );

      // Préparer un résumé pour la notification
      const summary = {
        fileName,
        timestamp: new Date().toISOString(),
        totalRecords: analysisResult.statistics.totalRecords || 0,
        anomalies: {
          prix: analysisResult.anomalies.prix.length,
          quantite: analysisResult.anomalies.quantite.length,
          note: analysisResult.anomalies.note.length,
          total:
            analysisResult.anomalies.prix.length +
            analysisResult.anomalies.quantite.length +
            analysisResult.anomalies.note.length,
        },
      };

      // Encoder en base64 comme requis par Azure Queue Storage
      const message = Buffer.from(JSON.stringify(summary)).toString('base64');

      // Envoyer à la file d'attente
      await queueClient.sendMessage(message);

      return true;
    } catch (error) {
      this.logger.error(`Error sending notification: ${error.message}`);
      return false;
    }
  }
}
