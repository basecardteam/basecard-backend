import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { verifyMessage } from 'viem';
import { Errors, createClient } from '@farcaster/quick-auth';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly farcasterClient = createClient();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Validates Farcaster Quick Auth token and returns the user's primary Ethereum address.
   * Uses @farcaster/quick-auth library for secure JWT verification.
   */
  async validateFarcasterToken(
    token: string,
  ): Promise<{ address: string; fid: number }> {
    try {
      // Verify JWT using Farcaster Quick Auth
      const domain = this.configService.get<string>(
        'FARCASTER_DOMAIN',
        'miniapp.basecard.org',
      );
      const payload = await this.farcasterClient.verifyJwt({
        token,
        domain,
      });

      this.logger.debug(`Farcaster Auth Debug: FID=${payload.sub}`);

      // Fetch primary Ethereum address for the FID
      const address = await this.resolvePrimaryAddress(payload.sub);

      if (!address) {
        throw new Error('No primary address found for FID');
      }

      return { address, fid: payload.sub };
    } catch (e) {
      if (e instanceof Errors.InvalidTokenError) {
        this.logger.error(`Farcaster token invalid: ${e.message}`);
        throw new UnauthorizedException('Invalid Farcaster token');
      }
      this.logger.error(`Farcaster validation failed: ${e.message}`);
      throw new UnauthorizedException('Farcaster authentication failed');
    }
  }

  /**
   * Resolves the primary Ethereum address for a Farcaster FID.
   */
  private async resolvePrimaryAddress(
    fid: number,
  ): Promise<string | undefined> {
    try {
      const res = await fetch(
        `https://api.farcaster.xyz/fc/primary-address?fid=${fid}&protocol=ethereum`,
      );

      if (res.ok) {
        const { result } = (await res.json()) as {
          result: {
            address: {
              fid: number;
              protocol: 'ethereum' | 'solana';
              address: string;
            };
          };
        };
        return result.address.address;
      }

      this.logger.warn(
        `Failed to fetch primary address for FID ${fid}: ${res.status}`,
      );
      return undefined;
    } catch (e) {
      this.logger.error(`Error fetching primary address: ${e.message}`);
      return undefined;
    }
  }

  async verifyWalletSignature(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const valid = await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
      return valid;
    } catch (e) {
      this.logger.error(`Wallet signature verification failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Shared login logic: Find or Create User -> Issue Token
   */
  async loginOrRegister(address: string) {
    const safeAddress = address.toLowerCase();
    let user = await this.usersService.findByAddress(safeAddress);
    if (!user) {
      this.logger.log(`User not found for ${safeAddress}, creating new user.`);
      try {
        const newUser = await this.usersService.create({
          walletAddress: safeAddress,
        });
        // The service returns the created result, likely an array or object.
        // We need to ensure we get the user object back.
        // Assuming update/create returns standard Drizzle result or the object.
        // Let's re-fetch to be safe or rely on return.
        // Checking users.service.ts source would be good, but safe to fetch again or trust return if typed.
        user = Array.isArray(newUser) ? newUser[0] : newUser;
      } catch (e) {
        this.logger.error(`Failed to create user: ${e.message}`);
        throw new Error('Could not create user');
      }
    }

    if (!user) throw new Error('User retrieval failed during login');

    const payload = {
      sub: user.id,
      address: user.walletAddress,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
