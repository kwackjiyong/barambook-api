import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GachaController } from './gacha.controller';
import { GachaGroupSchema } from './gacha.schema';
import { GachaService } from './gacha.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'gacha_groups', schema: GachaGroupSchema }],
      'barambook',
    ),
  ],
  controllers: [GachaController],
  providers: [GachaService],
  exports: [GachaService],
})
export class GachaModule {}
