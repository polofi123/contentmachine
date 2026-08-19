import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is a stray package-lock.json and node_modules in C:\Users\paypo, and
  // Turbopack walks up looking for a workspace root. Pin it to this project so
  // it doesn't infer the home directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
