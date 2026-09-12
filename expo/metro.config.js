const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = withRorkMetro(getDefaultConfig(__dirname));

// React Native 0.86 moved its private inspector modules from
// `src/private/inspector/` to `src/private/devsupport/devmenu/elementinspector/`.
// @rork-ai/toolkit-sdk's dev inspector still references the old paths, so remap
// them to the new location (same modules, same default exports, no behaviour change).
const RN_INSPECTOR_PATH_REMAPS = {
  "react-native/src/private/inspector/getInspectorDataForViewAtPoint":
    "react-native/src/private/devsupport/devmenu/elementinspector/getInspectorDataForViewAtPoint",
  "react-native/src/private/inspector/InspectorOverlay":
    "react-native/src/private/devsupport/devmenu/elementinspector/InspectorOverlay",
};

const previousResolveRequest = config.resolver.resolveRequest;

const resolveRequest = (context, moduleName, platform, options) => {
  const remapped = RN_INSPECTOR_PATH_REMAPS[moduleName];
  if (remapped) {
    return resolveRequest(context, remapped, platform, options);
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform, options);
  }
  return context.resolveRequest(context, moduleName, platform, options);
};

config.resolver.resolveRequest = resolveRequest;

module.exports = config;
