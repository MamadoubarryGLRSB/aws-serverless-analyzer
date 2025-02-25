// analysis.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { AnalysisService } from './analysis.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post(':fileName')
  async analyzeFile(@Param('fileName') fileName: string) {
    const result = await this.analysisService.analyzeFile(fileName);
    if (!result.success) {
      throw new NotFoundException(result.message);
    }
    return result;
  }

  @Get(':fileName')
  async getAnalysisResults(@Param('fileName') fileName: string) {
    // Cette méthode pourrait récupérer les résultats d'une analyse déjà effectuée
    const resultFileName = `analysis-result-${fileName}`;
    try {
      const containerClient = this.analysisService
        .getBlobServiceClient()
        .getContainerClient(process.env.AZURE_STORAGE_CONTAINER);
      const blobClient = containerClient.getBlobClient(resultFileName);

      // Vérifier si le blob existe
      const exists = await blobClient.exists();
      if (!exists) {
        return {
          success: false,
          message: `No analysis results found for file: ${fileName}`,
        };
      }

      // Télécharger les résultats
      const downloadResponse = await blobClient.download();
      const content = await this.analysisService.streamToString(
        downloadResponse.readableStreamBody,
      );

      return {
        success: true,
        fileName: resultFileName,
        results: JSON.parse(content),
      };
    } catch (error) {
      return {
        success: false,
        message: `Error retrieving analysis results: ${error.message}`,
      };
    }
  }
}
