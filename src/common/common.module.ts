import { Module, Global } from '@nestjs/common';
import { IpfsService } from './services/ipfs.service';
import { S3Service } from './services/s3.service';
import { ImageService } from './services/image.service';
import { AppConfigService } from './configs/app-config.service';
import { IpfsController } from './controllers/ipfs.controller';

import { EvmLib } from './libs/evm.lib';

@Global()
@Module({
  controllers: [IpfsController],
  providers: [IpfsService, S3Service, ImageService, AppConfigService, EvmLib],
  exports: [IpfsService, S3Service, ImageService, AppConfigService, EvmLib],
})
export class CommonModule {}
