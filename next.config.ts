import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/", destination: "/pt-BR", permanent: false }];
  },
};

export default nextConfig;
