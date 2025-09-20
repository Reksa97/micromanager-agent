import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { execSync } from "child_process";

const DEV_DIST_DIR = ".next-dev";
const PROD_DIST_DIR = ".next";

// Get git commit hash
const getGitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
};

// Get git branch
const getGitBranch = () => {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  } catch {
    return "unknown";
  }
};

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? DEV_DIST_DIR : PROD_DIST_DIR,
  transpilePackages: ['click-to-react-component-dev'],
  env: {
    NEXT_PUBLIC_GIT_HASH: getGitHash(),
    NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_ENV: phase === PHASE_DEVELOPMENT_SERVER ? "development" : "production",
  },
});

export default nextConfig;
