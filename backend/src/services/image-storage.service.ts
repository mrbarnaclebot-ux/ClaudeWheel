import { PinataSDK } from 'pinata'
import { loggers } from '../utils/logger'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE STORAGE SERVICE
// Handles image uploads to Pinata/IPFS for token images
// Replaces Supabase Storage for decentralized, permanent storage
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ImageUploadResult {
  success: boolean
  url?: string
  cid?: string
  fileId?: string
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ImageStorageService {
  private pinata: PinataSDK | null = null

  constructor() {
    if (env.pinataJwt) {
      this.pinata = new PinataSDK({
        pinataJwt: env.pinataJwt,
        pinataGateway: env.pinataGatewayUrl,
      })
      loggers.server.info('Pinata image storage initialized')
    } else {
      loggers.server.warn('Pinata not configured - image uploads disabled')
    }
  }

  /**
   * Check if Pinata is configured and available
   */
  isConfigured(): boolean {
    return this.pinata !== null
  }

  /**
   * Upload an image to IPFS via Pinata
   * @param fileBuffer - The image file buffer
   * @param filename - The filename for the uploaded file
   * @param mimeType - The MIME type of the image (e.g., 'image/png')
   * @returns Upload result with URL, CID, and file ID on success
   */
  async uploadImage(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<ImageUploadResult> {
    if (!this.pinata) {
      return { success: false, error: 'Image storage not configured' }
    }

    try {
      // Create a File object from buffer
      // Convert Buffer to Uint8Array for File constructor compatibility
      const uint8Array = new Uint8Array(fileBuffer)
      const file = new File([uint8Array], filename, { type: mimeType })

      // Upload to Pinata (public file)
      const result = await this.pinata.upload.public.file(file)

      // Construct gateway URL
      // If pinataGatewayUrl is set, use it directly (e.g., 'example.mypinata.cloud')
      // Otherwise fall back to the public gateway
      let imageUrl: string
      if (env.pinataGatewayUrl) {
        // Dedicated gateway format: https://gateway.mypinata.cloud/ipfs/{cid}
        const gateway = env.pinataGatewayUrl.replace(/\/$/, '') // Remove trailing slash
        imageUrl = gateway.includes('/ipfs') ? `${gateway}/${result.cid}` : `https://${gateway}/ipfs/${result.cid}`
      } else {
        // Public gateway fallback
        imageUrl = `https://gateway.pinata.cloud/ipfs/${result.cid}`
      }

      loggers.server.info({ cid: result.cid, fileId: result.id, filename }, 'Image uploaded to IPFS')

      return {
        success: true,
        url: imageUrl,
        cid: result.cid,
        fileId: result.id,
      }
    } catch (error) {
      loggers.server.error({ error: String(error) }, 'IPFS upload failed')
      return {
        success: false,
        error: 'Failed to upload image to IPFS',
      }
    }
  }

  /**
   * Delete (unpin) an image from Pinata
   * Note: This removes it from Pinata's storage.
   * The file may still exist on IPFS if pinned elsewhere.
   * @param fileId - The Pinata file ID (returned from upload as fileId)
   * @returns true if successfully deleted
   */
  async deleteImage(fileId: string): Promise<boolean> {
    if (!this.pinata) {
      return false
    }

    try {
      await this.pinata.files.public.delete([fileId])
      loggers.server.info({ fileId }, 'Image deleted from Pinata')
      return true
    } catch (error) {
      loggers.server.error({ error: String(error), fileId }, 'Failed to delete image')
      return false
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const imageStorageService = new ImageStorageService()
