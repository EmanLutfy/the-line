/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `output: 'export'` was removed on purpose.
  // A static export has no server, so POST /api/draw could never run.
  // If THE DRAW is ever dropped, this can go back to a static export.
  images: {
    unoptimized: true,
  },
  transpilePackages: ['three'],

  // Development only, and ignored in production. Next 16 blocks cross-origin
  // requests to dev resources by default, so opening the dev server from a
  // phone on the same wifi silently fails to load any JavaScript — the page
  // renders its initial HTML and then nothing ever hydrates.
  //
  // This is the LAN address of the machine running `next dev`. A router that
  // hands out a different lease will need this updated; the address is printed
  // as "Network:" when the dev server starts.
  allowedDevOrigins: ['192.168.0.185'],

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
