import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../app/configs/app-config.service';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import * as BaseCardABI from './abi/BaseCard.json';

@Injectable()
export class EvmLib {
  private readonly logger = new Logger(EvmLib.name);
  private readonly client;
  private readonly contractAddress;

  constructor(private appConfigService: AppConfigService) {
    this.contractAddress = this.appConfigService.baseCardContractAddress;
    this.client = createPublicClient({
      chain: baseSepolia,
      transport: http(this.appConfigService.baseRpcUrl),
    });
  }

  private get contractAbi() {
    return BaseCardABI.abi;
  }

  async getHasMinted(address: string): Promise<boolean> {
    try {
      const hasMinted = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'hasMinted',
        args: [address as `0x${string}`],
      });
      return hasMinted;
    } catch (error) {
      this.logger.error(`Error checking hasMinted for ${address}:`, error);
      return false;
    }
  }

  async getTokenId(address: string): Promise<number | null> {
    try {
      const tokenId = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'tokenIdOf',
        args: [address as `0x${string}`],
      });

      const id = Number(tokenId);
      return id > 0 ? id : null;
    } catch (error) {
      this.logger.error(`Error getting tokenId for ${address}:`, error);
      return null;
    }
  }

  async getSocial(tokenId: number, key: string): Promise<string> {
    try {
      const value = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'getSocial',
        args: [BigInt(tokenId), key],
      });
      return value;
    } catch (error) {
      // Contract might revert if key doesn't exist or other issues, return empty string
      // this.logger.debug(`Error getting social ${key} for token ${tokenId}: ${error.message}`);
      return '';
    }
  }

  async isSocialLinked(tokenId: number, key: string): Promise<boolean> {
    const value = await this.getSocial(tokenId, key);
    return !!value && value.length > 0;
  }

  /**
   * Get card data from onchain tokenURI
   * Parses the base64 encoded JSON metadata
   */
  async getCardData(tokenId: number): Promise<{
    nickname: string;
    role: string;
    bio: string;
    imageUri: string;
    socials: { key: string; value: string }[];
  } | null> {
    try {
      const tokenUri = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      });

      // Parse the base64 encoded JSON
      // Format: data:application/json;base64,{base64-encoded-json}
      if (!tokenUri || typeof tokenUri !== 'string') {
        return null;
      }

      const base64Prefix = 'data:application/json;base64,';
      if (!tokenUri.startsWith(base64Prefix)) {
        this.logger.warn(`Unexpected tokenURI format for token ${tokenId}`);
        return null;
      }

      const base64Data = tokenUri.substring(base64Prefix.length);
      const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
      const metadata = JSON.parse(jsonString);

      return {
        nickname: metadata.nickname || '',
        role: metadata.role || '',
        bio: metadata.bio || '',
        imageUri: metadata.image || '',
        socials: metadata.socials || [],
      };
    } catch (error) {
      this.logger.error(`Error getting card data for token ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Get owner address of a token
   */
  async getOwnerOf(tokenId: number): Promise<string | null> {
    try {
      const owner = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });
      return owner as string;
    } catch (error) {
      this.logger.error(`Error getting owner for token ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Simulate mintBaseCard contract call
   */
  async simulateMintBaseCard(
    address: string,
    cardData: {
      imageUri: string;
      nickname: string;
      role: string;
      bio: string;
    },
    socialKeys: string[],
    socialValues: string[],
  ): Promise<boolean> {
    try {
      await this.client.simulateContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'mintBaseCard',
        account: address as `0x${string}`,
        args: [
          {
            imageURI: cardData.imageUri,
            nickname: cardData.nickname,
            role: cardData.role,
            bio: cardData.bio,
          },
          socialKeys,
          socialValues,
        ],
      });
      this.logger.log(`✅ Simulation successful: mintBaseCard for ${address}`);
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Simulation failed: mintBaseCard for ${address}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Simulate editBaseCard contract call
   */
  async simulateEditBaseCard(
    address: string,
    tokenId: number,
    cardData: {
      imageUri: string;
      nickname: string;
      role: string;
      bio: string;
    },
    socialKeys: string[],
    socialValues: string[],
  ): Promise<boolean> {
    try {
      await this.client.simulateContract({
        address: this.contractAddress as `0x${string}`,
        abi: this.contractAbi,
        functionName: 'editBaseCard',
        account: address as `0x${string}`,
        args: [
          BigInt(tokenId),
          {
            imageURI: cardData.imageUri,
            nickname: cardData.nickname,
            role: cardData.role,
            bio: cardData.bio,
          },
          socialKeys,
          socialValues,
        ],
      });
      this.logger.log(`✅ Simulation successful: editBaseCard for ${address}`);
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Simulation failed: editBaseCard for ${address}:`,
        error,
      );
      throw error;
    }
  }
}
