const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = withRorkMetro(getDefaultConfig(__dirname));
const previousResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Supabase 2.106 ESM contains optional telemetry import() unsupported by Hermes.
  // Its published CommonJS entry provides the same API without that syntax.
  if (moduleName === "@supabase/supabase-js" && (platform === "ios" || platform === "android")) {
    return { type: "sourceFile", filePath: require.resolve("@supabase/supabase-js") };
  }
  return previousResolve
    ? previousResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;