const fs = require("fs");
const path = require("path");

const upstreamTransformer = require("@expo/metro-config/babel-transformer");

function detectExpoVersion() {
  try {
    const expoPackagePath = path.join(process.cwd(), "node_modules", "expo", "package.json");
    if (fs.existsSync(expoPackagePath)) {
      const expoPackage = JSON.parse(fs.readFileSync(expoPackagePath, "utf8"));
      const version = expoPackage.version;
      if (typeof version === "string" && version.startsWith("54.")) {
        return "54";
      }
      if (typeof version === "string" && version.startsWith("53.")) {
        return "53";
      }
    }
  } catch {
    // Fall through to SDK 54; this project is pinned to Expo 54.
  }

  return "54";
}

function isRootLayout(filename) {
  return (
    (filename.includes("app/_layout.tsx") || filename.includes("app/_layout.js")) &&
    !filename.includes("app/(")
  );
}

function wrapLayoutWithProviders(src, environment) {
  const defaultExportPattern = /export\s+default\s+function\s+(\w+)/;
  const match = src.match(defaultExportPattern);

  if (!match) {
    return src;
  }

  const originalFunctionName = match[1];
  let transformed = src.replace(defaultExportPattern, `function ${originalFunctionName}`);
  const wrappers = [];

  if (environment === "development") {
    const version = detectExpoVersion();
    const devImport =
      version === "54"
        ? "import { RorkDevWrapper } from '@rork-ai/toolkit-sdk/v54';"
        : "import { RorkDevWrapper } from '@rork-ai/toolkit-sdk/v53';";

    wrappers.push({
      import: devImport,
      name: "RorkDevWrapper",
    });
  }

  wrappers.push({
    import: "import { RorkAnalyticsProvider } from '@rork-ai/toolkit-sdk';",
    name: "RorkAnalyticsProvider",
  });

  for (const wrapper of wrappers) {
    transformed = `${wrapper.import}\n${transformed}`;
  }

  let wrappedComponent = `<${originalFunctionName} />`;
  for (const wrapper of wrappers) {
    wrappedComponent = `<${wrapper.name}>${wrappedComponent}</${wrapper.name}>`;
  }

  return `${transformed}\n\nexport default function RorkRootLayoutWrapper() {
  return (
    ${wrappedComponent}
  );
}\n`;
}

async function transform(props) {
  const environment =
    (props.options?.dev ?? process.env.NODE_ENV === "development")
      ? "development"
      : "production";

  if (isRootLayout(props.filename)) {
    const transformedSrc = wrapLayoutWithProviders(props.src, environment);
    return upstreamTransformer.transform({ ...props, src: transformedSrc });
  }

  return upstreamTransformer.transform(props);
}

module.exports = { transform };
