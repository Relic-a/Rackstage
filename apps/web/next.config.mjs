import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// The monorepo keeps one ignored .env at the workspace root while Next runs
// from apps/web. Load that file so Clerk and the server integrations receive
// the same configuration in local builds and development.
const { combinedEnv } = loadEnvConfig(fileURLToPath(new URL("../../", import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the workspace-root public key available to Clerk's client bundle.
  env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: combinedEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY },
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
