/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      '@react-native-async-storage/async-storage': './lib/asyncStorageShim.ts',
    },
  },
}

module.exports = nextConfig
