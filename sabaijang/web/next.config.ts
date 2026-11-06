import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: { '/api/**/*': ['../db/init/**/*'] },
  images: { unoptimized: false },
};

export default nextConfig;
