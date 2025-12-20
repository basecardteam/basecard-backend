import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppConfigService } from './app/configs/app-config.service';
import { TransformInterceptor } from './app/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './app/filters/http-exception.filter';
import { CustomLogger } from './app/logger/custom.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new CustomLogger(),
  });

  app.enableCors({
    origin: [
      /^http:\/\/localhost(:\d+)?$/, // localhost 모든 포트
      /^https:\/\/.*\.basecard\.org$/, // *.basecard.org 서브도메인
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('BaseCard API')
    .setDescription('The BaseCard API description')
    .setVersion('1.0')
    .addTag('basecard')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const configService = app.get(AppConfigService);
  await app.listen(configService.port);
}
bootstrap();
