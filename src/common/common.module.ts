import { Module, Global } from '@nestjs/common';
import { IpfsService } from './services/ipfs.service';
import { CardGeneratorService } from './services/card-generator.service';
import { S3Service } from './services/s3.service';
import { AppConfigService } from './configs/app-config.service';
import { IpfsController } from './controllers/ipfs.controller';

@Global()
@Module({
  controllers: [IpfsController],
  providers: [IpfsService, CardGeneratorService, S3Service, AppConfigService],
  exports: [IpfsService, CardGeneratorService, S3Service, AppConfigService],
})
export class CommonModule {}
