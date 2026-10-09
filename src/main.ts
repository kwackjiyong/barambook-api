import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LiteAppModule } from './lite-app.module';

async function bootstrap() {
  const isLite = process.env.API_MODE === 'lite';
  const app = await NestFactory.create<NestExpressApplication>(
    isLite ? LiteAppModule : AppModule,
  );
  app.set('trust proxy', true);
  await app.listen(
    isLite
      ? (process.env.BARAMVISION_PORT ?? 43110)
      : (process.env.PORT ?? 3010),
    isLite
      ? (process.env.BARAMVISION_HOST ?? '127.0.0.1')
      : (process.env.HOST ?? '0.0.0.0'),
  );
}
bootstrap();
