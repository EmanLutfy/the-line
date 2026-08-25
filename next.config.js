/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `output: 'export'` was removed on purpose.
  // A static export has no server, so POST /api/draw could never run.
  // If THE DRAW is ever dropped, this can go back to a static export.
  images: {
    unoptimized: true,
  },
  transpilePackages: ['three'],
}

module.exports = nextConfig
