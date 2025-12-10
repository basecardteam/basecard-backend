import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../configs/app-config.service';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

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
    return parseAbi([
      'function hasMinted(address _owner) public view returns (bool)',
      'function tokenIdOf(address _owner) public view returns (uint256)',
      'function getSocial(uint256 _tokenId, string memory _key) public view returns (string memory)',
    ]);
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
}
