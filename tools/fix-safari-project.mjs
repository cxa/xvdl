import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const projectPath = join(root, "Safari", "XVDL", "XVDL.xcodeproj", "project.pbxproj");
const appTargetDir = join(root, "Safari", "XVDL", "XVDL");
const extensionTargetDir = join(root, "Safari", "XVDL", "XVDL Extension");
const safariTemplateDir = join(root, "tools", "safari");
const project = await readFile(projectPath, "utf8");

let fixed = project
  .replaceAll("PRODUCT_BUNDLE_IDENTIFIER = com.realazy.XVDL;", "PRODUCT_BUNDLE_IDENTIFIER = com.realazy.xvdl;")
  .replaceAll("PRODUCT_BUNDLE_IDENTIFIER = com.realazy.XVDL.Extension;", "PRODUCT_BUNDLE_IDENTIFIER = com.realazy.xvdl.Extension;")
  .replace(/MACOSX_DEPLOYMENT_TARGET = 2[0-9](?:\.\d+)?;/g, "MACOSX_DEPLOYMENT_TARGET = 15.0;");

fixed = updateBuildConfigurations(fixed, "INFOPLIST_FILE = XVDL/Info.plist;", {
  CODE_SIGN_ENTITLEMENTS: "XVDL/XVDL.entitlements",
  CODE_SIGN_INJECT_BASE_ENTITLEMENTS: "NO",
  ENABLE_OUTGOING_NETWORK_CONNECTIONS: "YES",
  ENABLE_USER_SELECTED_FILES: "readonly"
});

fixed = updateBuildConfigurations(fixed, 'INFOPLIST_FILE = "XVDL Extension/Info.plist";', {
  CODE_SIGN_ENTITLEMENTS: '"XVDL Extension/XVDL Extension.entitlements"',
  CODE_SIGN_INJECT_BASE_ENTITLEMENTS: "NO",
  ENABLE_OUTGOING_NETWORK_CONNECTIONS: "YES",
  ENABLE_USER_SELECTED_FILES: "readonly"
});

if (fixed !== project) {
  await writeFile(projectPath, fixed);
  console.log("Fixed Safari project bundle identifier, deployment target, and release entitlements.");
}

await mkdir(appTargetDir, { recursive: true });
await writeFile(
  join(appTargetDir, "XVDL.entitlements"),
  await readFile(join(safariTemplateDir, "XVDL.entitlements"), "utf8")
);

await mkdir(extensionTargetDir, { recursive: true });
await writeFile(
  join(extensionTargetDir, "SafariWebExtensionHandler.swift"),
  await readFile(join(safariTemplateDir, "SafariWebExtensionHandler.swift"), "utf8")
);
await writeFile(
  join(extensionTargetDir, "XVDL Extension.entitlements"),
  await readFile(join(safariTemplateDir, "XVDL Extension.entitlements"), "utf8")
);

function updateBuildConfigurations(input, infoplistLine, settings) {
  const configurationPattern = /(\t\t[A-Z0-9]+ \/\* (?:Debug|Release) \*\/ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n)([\s\S]*?)(\n\t\t\t};\n\t\t\tname = (?:Debug|Release);\n\t\t};)/g;
  let matched = 0;

  const output = input.replace(configurationPattern, (block, prefix, body, suffix) => {
    if (!body.includes(infoplistLine)) {
      return block;
    }

    matched += 1;
    let nextBody = body;
    for (const [key, value] of Object.entries(settings)) {
      nextBody = setBuildSetting(nextBody, key, value);
    }

    return `${prefix}${nextBody}${suffix}`;
  });

  if (matched === 0) {
    throw new Error(`Could not find build settings for ${infoplistLine}`);
  }

  return output;
}

function setBuildSetting(body, key, value) {
  const lines = body.split("\n");
  const settingPattern = new RegExp(`^\\t\\t\\t\\t${escapeRegExp(key)} = [^;]+;$`);
  const line = `\t\t\t\t${key} = ${value};`;

  const existingIndex = lines.findIndex((candidate) => settingPattern.test(candidate));
  if (existingIndex >= 0) {
    lines[existingIndex] = line;
    return lines.join("\n");
  }

  const codeSignStyleIndex = lines.findIndex((candidate) => candidate.trim() === "CODE_SIGN_STYLE = Automatic;");
  if (codeSignStyleIndex >= 0) {
    lines.splice(codeSignStyleIndex, 0, line);
    return lines.join("\n");
  }

  lines.unshift(line);
  return lines.join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
