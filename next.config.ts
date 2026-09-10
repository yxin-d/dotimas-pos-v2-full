import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: intentionally NOT using output: 'export'. This app relies on
  // middleware (route-protection redirects) and Server Actions
  // (checkout in pos/action.ts) — neither works with static export.
  // Vercel runs full Next.js natively, so there's no reason to opt
  // into the static-export subset here.
};

export default nextConfig;
