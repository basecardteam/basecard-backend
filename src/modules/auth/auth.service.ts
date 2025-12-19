import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { verifyMessage } from 'viem';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  /**
   * Validates Farcaster Token and returns the simplified payload.
   * WARN: This currently assumes trusting the decoded JWT or needs a provided secret.
   * In a real app, verify against Farcaster public keys.
   */
  async validateFarcasterToken(token: string): Promise<{ address: string }> {
    try {
      const decoded: any = jwt.decode(token);
      if (!decoded) throw new Error('Token decode failed');

      this.logger.debug(`Farcaster Auth Debug: ${JSON.stringify(decoded)}`);

      // Attempt to find a usable address
      // Structure varies by Farcaster Auth version, but typically checks:
      // 'custody_address', 'verifications' array, or 'verified_addresses'
      const address =
        decoded.custody_address ||
        (decoded.verifications && decoded.verifications[0]) ||
        (decoded.verified_addresses && decoded.verified_addresses[0]) ||
        decoded.address; // Fallback

      if (!address) {
        throw new Error('No address found in Farcaster token');
      }

      return { address };
    } catch (e) {
      this.logger.error(`Farcaster validation failed: ${e.message}`);
      throw new UnauthorizedException('Invalid Farcaster token');
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
