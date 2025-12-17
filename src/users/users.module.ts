import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CommonModule } from '../common/common.module';
import { BasecardsModule } from '../basecards/basecards.module';

@Module({
  imports: [CommonModule, forwardRef(() => BasecardsModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
