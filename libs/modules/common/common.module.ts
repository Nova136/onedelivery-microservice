import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonController } from './common.controller';
import { CommonService } from './common.service';

@Module({
  imports: [ConfigModule.forRoot({
    envFilePath: ['.env'],
  }),
  ],
  providers: [CommonService],
  controllers: [CommonController],
  exports: [CommonService]
})
export class CommonModule {}
