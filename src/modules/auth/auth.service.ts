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
      this.logger.debug(`Farcaster Client User Address: ${address}`);

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
   * Shared login logic for Farcaster: Find or Create User -> Issue Token
   * @param loginAddress - The wallet address user is logging in with
   * @param fid - Farcaster ID
   * @param clientFid - Client app FID (9152=Farcaster, 309857=BaseApp)
   * @param tokenAddress - Address from the Farcaster token (always Farcaster primary address)
   */
  async loginOrRegisterWithFarcaster(
    loginAddress: string,
    fid: number,
    clientFid: number,
    tokenAddress: string,
  ) {
    const safeLoginAddress = loginAddress.toLowerCase();
    const safeTokenAddress = tokenAddress.toLowerCase();
    const isBaseApp = clientFid === 309857;

    // 1. Find user by FID (same Farcaster account, regardless of app)
    let user = await this.usersService.findByFid(fid);

    // 2. If not found, create new user
    if (!user) {
      const newUser = await this.usersService.create({
        walletAddress: safeLoginAddress,
        fid,
      });
      user = { ...newUser, card: null } as any;

      // Add tokenAddress (Farcaster primary) to user_wallets
      await this.usersService.addClientWallet(
        user!.id,
        safeTokenAddress,
        'farcaster',
        9152,
      );

      // If BaseApp login, also add loginAddress as baseapp wallet
      if (isBaseApp && safeLoginAddress !== safeTokenAddress) {
        await this.usersService.addClientWallet(
          user!.id,
          safeLoginAddress,
          'baseapp',
          clientFid,
        );
      }
    } else {
      // User exists - check existing wallets and add only if not tracked
      const existingAddresses = (user.wallets || []).map((w) =>
        w.walletAddress.toLowerCase(),
      );

      // Add tokenAddress (farcaster) if not exists
      if (!existingAddresses.includes(safeTokenAddress)) {
        await this.usersService.addClientWallet(
          user.id,
          safeTokenAddress,
          'farcaster',
          9152,
        );
      }

      // Add loginAddress (baseapp) if BaseApp and not exists
      if (
        isBaseApp &&
        safeLoginAddress !== safeTokenAddress &&
        !existingAddresses.includes(safeLoginAddress)
      ) {
        await this.usersService.addClientWallet(
          user.id,
          safeLoginAddress,
          'baseapp',
          clientFid,
        );
      }
    }

    const payload = {
      sub: user!.id,
      fid: user!.fid,
      walletAddress: safeLoginAddress,
      role: user!.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  /**
   * Shared login logic for Wallet-only (MetaMask): Find or Create User -> Issue Token
   */
  async loginOrRegister(address: string) {
    const safeAddress = address.toLowerCase();

    let user = await this.usersService.findByAddress(safeAddress);

    if (!user) {
      const newUser = await this.usersService.create({
        walletAddress: safeAddress,
      });
      user = { ...newUser, card: null } as any;
    }

    // Track as metamask wallet
    await this.usersService.addClientWallet(user!.id, safeAddress, 'metamask');

    const payload = {
      sub: user!.id,
      fid: user!.fid,
      walletAddress: safeAddress,
      role: user!.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
