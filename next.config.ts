import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...config.externals, "@emurgo/cardano-serialization-lib-nodejs"];
    }

    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/blockchainwars-1e5ac.appspot.com/**',
      },
      {
        protocol: 'https',
        hostname: 'gameofblocks-tokens.s3.us-west-1.amazonaws.com',
      },
    ],
  },
};
export default nextConfig;
