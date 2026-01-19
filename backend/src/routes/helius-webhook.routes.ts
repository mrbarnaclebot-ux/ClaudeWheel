// ═══════════════════════════════════════════════════════════════════════════
// HELIUS WEBHOOK ROUTES
// Receives transaction notifications from Helius webhooks for reactive MM
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express'
import { loggers } from '../utils/logger'
import { processHeliusWebhook } from '../services/helius-webhook.service'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/webhooks/helius
 * Receives transaction events from Helius
 *
 * Helius sends enhanced transaction data when trades occur on monitored tokens
 * Optional auth via HELIUS_WEBHOOK_SECRET header for verification
 */
router.post('/helius', async (req: Request, res: Response) => {
  try {
    // Optional: Verify webhook authenticity using shared secret
    // Set HELIUS_WEBHOOK_SECRET env var to enable - Helius can send this in x-helius-secret header
    const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET
    if (webhookSecret) {
      const authHeader = req.headers['x-helius-secret'] as string | undefined
      // Also handle Bearer format if sent via Authorization header
      const bearerAuth = req.headers['authorization']?.toString().replace('Bearer ', '')
      const providedSecret = authHeader || bearerAuth
      if (providedSecret !== webhookSecret) {
        loggers.server.warn({ hasAuth: !!providedSecret }, 'Invalid webhook auth')
        return res.status(401).json({ error: 'Unauthorized' })
      }
    }

    // Helius can send an array of transactions
    const transactions = Array.isArray(req.body) ? req.body : [req.body]

    loggers.server.info({ count: transactions.length }, '📥 Received Helius webhook')

    // Process transactions asynchronously - respond immediately to avoid timeouts
    setImmediate(async () => {
      for (const tx of transactions) {
        try {
          await processHeliusWebhook(tx)
        } catch (error) {
          loggers.server.error({ error: String(error), signature: tx?.signature }, 'Error processing webhook transaction')
        }
      }
    })

    // Respond immediately to Helius
    return res.status(200).json({ success: true })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Helius webhook error')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/webhooks/helius/health
 * Health check for the webhook endpoint
 */
router.get('/helius/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', endpoint: 'helius-webhook' })
})

export default router
