import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const requiredKeys = [
      'DATABASE_URL',
      'PINATA_JWT',
      'PINATA_GATEWAY',
      'PINATA_GROUP',
      'BASECARD_CONTRACT_ADDRESS',
      'BASE_WS_RPC_URLS',
      'NEYNAR_API_KEY',
      'JWT_SECRET',
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

  get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.configService.get<string>('NODE_ENV') !== 'production';
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

  // Blockchain
  get baseRpcUrls(): string[] {
    const urls = this.configService.get<string>('BASE_WS_RPC_URLS', '');
    return urls
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
  }

  get chainId(): number {
    return Number(this.configService.get<number>('CHAIN_ID', 84532));
  }

  get baseCardContractAddress(): string {
    return this.configService.get<string>('BASECARD_CONTRACT_ADDRESS')!;
  }

  // Configurations
  get farcasterDomain(): string {
    return this.configService.get<string>('FARCASTER_DOMAIN')!;
  }

  get neynarApiKey(): string {
    return this.configService.get<string>('NEYNAR_API_KEY')!;
  }

  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET')!;
  }

  get adminWalletAddresses(): string[] {
    const addresses = this.configService.get<string>(
      'ADMIN_WALLET_ADDRESSES',
      '',
    );
    return addresses
      .split(',')
      .map((addr) => addr.trim().toLowerCase())
      .filter(Boolean);
  }
}
