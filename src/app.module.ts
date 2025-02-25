import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileUploadModule } from './modules/file-upload/file-upload.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { NotificationModule } from './modules/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    FileUploadModule,
    AnalysisModule,
    NotificationModule,
  ],
})
export class AppModule {}
