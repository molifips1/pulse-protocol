/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      '@react-native-async-storage/async-storage': './lib/asyncStorageShim.ts',
    },
  },
}

module.exports = nextConfig
