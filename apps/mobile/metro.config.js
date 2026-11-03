// Expo's default config detects the npm workspace (packages/core) automatically.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
