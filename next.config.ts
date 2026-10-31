import type { NextConfig } from "next";
const backend = process.env.GUARDIAN_BACKEND_ORIGIN;
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/*": [
      "./.env*",
      "./data/**/*",
      "./.git/**/*",
      "./.agents/**/*",
      "./work/**/*",
    ],
  },
  serverExternalPackages: ["pg"],
  async rewrites() {
    return backend
      ? [{ source: "/api/:path*", destination: `${backend}/api/:path*` }]
      : [];
  },
};
export default config;
