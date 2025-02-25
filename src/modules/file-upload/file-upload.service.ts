import { Injectable } from '@nestjs/common';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

@Injectable()
export class FileUploadService {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;

  constructor() {
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = process.env.AZURE_STORAGE_KEY;
    const sharedKeyCredential = new StorageSharedKeyCredential(
      account,
      accountKey,
    );

    this.blobServiceClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      sharedKeyCredential,
    );

    this.containerName = process.env.AZURE_STORAGE_CONTAINER;
  }

  async uploadFile(file: Express.Multer.File) {
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName,
    );
    const blobName = `${Date.now()}-${file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    try {
      await blockBlobClient.upload(file.buffer, file.size);

      return {
        success: true,
        fileName: blobName,
        url: blockBlobClient.url,
        message: 'File uploaded successfully',
      };
    } catch (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  async listFiles() {
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName,
    );
    const blobs = [];

    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push({
        name: blob.name,
        contentType: blob.properties.contentType,
        size: blob.properties.contentLength,
        createdOn: blob.properties.createdOn,
      });
    }

    return blobs;
  }
}
