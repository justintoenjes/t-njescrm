/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  async headers() {
    return [{
      source: '/:path(apple-touch-icon\\.png|apple-touch-icon-precomposed\\.png|icon-512\\.png)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
      ],
    }];
  },
};

export default nextConfig;
