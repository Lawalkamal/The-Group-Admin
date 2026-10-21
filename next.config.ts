import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Local checks use http://127.0.0.1, which dev mode treats as cross-origin.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // The floating dev badge sits on top of the phone UI.
  devIndicators: false,
  experimental: {
    serverActions: { bodySizeLimit: '256kb' },
  },
};

export default nextConfig;
