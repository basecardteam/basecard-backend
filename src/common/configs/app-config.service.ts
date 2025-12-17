import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const requiredKeys = [
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_KEY',
      'PINATA_JWT',
      'PINATA_GATEWAY',
      'PINATA_GROUP',
      'BASECARD_CONTRACT_ADDRESS',
      'BASE_WS_RPC_URLS',
    ];

    const missingKeys = requiredKeys.filter(
      (key) => !this.configService.get(key),
    );

    if (missingKeys.length > 0) {
      const message = `Missing required environment variables: ${missingKeys.join(', ')}`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.logger.log('All required environment variables are present.');
  }

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

  // Supabase API
  get supabaseUrl(): string | undefined {
    return this.configService.get<string>('SUPABASE_URL');
  }

  get supabaseKey(): string | undefined {
    return this.configService.get<string>('SUPABASE_KEY');
  }

  // Blockchain
  get baseRpcUrl(): string {
    return this.configService.get<string>(
      'BASE_RPC_URL',
      'https://sepolia.base.org',
    );
  }

  get baseWsRpcUrls(): string[] {
    const urls = this.configService.get<string>('BASE_WS_RPC_URLS');
    if (urls) {
      return urls.split(',').map((url) => url.trim());
    }
    return [];
  }

  get baseCardContractAddress(): string | undefined {
    return this.configService.get<string>('BASECARD_CONTRACT_ADDRESS');
  }

  // Socials
  get neynarApiKey(): string | undefined {
    return this.configService.get<string>('NEYNAR_API_KEY');
  }
}
