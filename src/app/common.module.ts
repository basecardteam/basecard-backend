import { Module, Global } from '@nestjs/common';
import { AppConfigService } from './configs/app-config.service';

@Global()
@Module({
  controllers: [],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class CommonModule {}
