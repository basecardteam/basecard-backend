import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get databaseUrl(): string {
    return this.configService.get<string>('DATABASE_URL')!;
  }

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
  }

  get useMockData(): boolean {
    return (
      this.configService.get<string>('NEXT_PUBLIC_USE_MOCK_DATA') === 'true'
    );
  }

  // Pinata
  get pinataJwt(): string | undefined {
    return this.configService.get<string>('PINATA_JWT');
  }

  get pinataGateway(): string {
    return this.configService.get<string>(
      'PINATA_GATEWAY',
      'gateway.pinata.cloud',
    );
  }

  get pinataGroup(): string | undefined {
    return this.configService.get<string>('PINATA_GROUP');
  }

  // AWS S3
  get awsRegion(): string {
    return this.configService.get<string>('AWS_REGION', 'us-east-1');
  }

  get awsAccessKeyId(): string | undefined {
    return this.configService.get<string>('AWS_ACCESS_KEY_ID');
  }

  get awsSecretAccessKey(): string | undefined {
    return this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
  }

  get awsS3BucketName(): string | undefined {
    return this.configService.get<string>('AWS_S3_BUCKET_NAME');
  }
}
