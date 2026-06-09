import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/orch',
  devIndicators: false,
  turbopack: {
    root: '../../',
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/users',
        destination: '/settings',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
