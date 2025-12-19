import { Module, Global } from '@nestjs/common';
import { EvmLib } from './evm.lib';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EvmLib],
  exports: [EvmLib],
})
export class BlockchainModule {}
