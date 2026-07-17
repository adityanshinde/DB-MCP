import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@modelcontextprotocol/server']
};

export default nextConfig;
