import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const DEV_DIST_DIR = ".next-dev";
const PROD_DIST_DIR = ".next";

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? DEV_DIST_DIR : PROD_DIST_DIR,
});

export default nextConfig;
