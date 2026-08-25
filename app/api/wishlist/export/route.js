import { exportEntries } from '../../../wishlist/wishlistService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The winner list, as CSV. Guarded by a shared secret in the request header —
// never a query string, which would end up in server and browser logs.
export async function GET(request) {
  const expected = process.env.ADMIN_EXPORT_TOKEN
  if (!expected) return Response.json({ code: 'EXPORT_DISABLED' }, { status: 503 })
  if (request.headers.get('x-admin-token') !== expected) {
    return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const rows = await exportEntries()
  if (!rows) return Response.json({ code: 'NO_DATABASE' }, { status: 503 })

  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = ['position,created_at,wallet_address,twitter_handle']
    .concat(rows.map(row => [row.id, row.created_at, row.wallet_address, row.twitter_handle].map(escape).join(',')))
    .join('\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="the-line-wishlist.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
