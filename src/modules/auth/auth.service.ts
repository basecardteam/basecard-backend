import {
  Injectable,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UserQuestsService } from '../user-quests/user-quests.service';
import { verifyMessage } from 'viem';
import { Errors, createClient } from '@farcaster/quick-auth';
import { CLIENT_FIDS } from '../../app/constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly farcasterClient = createClient();

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => UserQuestsService))
    private userQuestsService: UserQuestsService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Validates Farcaster Quick Auth token and returns the user's primary Ethereum address.
   * Uses @farcaster/quick-auth library for secure JWT verification.
   */
  async validateFarcasterToken(token: string): Promise<{ fid: number }> {
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

      return { fid: payload.sub };
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
        this.logger.debug(`Farcaster Client Primary Address: ${res}`);
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
      this.logger.error(
        `Wallet signature verification failed: ${e.message}, User address: ${address}`,
      );
      return false;
    }
  }

  /**
   * Shared login logic for Farcaster: Find or Create User -> Issue Token
   * @param loginAddress - The wallet address user is logging in with
   * @param fid - Farcaster ID
   * @param tokenAddress - Address from the Farcaster token (always Farcaster primary address)
   */
  async loginOrRegisterWithFarcaster(
    loginAddress: string,
    fid: number,
    clientFid: number,
  ) {
    const totalStart = Date.now();

    // 1. Find or create user by FID (single DB call handles all cases)
    const { user, isNewUser } = await this.usersService.findOrCreateByFid(
      fid,
      loginAddress,
    );

    // 2. Generate JWT immediately (fast response)
    const payload = {
      sub: user.id,
      fid: user.fid,
      loginAddress: loginAddress.toLowerCase(),
      role: user.role,
    };

    this.logger.debug(`[TIMING] Login sync: ${Date.now() - totalStart}ms`);

    // 3. Fire-and-forget: Always add current login wallet first
    this.usersService
      .addClientWallet(user.id, loginAddress, clientFid)
      .catch((err) => this.logger.debug('Failed to add login wallet:', err));

    // 4. Fire-and-forget: Fetch additional wallets from Neynar (if any)
    if (isNewUser) {
      this.initializeUserBackground(user.id, fid);
    }

    return {
      accessToken: this.jwtService.sign(payload),
      user,
    };
  }

  /**
   * Background initialization after login (fire-and-forget)
   * - Initialize wallets from Neynar auth_addresses
   * - Update PFP
   */
  private initializeUserBackground(userId: string, fid: number): void {
    // Initialize wallets and PFP from Neynar
    this.usersService
      .initializeUserFromNeynar(userId, fid)
      .catch((err) => this.logger.debug('Failed to init from Neynar:', err));
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
    await this.usersService.addClientWallet(
      user!.id,
      safeAddress,
      CLIENT_FIDS.METAMASK,
    );

    // Auto-verify quests on login (fire-and-forget)
    this.userQuestsService
      .verifyQuestsForUser(user!.id)
      .then((result) => {
        if (result.verified > 0) {
          this.logger.log(
            `Auto-verified ${result.verified} quests for user ${user!.id}`,
          );
        }
      })
      .catch((err) => {
        this.logger.debug('Failed to auto-verify quests:', err);
      });

    const payload = {
      sub: user!.id,
      fid: user!.fid,
      loginAddress: safeAddress,
      role: user!.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user,
    };
  }
}
