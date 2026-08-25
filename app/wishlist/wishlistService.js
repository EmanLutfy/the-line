import { createClient } from '@supabase/supabase-js'

export const DRAW_ID = 'the-line-wishlist-001'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// With credentials present every entry goes through Postgres, where a unique
// constraint makes a duplicate physically impossible. Without them we fall back
// to an in-memory store: fine for local work, never for a live list, because it
// is wiped on restart and each serverless instance keeps its own copy.
export const usingDatabase = Boolean(supabaseUrl && supabaseKey)

// A plain top-level import on purpose. Hiding the specifier from the bundler
// also hides it from dependency tracing, so the package never reaches the
// serverless bundle and the import throws at runtime in production.
let client = null
async function db() {
  if (!client) client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  return client
}

export function normalizeWalletAddress(value) {
  return String(value || '').trim().toLowerCase()
}

// Stored without the @ and lowercased, so the same person typing "@Name" and
// "name" reads as one row during review.
export function normalizeTwitterHandle(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase()
}

// Mirror for reading by eye, never the ledger. Written after the entry is
// committed; a failure here is swallowed because the row can be rebuilt from
// /api/wishlist/export, while a lost entry cannot be rebuilt from anywhere.
async function mirrorToSheet(row) {
  const url = process.env.SHEETS_WEBHOOK_URL
  if (!url) return
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.SHEETS_SHARED_SECRET || '', ...row }),
      signal: AbortSignal.timeout(6000),
    })
    // A wrong shared secret still returns HTTP 200, so the body has to be read.
    // Without this the mirror fails completely silently.
    const text = await response.text()
    if (!response.ok || !text.includes('"ok":true')) {
      console.warn('[wishlist] sheet mirror rejected:', response.status, text.slice(0, 200))
    }
  } catch (error) {
    console.warn('[wishlist] sheet mirror failed:', error.message)
  }
}

/* ---------------------------------------------------------------- dev store */

function memoryStore() {
  // Lives on globalThis so it survives hot reloads, which also means a store
  // built by an older shape of this file can still be sitting there.
  const store = globalThis.__theLineWishlist
  if (!store || !(store.entries instanceof Map)) {
    globalThis.__theLineWishlist = { entries: new Map(), status: 'open' }
  }
  return globalThis.__theLineWishlist
}

/* -------------------------------------------------------------------- public */

export async function getPublicDrawConfig() {
  if (!usingDatabase) {
    const store = memoryStore()
    return { drawId: DRAW_ID, status: store.status, count: store.entries.size, persistent: false }
  }
  const client = await db()
  const [{ data: config }, { count }] = await Promise.all([
    client.from('wishlist_config').select('status').eq('draw_id', DRAW_ID).single(),
    client.from('wishlist_entry').select('id', { count: 'exact', head: true }).eq('draw_id', DRAW_ID),
  ])
  if (!config) return null
  return { drawId: DRAW_ID, status: config.status, count: count || 0, persistent: true }
}

export async function submitWishlistEntry(walletAddress, twitterHandle, verifiedId) {
  const wallet = normalizeWalletAddress(walletAddress)
  const twitter = normalizeTwitterHandle(twitterHandle)

  // Proves the shape of the string only, never that anyone owns it.
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return { ok: false, status: 400, code: 'INVALID_WALLET' }
  }
  // X allows 1-15 characters: letters, numbers, underscore.
  if (!/^[a-z0-9_]{1,15}$/.test(twitter)) {
    return { ok: false, status: 400, code: 'INVALID_HANDLE' }
  }

  // The wishlist is deliberately open: anyone can register, and the list is
  // reviewed by hand afterwards. Setting WISHLIST_REQUIRE_AUTH=true turns the
  // gate on, and then a verified account id must be supplied by the route.
  const requireAuth = process.env.WISHLIST_REQUIRE_AUTH === 'true'
  if (requireAuth && !verifiedId) {
    return { ok: false, status: 401, code: 'NOT_AUTHENTICATED' }
  }

  if (!usingDatabase) {
    const store = memoryStore()
    if (store.status !== 'open') return { ok: false, status: 409, code: 'DRAW_CLOSED' }
    if (store.entries.has(wallet)) return { ok: false, status: 409, code: 'ALREADY_ENTERED' }
    const position = store.entries.size + 1
    store.entries.set(wallet, { walletAddress: wallet, twitterHandle: twitter, position, createdAt: new Date().toISOString() })
    mirrorToSheet({ createdAt: new Date().toISOString(), position, walletAddress: wallet, twitterHandle: twitter })
    return { ok: true, status: 201, position }
  }

  const client = await db()

  const { data: config } = await client.from('wishlist_config').select('status').eq('draw_id', DRAW_ID).single()
  if (!config) return { ok: false, status: 503, code: 'DRAW_UNAVAILABLE' }
  if (config.status !== 'open') return { ok: false, status: 409, code: 'DRAW_CLOSED' }

  const { data, error } = await client
    .from('wishlist_entry')
    .insert({ draw_id: DRAW_ID, wallet_address: wallet, twitter_handle: twitter, ip_hash: null })
    .select('id')
    .single()

  if (error) {
    if (String(error.code) === '23505' || String(error.message).includes('duplicate key')) {
      return { ok: false, status: 409, code: 'ALREADY_ENTERED' }
    }
    console.error('[wishlist] insert failed:', error.message)
    return { ok: false, status: 500, code: 'DRAW_ERROR' }
  }

  // The bigserial id is the join order, so it is the position on the list.
  const position = data.id
  // Not awaited. Apps Script takes seconds and the sheet is only a mirror, so
  // it must never hold up the response. On a long-lived Node server this always
  // completes; on serverless a write can be dropped when the response returns,
  // and /api/wishlist/export rebuilds the sheet from the ledger.
  mirrorToSheet({ createdAt: new Date().toISOString(), position, walletAddress: wallet, twitterHandle: twitter })
  return { ok: true, status: 201, position }
}

export async function exportEntries() {
  if (!usingDatabase) return null
  const client = await db()
  const { data, error } = await client
    .from('wishlist_entry')
    .select('id,wallet_address,twitter_handle,created_at')
    .eq('draw_id', DRAW_ID)
    .order('id', { ascending: true })
  if (error) return null
  return data
}
