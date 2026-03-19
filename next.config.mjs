/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained Node.js server in .next/standalone/
  // Required for Docker deployment — this is what the container runs.
  output: 'standalone',
};

export default nextConfig;
