import { getPublicDrawConfig, submitWishlistEntry } from '../../wishlist/wishlistService'

// The draw must never be cached or prerendered: every POST is a distinct,
// server-owned outcome and duplicate checks have to hit live state.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cloudflare verifies the token server side. Without a secret configured this
// returns true, so local work and any environment without Turnstile keeps
// running exactly as before.
async function passesTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.append('remoteip', ip)
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(6000),
    })
    const result = await response.json()
    if (!result.success) console.warn('[wishlist] turnstile rejected:', result['error-codes'])
    return result.success === true
  } catch (error) {
    // A Cloudflare outage must not silently open the door.
    console.error('[wishlist] turnstile check failed:', error.message)
    return false
  }
}

export async function GET() {
  try {
    const draw = await getPublicDrawConfig()
    if (!draw) return Response.json({ code: 'DRAW_UNAVAILABLE' }, { status: 503 })
    return Response.json({ draw })
  } catch (error) {
    console.error('[wishlist] config read failed:', error)
    return Response.json({ code: 'DRAW_ERROR', detail: String(error && error.message) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()

    // Open by default. If WISHLIST_REQUIRE_AUTH is ever switched on, this is
    // where the verified account id has to come from.
    const verifiedId = null

    // The client IP is only forwarded to Cloudflare for this check; it is never
    // stored with the entry.
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    if (!(await passesTurnstile(body?.turnstileToken, ip))) {
      return Response.json({ code: 'VERIFICATION_FAILED' }, { status: 403 })
    }

    const result = await submitWishlistEntry(body?.walletAddress, body?.twitterHandle, verifiedId)

    if (!result.ok) {
      return Response.json({ code: result.code }, { status: result.status })
    }

    return Response.json({ position: result.position }, { status: result.status })
  } catch (error) {
    // Swallowing this silently is what made the last failure so hard to read:
    // the browser saw a generic message and the real cause went nowhere.
    console.error('[wishlist] entry failed:', error)
    return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 })
  }
}
