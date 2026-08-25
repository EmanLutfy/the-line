import { getPublicDrawConfig, submitWishlistEntry } from '../../wishlist/wishlistService'

// The draw must never be cached or prerendered: every POST is a distinct,
// server-owned outcome and duplicate checks have to hit live state.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const draw = await getPublicDrawConfig()
  if (!draw) return Response.json({ code: 'DRAW_UNAVAILABLE' }, { status: 503 })
  return Response.json({ draw })
}

export async function POST(request) {
  try {
    const body = await request.json()

    // Open by default. If WISHLIST_REQUIRE_AUTH is ever switched on, this is
    // where the verified account id has to come from.
    const verifiedId = null

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
