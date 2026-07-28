/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kelvyntube/ui', '@kelvyntube/shared'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  /**
   * Les packages partagés (`@kelvyntube/shared`, `@kelvyntube/db`) sont écrits
   * en ESM strict : leurs imports internes portent l'extension `.js` alors que
   * les fichiers sur disque sont en `.ts`. Node et tsx résolvent cela nativement,
   * pas webpack — d'où cet alias d'extension.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  async rewrites() {
    // Proxy des appels API en développement (évite les soucis de cookies cross-origin)
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
