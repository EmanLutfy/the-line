/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `output: 'export'` was removed on purpose.
  // A static export has no server, so POST /api/draw could never run.
  // If THE DRAW is ever dropped, this can go back to a static export.
  images: {
    unoptimized: true,
  },
  transpilePackages: ['three'],

  // The wishlist route was removed once the mint became burn-to-mint. Everyone
  // who registered still holds that link, and a 404 is a poor way to find out
  // the list is gone — send them to the thing that replaced it.
  async redirects() {
    return [
      { source: '/wishlist', destination: '/mint', permanent: false },
      { source: '/draw', destination: '/mint', permanent: false },
    ]
  },
}

module.exports = nextConfig
