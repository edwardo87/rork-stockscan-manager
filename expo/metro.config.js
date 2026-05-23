const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = withRorkMetro(getDefaultConfig(__dirname));

config.transformer = {
  ...config.transformer,
  babelTransformerPath: path.resolve(__dirname, "rork-metro-transformer.js"),
};

module.exports = config;
