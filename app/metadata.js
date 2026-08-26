// Relative image paths in openGraph need an absolute base, or the preview on X
// resolves against nothing and shows no image at all. Set NEXT_PUBLIC_SITE_URL
// to the real domain in the host's environment variables.
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'),
  title: 'The Line.',
  description: 'A minimalist study of line, space and formation. 3,333 unique works.',
  openGraph: {
    title: 'The Line — A study in line and space',
    description: '3,333 unique studies of line, space and formation.',
    type: 'website',
    images: ['/images/the-line-field.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Line — A study in line and space',
    description: '3,333 unique studies of line, space and formation.',
    images: ['/images/the-line-field.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}
