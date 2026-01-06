// ═══════════════════════════════════════════════════════════════════════════
// TOKEN METADATA FETCHER
// Fetch token metadata from Solana blockchain
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, PublicKey } from '@solana/web3.js'

// Helius RPC for faster metadata access (free tier available)
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

export interface TokenMetadata {
  symbol: string
  name: string
  decimals: number
  uri?: string
  image?: string
}

/**
 * Derive the metadata PDA for a token mint
 */
function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )
  return pda
}

/**
 * Parse Metaplex metadata from account data
 */
function parseMetadata(data: Buffer): { name: string; symbol: string; uri: string } | null {
  try {
    // Metaplex metadata structure (simplified parsing)
    // Skip: key (1), update_authority (32), mint (32), name length (4)
    let offset = 1 + 32 + 32

    // Name (32 bytes padded, 4 bytes length prefix)
    const nameLen = data.readUInt32LE(offset)
    offset += 4
    const name = data.slice(offset, offset + 32).toString('utf8').replace(/\0/g, '').trim()
    offset += 32

    // Symbol (10 bytes padded, 4 bytes length prefix)
    const symbolLen = data.readUInt32LE(offset)
    offset += 4
    const symbol = data.slice(offset, offset + 10).toString('utf8').replace(/\0/g, '').trim()
    offset += 10

    // URI (200 bytes padded, 4 bytes length prefix)
    const uriLen = data.readUInt32LE(offset)
    offset += 4
    const uri = data.slice(offset, offset + 200).toString('utf8').replace(/\0/g, '').trim()

    return { name, symbol, uri }
  } catch (error) {
    console.error('Failed to parse metadata:', error)
    return null
  }
}

/**
 * Fetch token metadata from Solana
 */
export async function fetchTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
  try {
    // Validate the mint address
    const mint = new PublicKey(mintAddress)
    const connection = new Connection(RPC_ENDPOINT, 'confirmed')

    // First, get the token's decimals from the mint account
    const mintInfo = await connection.getParsedAccountInfo(mint)
    let decimals = 6 // Default for most SPL tokens

    if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
      decimals = mintInfo.value.data.parsed.info.decimals
    }

    // Get the metadata PDA
    const metadataPDA = getMetadataPDA(mint)
    const metadataAccount = await connection.getAccountInfo(metadataPDA)

    if (!metadataAccount) {
      console.log('No metadata account found, trying DexScreener fallback')
      return await fetchFromDexScreener(mintAddress, decimals)
    }

    // Parse the metadata
    const parsed = parseMetadata(metadataAccount.data)
    if (!parsed) {
      return await fetchFromDexScreener(mintAddress, decimals)
    }

    // Try to fetch additional metadata from URI if available
    let image: string | undefined
    if (parsed.uri && parsed.uri.startsWith('http')) {
      try {
        const uriResponse = await fetch(parsed.uri)
        const uriData = await uriResponse.json()
        image = uriData.image
      } catch {
        // URI fetch failed, continue without image
      }
    }

    return {
      name: parsed.name,
      symbol: parsed.symbol,
      decimals,
      uri: parsed.uri,
      image,
    }
  } catch (error) {
    console.error('Failed to fetch token metadata:', error)
    // Try DexScreener as fallback
    return await fetchFromDexScreener(mintAddress, 6)
  }
}

/**
 * Fallback: Fetch token info from DexScreener API
 */
async function fetchFromDexScreener(mintAddress: string, defaultDecimals: number): Promise<TokenMetadata | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`)
    const data = await response.json()

    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0]
      const baseToken = pair.baseToken

      if (baseToken.address.toLowerCase() === mintAddress.toLowerCase()) {
        return {
          name: baseToken.name || 'Unknown',
          symbol: baseToken.symbol || 'UNKNOWN',
          decimals: defaultDecimals,
          image: pair.info?.imageUrl,
        }
      }
    }

    return null
  } catch (error) {
    console.error('DexScreener fallback failed:', error)
    return null
  }
}

/**
 * Validate if a string is a valid Solana public key
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}
