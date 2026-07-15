#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const webDirectory = join(repositoryRoot, "web");
const defaultGoOS = "linux";
const defaultGoArch = "amd64";
const defaultGoPackage = "./cmd/memos";
const baselineApplicationVersion = "source-baseline";

function targetVariant(options) {
  return options.goarm ? `v${options.goarm}` : "";
}

function targetPlatform(options) {
  return `${options.goos}/${options.goarch}${options.goarm ? `/${targetVariant(options)}` : ""}`;
}

function targetFileSuffix(options) {
  return `${options.goos}-${options.goarch}${targetVariant(options)}`;
}

function printUsage() {
  console.log(`Usage: node scripts/compliance/generate-third-party-materials.mjs [options]

Generate the human-readable third-party notices and a CycloneDX 1.6 source-build
SBOM from the linked Go modules and the installed pnpm production dependency tree.

Options:
  --goos <name>             Go target OS (default: ${defaultGoOS})
  --goarch <name>           Go target architecture (default: ${defaultGoArch})
  --goarm <5|6|7>           Go ARM variant; requires --goarch arm
  --go-package <path>       Go package whose linked modules are inventoried (default: ${defaultGoPackage})
  --cgo-enabled <0|1>       CGO setting used for dependency analysis (default: 0)
  --go-toolchain-version <v> Go binary build toolchain version recorded in the SBOM and notices
  --provenance <mode>       baseline (default) for tracked source materials, or release for an exact release artifact
  --application-version <v> Required with --provenance release; recorded for the MemoArk release artifact
  --notices-output <path>   Output path for THIRD_PARTY_NOTICES
  --sbom-output <path>      Output path for the CycloneDX JSON SBOM
  --check                   Fail instead of writing when either output is stale
  --help                    Show this help text

Before running, install the web dependencies from web/ with:
  corepack pnpm install --frozen-lockfile
`);
}

function parseArguments(argumentsList) {
  const options = {
    check: false,
    goos: defaultGoOS,
    goarch: defaultGoArch,
    goarm: "",
    goPackage: defaultGoPackage,
    cgoEnabled: "0",
    goToolchainVersion: "",
    provenance: "baseline",
    applicationVersion: "",
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help") {
      printUsage();
      process.exit(0);
    }
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (
      [
        "--goos",
        "--goarch",
        "--goarm",
        "--go-package",
        "--cgo-enabled",
        "--go-toolchain-version",
        "--provenance",
        "--application-version",
        "--notices-output",
        "--sbom-output",
      ].includes(argument)
    ) {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  for (const value of [options.goos, options.goarch]) {
    if (!/^[a-z0-9_]+$/i.test(value)) {
      throw new Error(`Invalid Go target value: ${value}`);
    }
  }
  if (options.goarm && (options.goarch !== "arm" || !/^[567]$/.test(options.goarm))) {
    throw new Error("--goarm must be 5, 6, or 7 and requires --goarch arm.");
  }
  if (!/^\.\/[A-Za-z0-9_./-]+$/.test(options.goPackage)) {
    throw new Error("--go-package must be a relative package path beginning with ./.");
  }
  if (!["0", "1"].includes(options.cgoEnabled)) {
    throw new Error("--cgo-enabled must be 0 or 1.");
  }
  if (options.goToolchainVersion && !/^go[0-9A-Za-z._+-]+$/.test(options.goToolchainVersion)) {
    throw new Error("Go toolchain version must begin with go, for example go1.26.2.");
  }
  if (!["baseline", "release"].includes(options.provenance)) {
    throw new Error("Provenance must be baseline or release.");
  }
  if (options.applicationVersion && !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(options.applicationVersion)) {
    throw new Error("Application version may contain only letters, numbers, dots, underscores, plus signs, and dashes.");
  }
  if (options.provenance === "release" && !options.applicationVersion) {
    throw new Error("--application-version is required with --provenance release.");
  }
  if (options.provenance === "baseline" && options.applicationVersion) {
    throw new Error("--application-version is only valid with --provenance release.");
  }

  options.noticesOutput = resolve(options.noticesOutput ?? join(repositoryRoot, "THIRD_PARTY_NOTICES"));
  options.sbomOutput = resolve(options.sbomOutput ?? join(repositoryRoot, "sbom", `memoark-source-${targetFileSuffix(options)}.cdx.json`));
  return options;
}

function commandOutput(command, argumentsList, options = {}) {
  const commandOptions = {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  };

  if (process.platform === "win32") {
    const commandLine = [command, ...argumentsList].join(" ");
    return execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], commandOptions).trim();
  }

  return execFileSync(command, argumentsList, commandOptions).trim();
}

function dockerGoToolchainVersion() {
  const dockerfile = readFileSync(join(repositoryRoot, "scripts", "Dockerfile"), "utf8");
  const match = dockerfile.match(/FROM\s+--platform=\$BUILDPLATFORM\s+golang:([0-9][0-9A-Za-z._+-]*)-alpine\s+AS\s+backend/i);
  if (!match) {
    throw new Error("Could not determine the Linux Go toolchain version from scripts/Dockerfile.");
  }
  return `go${match[1]}`;
}

function resolveGoBuildToolchainVersion(options) {
  if (options.goToolchainVersion) {
    return options.goToolchainVersion;
  }
  if (options.goos === "linux") {
    return dockerGoToolchainVersion();
  }
  return commandOutput("go", ["env", "GOVERSION"]);
}

function parseJSONStream(rawText) {
  const values = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        values.push(JSON.parse(rawText.slice(start, index + 1)));
        start = -1;
      }
    }
  }

  if (depth !== 0 || quoted) {
    throw new Error("Could not parse the JSON stream emitted by the dependency command.");
  }
  return values;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function deterministicUUID(seed) {
  const characters = sha256(seed).slice(0, 32).split("");
  characters[12] = "5";
  characters[16] = ((Number.parseInt(characters[16], 16) & 0x3) | 0x8).toString(16);
  const hex = characters.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object" && typeof value.type === "string" && value.type.trim()) {
    return value.type.trim();
  }
  return "";
}

function classifyLicense(licenseText) {
  const text = licenseText.toLowerCase().replace(/\s+/g, " ");
  if (text.includes("mozilla public license") && text.includes("version 2.0")) {
    return "MPL-2.0";
  }
  if (text.includes("apache license") && text.includes("version 2.0")) {
    return "Apache-2.0";
  }
  if (text.includes("redistribution and use in source and binary forms")) {
    if (text.includes("neither the name") && text.includes("nor the names of its contributors")) {
      return "BSD-3-Clause";
    }
    if (text.includes("this list of conditions") && text.includes("following disclaimer")) {
      return "BSD-2-Clause";
    }
  }
  if (text.includes("permission to use, copy, modify, and/or distribute this software for any purpose with or without fee")) {
    return "ISC";
  }
  if (text.includes("permission is hereby granted, free of charge, to any person obtaining a copy")) {
    return "MIT";
  }
  if (text.includes("boost software license")) {
    return "BSL-1.0";
  }
  if (text.includes("this is free and unencumbered software released into the public domain")) {
    return "Unlicense";
  }
  if (text.includes("the unlicense")) {
    return "Unlicense";
  }
  return "NOASSERTION";
}

function normalizeLicenseText(value) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function findLicenseFiles(directory) {
  const fileNames = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /(license|licence|copying|notice)/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return fileNames.map((fileName) => ({
    name: fileName,
    text: normalizeLicenseText(readFileSync(join(directory, fileName), "utf8")),
  }));
}

function componentPurl(ecosystem, name, version) {
  if (ecosystem === "npm") {
    const packageName = name.startsWith("@") ? `%40${name.slice(1)}` : name;
    return `pkg:npm/${packageName}@${encodeURIComponent(version)}`;
  }
  return `pkg:golang/${name}@${encodeURIComponent(version.replace(/^v/, ""))}`;
}

function componentFromPackage({ ecosystem, name, version, directory, declaredLicense, sourceURL }) {
  const licenseFiles = findLicenseFiles(directory);
  const detectedLicense = classifyLicense(licenseFiles.map((file) => file.text).join("\n\n"));
  const license = declaredLicense || detectedLicense;
  if (!license || license === "NOASSERTION") {
    throw new Error(
      `${ecosystem}:${name}@${version} has no declared or classifiable license; inspect ${licenseFiles.map((file) => file.name).join(", ") || "the package source"}.`,
    );
  }
  const purl = componentPurl(ecosystem, name, version);
  return {
    ecosystem,
    name,
    version,
    directory,
    license,
    licenseFiles,
    purl,
    sourceURL,
  };
}

function collectGoComponents(options) {
  const environment = {
    ...process.env,
    CGO_ENABLED: options.cgoEnabled,
    GOOS: options.goos,
    GOARCH: options.goarch,
  };
  delete environment.GOARM;
  if (options.goarm) {
    environment.GOARM = options.goarm;
  }
  const packageRecords = parseJSONStream(
    commandOutput("go", ["list", "-mod=readonly", "-deps", "-json", options.goPackage], { env: environment }),
  );
  const components = new Map();
  for (const packageRecord of packageRecords) {
    const moduleRecord = packageRecord.Module;
    if (!moduleRecord || moduleRecord.Main || !moduleRecord.Path || !moduleRecord.Version || !moduleRecord.Dir) {
      continue;
    }
    const key = `${moduleRecord.Path}@${moduleRecord.Version}`;
    if (components.has(key)) {
      continue;
    }
    components.set(
      key,
      componentFromPackage({
        ecosystem: "golang",
        name: moduleRecord.Path,
        version: moduleRecord.Version,
        directory: moduleRecord.Dir,
        declaredLicense: "",
        sourceURL: `https://pkg.go.dev/${moduleRecord.Path}@${moduleRecord.Version}`,
      }),
    );
  }
  return [...components.values()];
}

function collectGoRuntimeComponent({ analysisGoToolchainVersion, buildGoToolchainVersion, options }) {
  const goRoot = commandOutput("go", ["env", "GOROOT"]);
  const licensePaths = ["LICENSE", "PATENTS"].map((name) => join(goRoot, name));
  const missingLicenseFiles = licensePaths.filter((path) => !existsSync(path)).map((path) => basename(path));
  if (missingLicenseFiles.length > 0) {
    throw new Error(`Go toolchain directory ${goRoot} does not contain ${missingLicenseFiles.join(", ")}.`);
  }
  const licenseFiles = licensePaths.map((path) => ({
    name: basename(path),
    text: normalizeLicenseText(readFileSync(path, "utf8")),
  }));
  const license = classifyLicense(licenseFiles.map((file) => file.text).join("\n\n"));
  if (license !== "BSD-3-Clause") {
    throw new Error(`Could not classify the Go standard library license in ${goRoot}.`);
  }
  const version = buildGoToolchainVersion.replace(/^go/, "");
  const target = targetPlatform(options);
  const qualifiers = [`os=${encodeURIComponent(options.goos)}`, `arch=${encodeURIComponent(options.goarch)}`];
  if (options.goarm) {
    qualifiers.push(`variant=${encodeURIComponent(targetVariant(options))}`);
  }
  return {
    ecosystem: "golang-runtime",
    type: "framework",
    name: "Go standard library and runtime",
    version,
    directory: goRoot,
    license,
    licenseFiles,
    purl: `pkg:generic/go-runtime@${encodeURIComponent(version)}?${qualifiers.join("&")}`,
    sourceURL: "https://go.dev/LICENSE",
    properties: [
      { name: "memoark:synthetic", value: "true" },
      { name: "memoark:go-analysis-toolchain-version", value: analysisGoToolchainVersion },
      { name: "memoark:go-build-toolchain-version", value: buildGoToolchainVersion },
      { name: "memoark:go-target", value: target },
      { name: "memoark:go-license-sha256", value: sha256File(licensePaths[0]) },
      { name: "memoark:go-patents-sha256", value: sha256File(licensePaths[1]) },
    ],
  };
}

function collectNpmComponents() {
  const pnpmVersion = commandOutput("corepack", ["pnpm", "--version"], { cwd: webDirectory });
  const tree = JSON.parse(
    commandOutput("corepack", ["pnpm", "list", "--prod", "--json", "--depth", "Infinity"], { cwd: webDirectory }),
  )[0];
  const components = new Map();

  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.path && node.version) {
      const packageManifestPath = join(node.path, "package.json");
      if (!existsSync(packageManifestPath)) {
        // pnpm keeps platform-incompatible optional packages in the resolved graph but
        // does not install them. They are not part of this platform's browser build.
      } else {
        const manifest = JSON.parse(readFileSync(packageManifestPath, "utf8"));
        const name = manifest.name ?? node.from;
        const version = manifest.version ?? node.version;
        if (!name || !version) {
          throw new Error(`Could not read name and version from ${packageManifestPath}.`);
        }
        const key = `${name}@${version}`;
        if (!components.has(key)) {
          components.set(
            key,
            componentFromPackage({
              ecosystem: "npm",
              name,
              version,
              directory: node.path,
              declaredLicense: normalizeLicense(manifest.license),
              sourceURL: node.resolved ?? `https://www.npmjs.com/package/${name}/v/${version}`,
            }),
          );
        }
      }
    }
    for (const dependency of Object.values(node.dependencies ?? {})) {
      visit(dependency);
    }
  }

  visit(tree);
  return { components: [...components.values()], pnpmVersion };
}

const spdxLicenseIdentifiers = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSL-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Unlicense",
]);

function licenseEntries(component) {
  if (spdxLicenseIdentifiers.has(component.license)) {
    return [{ license: { id: component.license } }];
  }
  const expressionIdentifiers = component.license.match(/[A-Za-z0-9][A-Za-z0-9.-]*/g) ?? [];
  if (
    expressionIdentifiers.length > 1 &&
    expressionIdentifiers.every((identifier) => identifier === "AND" || identifier === "OR" || spdxLicenseIdentifiers.has(identifier))
  ) {
    return [{ expression: component.license }];
  }
  return [{ license: { name: component.license } }];
}

function spdxIdentifiersInLicense(license) {
  return [
    ...new Set(
      (license.match(/[A-Za-z0-9][A-Za-z0-9.-]*/g) ?? []).filter((identifier) => spdxLicenseIdentifiers.has(identifier)),
    ),
  ];
}

function isCanonicalLicenseText(identifier, value) {
  const text = value.replace(/\r\n/g, "\n").trim();
  const opening = text.slice(0, 2048);
  switch (identifier) {
    case "MIT":
      return /^(?:the )?mit license\b/i.test(opening) && /permission is hereby granted, free of charge/i.test(opening);
    case "Apache-2.0":
      return /^apache license\s*\n\s*version 2\.0,/i.test(opening) && /terms and conditions for use, reproduction, and distribution/i.test(text);
    case "BSD-3-Clause":
      return (
        /^copyright[^\n]*\n\s*\n?redistribution and use in source and binary forms/i.test(opening) &&
        /neither the name of/i.test(text) &&
        /following disclaimer/i.test(text)
      );
    case "BSD-2-Clause":
      return (
        /^copyright[^\n]*\n\s*\n?redistribution and use in source and binary forms/i.test(opening) &&
        !/neither the name of/i.test(text) &&
        /following disclaimer/i.test(text)
      );
    case "ISC":
      return /^(?:isc license\s*\n\s*)?copyright/i.test(opening) && /permission to use, copy, modify, and\/or distribute/i.test(text);
    case "BSL-1.0":
      return /^boost software license - version 1\.0/i.test(opening);
    case "Unlicense":
      return /^this is free and unencumbered software released into the public domain/i.test(opening);
    case "MPL-2.0":
      return /^mozilla public license version 2\.0/i.test(opening);
    case "0BSD":
      return /^permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(opening);
    default:
      return false;
  }
}

function collectSharedLicenseTexts(components) {
  const texts = new Map();
  for (const component of components) {
    for (const file of component.licenseFiles) {
      const identifier = classifyLicense(file.text);
      if (!spdxLicenseIdentifiers.has(identifier) || file.text.length < 300 || !isCanonicalLicenseText(identifier, file.text)) {
        continue;
      }
      const existing = texts.get(identifier);
      if (!existing || file.text.length < existing.text.length) {
        texts.set(identifier, { sourceComponent: `${component.ecosystem}:${component.name}@${component.version}`, text: file.text });
      }
    }
  }
  return texts;
}

function cyclonedxComponent(component) {
  return {
    type: component.type ?? "library",
    "bom-ref": component.purl,
    name: component.name,
    version: component.version.replace(/^v/, ""),
    purl: component.purl,
    scope: "required",
    licenses: licenseEntries(component),
    externalReferences: [{ type: "distribution", url: component.sourceURL }],
    properties: [
      { name: "memoark:ecosystem", value: component.ecosystem },
      { name: "memoark:license-files", value: component.licenseFiles.map((file) => file.name).join(", ") },
      ...(component.properties ?? []),
    ],
  };
}

function buildSBOM({
  analysisGoToolchainVersion,
  applicationVersion,
  buildGoToolchainVersion,
  components,
  options,
  hashes,
  pnpmVersion,
  releaseProvenance,
}) {
  const inputFingerprint = JSON.stringify({
    applicationVersion,
    hashes,
    goarch: options.goarch,
    goarm: options.goarm,
    goos: options.goos,
    goPackage: options.goPackage,
    cgoEnabled: options.cgoEnabled,
    analysisGoToolchainVersion,
    buildGoToolchainVersion,
    provenance: options.provenance,
    gitRevision: releaseProvenance?.gitRevision ?? "",
    pnpmVersion,
    components: components.map((component) => `${component.ecosystem}:${component.name}@${component.version}:${component.license}`),
  });
  const rootPurl = `pkg:generic/memoark@${applicationVersion}`;
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${deterministicUUID(inputFingerprint)}`,
    version: 1,
    metadata: {
      ...(releaseProvenance ? { timestamp: releaseProvenance.gitTimestamp } : {}),
      tools: {
        components: [{ type: "application", name: "MemoArk compliance generator", version: "1.0.0" }],
      },
      component: {
        type: "application",
        "bom-ref": rootPurl,
        name: "MemoArk",
        version: applicationVersion,
        purl: rootPurl,
        licenses: [{ license: { id: "MIT" } }],
      },
      properties: [
        { name: "memoark:scope", value: "source-build-inputs" },
        { name: "memoark:provenance", value: options.provenance },
        ...(releaseProvenance
          ? [
              { name: "memoark:application-version", value: applicationVersion },
              { name: "memoark:git-revision", value: releaseProvenance.gitRevision },
            ]
          : []),
        { name: "memoark:go-target", value: targetPlatform(options) },
        { name: "memoark:go-package", value: options.goPackage },
        { name: "memoark:cgo-enabled", value: options.cgoEnabled },
        { name: "memoark:go.mod-sha256", value: hashes.goMod },
        { name: "memoark:go.sum-sha256", value: hashes.goSum },
        { name: "memoark:package.json-sha256", value: hashes.packageJson },
        { name: "memoark:pnpm-lock-sha256", value: hashes.pnpmLock },
        { name: "memoark:pnpm-version", value: pnpmVersion },
        { name: "memoark:go-analysis-toolchain-version", value: analysisGoToolchainVersion },
        { name: "memoark:go-build-toolchain-version", value: buildGoToolchainVersion },
        { name: "memoark:go-runtime-license-sha256", value: sha256File(join(commandOutput("go", ["env", "GOROOT"]), "LICENSE")) },
        { name: "memoark:go-runtime-patents-sha256", value: sha256File(join(commandOutput("go", ["env", "GOROOT"]), "PATENTS")) },
      ],
    },
    components: components.map(cyclonedxComponent),
    dependencies: [
      {
        ref: rootPurl,
        dependsOn: components.map((component) => component.purl),
      },
    ],
  };
}

function buildNotices({
  analysisGoToolchainVersion,
  applicationVersion,
  buildGoToolchainVersion,
  components,
  options,
  hashes,
  pnpmVersion,
  releaseProvenance,
}) {
  const sharedLicenseTexts = collectSharedLicenseTexts(components);
  const operatingSystemInventoryLine =
    options.goos === "linux"
      ? "- Alpine and other container operating-system packages are outside this notice file and are inventoried separately in the matching Linux image SBOM release record."
      : "- Operating-system packages and image SBOMs are outside this native application notice.";
  const provenanceLines = releaseProvenance
    ? [`- application version: ${applicationVersion}`, `- git revision: ${releaseProvenance.gitRevision}`]
    : ["- release provenance: source baseline; exact application version and Git revision are recorded only in release artifacts."];
  const referencedSharedLicenseIdentifiers = new Set();
  const indexRows = components.map((component) => {
    const escapedName = component.name.replace(/\|/g, "\\|");
    const escapedLicense = component.license.replace(/\|/g, "\\|");
    return `| ${component.ecosystem} | ${escapedName} | ${component.version} | ${escapedLicense} | \`${component.purl}\` |`;
  });
  const licenseSections = components.flatMap((component) => {
    const header = [
      `## ${component.ecosystem}: ${component.name}@${component.version}`,
      "",
      `- Declared or detected license: ${component.license}`,
      `- Source: ${component.sourceURL}`,
      `- License files: ${component.licenseFiles.map((file) => file.name).join(", ") || "not included in the distributed package"}`,
      "",
    ];
    if (component.licenseFiles.length === 0) {
      const sharedIdentifiers = spdxIdentifiersInLicense(component.license).filter((identifier) => sharedLicenseTexts.has(identifier));
      for (const identifier of sharedIdentifiers) {
        referencedSharedLicenseIdentifiers.add(identifier);
      }
      return [
        ...header,
        sharedIdentifiers.length > 0
          ? `The distributed package declares the license above in package.json but does not include a top-level license file. A canonical text for ${sharedIdentifiers.join(", ")} is reproduced in the shared appendix; package-specific attribution remains available from the source link above.`
          : "The distributed package declares the license above in package.json but does not include a top-level license file. Retain the source link above for package-specific attribution and retrieve any required package-specific text before commercial publication.",
        "",
      ];
    }
    const texts = component.licenseFiles.flatMap((file) => [
      `### ${file.name}`,
      "",
      "```text",
      file.text,
      "```",
      "",
    ]);
    return [...header, ...texts];
  });
  const sharedLicenseSections = [...referencedSharedLicenseIdentifiers]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((identifier) => {
      const reference = sharedLicenseTexts.get(identifier);
      return [
        `## ${identifier}`,
        "",
        `A canonical local copy was supplied by ${reference.sourceComponent}.`,
        "",
        "```text",
        reference.text,
        "```",
        "",
      ];
    });
  return [
    "MemoArk Application Source Third-Party Notices",
    "===============================================",
    "",
    "This file is generated by scripts/compliance/generate-third-party-materials.mjs.",
    "It records the MemoArk application source dependencies' declared or detected license and preserves any top-level license text supplied with a component.",
    "",
    "Scope:",
    `- Go modules linked by ${options.goPackage} for ${targetPlatform(options)} with CGO_ENABLED=${options.cgoEnabled}, plus the statically linked Go standard library and runtime.`,
    "- Packages in the resolved pnpm production dependency tree used to build the embedded browser application.",
    operatingSystemInventoryLine,
    "",
    "The source-build component inventory is in the matching CycloneDX file under sbom/.",
    "The source SBOM is intentionally a build-input inventory; the image SBOM is the artifact inventory for the Linux container.",
    "",
    "Generation inputs:",
    ...provenanceLines,
    `- Go target: ${targetPlatform(options)}`,
    `- Go dependency analysis toolchain: ${analysisGoToolchainVersion}`,
    `- Go binary build toolchain: ${buildGoToolchainVersion}`,
    `- pnpm: ${pnpmVersion}`,
    `- go.mod SHA-256: ${hashes.goMod}`,
    `- go.sum SHA-256: ${hashes.goSum}`,
    `- web/package.json SHA-256: ${hashes.packageJson}`,
    `- web/pnpm-lock.yaml SHA-256: ${hashes.pnpmLock}`,
    "",
    "## Component index",
    "",
    "| Ecosystem | Component | Version | License | Package URL |",
    "| --- | --- | --- | --- | --- |",
    ...indexRows,
    "",
    "# License texts",
    "",
    ...licenseSections,
    "# Shared canonical license texts for packages without an included file",
    "",
    ...sharedLicenseSections,
  ].join("\n");
}

function writeOrCheck(path, content, check) {
  const normalizedContent = `${content.trimEnd()}\n`;
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8").replace(/\r\n/g, "\n") !== normalizedContent) {
      throw new Error(`${relative(repositoryRoot, path)} is stale. Run the generator without --check.`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, normalizedContent, "utf8");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const hashes = {
    goMod: sha256File(join(repositoryRoot, "go.mod")),
    goSum: sha256File(join(repositoryRoot, "go.sum")),
    packageJson: sha256File(join(webDirectory, "package.json")),
    pnpmLock: sha256File(join(webDirectory, "pnpm-lock.yaml")),
  };
  const releaseProvenance =
    options.provenance === "release"
      ? {
          gitRevision: commandOutput("git", ["rev-parse", "HEAD"]),
          gitTimestamp: commandOutput("git", ["show", "-s", "--format=%cI", "HEAD"]),
        }
      : null;
  const analysisGoToolchainVersion = commandOutput("go", ["env", "GOVERSION"]);
  const buildGoToolchainVersion = resolveGoBuildToolchainVersion(options);
  const goComponents = [
    ...collectGoComponents(options),
    collectGoRuntimeComponent({ analysisGoToolchainVersion, buildGoToolchainVersion, options }),
  ];
  const { components: npmComponents, pnpmVersion } = collectNpmComponents();
  const components = [...goComponents, ...npmComponents].sort((left, right) => {
    return `${left.ecosystem}:${left.name}@${left.version}`.localeCompare(`${right.ecosystem}:${right.name}@${right.version}`);
  });

  if (components.some((component) => ["react-leaflet", "@react-leaflet/core", "react-leaflet-cluster"].includes(component.name))) {
    throw new Error("Removed React Leaflet packages appeared in the production dependency tree.");
  }

  const applicationVersion = options.provenance === "release" ? options.applicationVersion : baselineApplicationVersion;
  const sbom = buildSBOM({
    analysisGoToolchainVersion,
    applicationVersion,
    buildGoToolchainVersion,
    components,
    options,
    hashes,
    pnpmVersion,
    releaseProvenance,
  });
  const notices = buildNotices({
    analysisGoToolchainVersion,
    applicationVersion,
    buildGoToolchainVersion,
    components,
    options,
    hashes,
    pnpmVersion,
    releaseProvenance,
  });
  writeOrCheck(options.noticesOutput, notices, options.check);
  writeOrCheck(options.sbomOutput, JSON.stringify(sbom, null, 2), options.check);
  console.log(
    `${options.check ? "Verified" : "Generated"} ${options.provenance} materials for ${components.length} components (${goComponents.length} Go modules/runtime, ${npmComponents.length} npm):\n- ${relative(repositoryRoot, options.noticesOutput)}\n- ${relative(repositoryRoot, options.sbomOutput)}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
