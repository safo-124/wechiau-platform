const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Lets the app import Drizzle's .sql migration files.
config.resolver.sourceExts.push('sql');

module.exports = config;
