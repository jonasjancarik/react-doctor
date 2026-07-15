#!/usr/bin/env node

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SKILL_PATH = path.join(REPOSITORY_ROOT, "skills/react-doctor/SKILL.md");
const EXPLAIN_PATH = path.join(
  REPOSITORY_ROOT,
  "skills/react-doctor/references/explain.md",
);
const METADATA_PATH = path.join(
  REPOSITORY_ROOT,
  ".github/react-doctor-skill-update.json",
);

const UPSTREAM_REPOSITORY = "millionco/react-doctor";
const UPSTREAM_API = `https://api.github.com/repos/${UPSTREAM_REPOSITORY}`;
const REGISTRY_PACKAGE = "https://registry.npmjs.org/react-doctor";
const MINIMUM_RELEASE_AGE_HOURS = 48;
const CUSTOM_SECTION_START = "<!-- personal-react-doctor-skill:start -->";
const CUSTOM_SECTION_END = "<!-- personal-react-doctor-skill:end -->";
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const UPSTREAM_COMMAND_PATTERN = /npx(?:\s+(?:--yes|-y))?\s+react-doctor@latest/g;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertExactVersion(version) {
  assert(
    typeof version === "string" && EXACT_VERSION_PATTERN.test(version),
    `Expected an exact react-doctor version, received ${JSON.stringify(version)}`,
  );
}

export function selectEligibleVersion(
  packument,
  now = new Date(),
  minimumAgeHours = MINIMUM_RELEASE_AGE_HOURS,
) {
  assert(
    Number.isFinite(minimumAgeHours) && minimumAgeHours >= 0,
    "Minimum release age must be a non-negative number of hours.",
  );
  assert(
    packument && typeof packument === "object",
    "npm returned an invalid package document.",
  );
  assert(
    packument.versions && packument.time,
    "npm package metadata is missing versions or publication times.",
  );

  const nowTimestamp = now.getTime();
  assert(Number.isFinite(nowTimestamp), "The updater received an invalid current time.");
  const cutoff = nowTimestamp - minimumAgeHours * 60 * 60 * 1000;
  const eligible = Object.entries(packument.versions)
    .filter(([version, manifest]) => {
      if (!STABLE_VERSION_PATTERN.test(version) || manifest?.deprecated) return false;
      const publishedAt = Date.parse(packument.time[version]);
      return Number.isFinite(publishedAt) && publishedAt <= cutoff;
    })
    .map(([version]) => ({
      version,
      publishedAt: new Date(packument.time[version]).toISOString(),
    }))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

  assert(
    eligible.length > 0,
    `No stable, non-deprecated react-doctor release is at least ${minimumAgeHours} hours old.`,
  );
  return eligible[0];
}

function pinnedCommand(version) {
  assertExactVersion(version);
  return `npx --yes react-doctor@${version}`;
}

function removeUnsupportedVersion(frontmatter) {
  return frontmatter.replace(/^version:\s*[^\n]+\n/m, "");
}

function replaceUpstreamCommands(markdown, version, sourceName) {
  const matches = markdown.match(UPSTREAM_COMMAND_PATTERN) ?? [];
  assert(
    matches.length > 0,
    `${sourceName} no longer contains an expected react-doctor@latest command; review the upstream change before updating the transformer.`,
  );

  return markdown.replaceAll(UPSTREAM_COMMAND_PATTERN, pinnedCommand(version));
}

function commandSelectionSection(version) {
  const command = pinnedCommand(version);
  return `${CUSTOM_SECTION_START}
## Choose the command

Before running React Doctor:

1. Prefer a repository-provided React Doctor script and use the repository's package manager.
2. Otherwise, if the repository declares \`react-doctor\`, run its local binary through the repository's package manager.
3. Otherwise, use the pinned fallback \`${command}\`.

Never use \`@latest\`, and do not add React Doctor to a repository unless the user asks. Include \`--no-telemetry\` when invoking the CLI directly.
${CUSTOM_SECTION_END}`;
}

function insertAfterIntroduction(markdown, section) {
  const firstWorkflowHeading = markdown.indexOf("\n## ");
  assert(
    firstWorkflowHeading !== -1,
    "SKILL.md no longer has a level-two workflow heading after its introduction.",
  );

  return `${markdown.slice(0, firstWorkflowHeading).trimEnd()}\n\n${section}\n\n${markdown.slice(firstWorkflowHeading).trimStart()}`;
}

function addNoTelemetry(markdown, version) {
  const escapedCommand = pinnedCommand(version).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const commandPattern = new RegExp(
    `${escapedCommand}(?![^\\n\\\`]*--no-telemetry)`,
    "g",
  );
  return markdown.replace(commandPattern, `${pinnedCommand(version)} --no-telemetry`);
}

function personalizeSkillInstructions(markdown, version) {
  const command = pinnedCommand(version);
  const replacements = [
    [
      `Run \`${command} --no-telemetry --verbose --scope changed\` and check the score did not regress.`,
      `Run the selected command with \`--verbose --scope changed --no-telemetry\` and check the score did not regress. If no local command is available, run \`${command} --verbose --scope changed --no-telemetry\`.`,
    ],
    [
      `Run \`${command} --no-telemetry --verbose\` (the default \`--scope full\`) to scan the full codebase. Fix issues by severity — errors first, then warnings.`,
      `Run the selected command with \`--verbose --no-telemetry\` (the default \`--scope full\`) to scan the full codebase. If no local command is available, run \`${command} --verbose --no-telemetry\`. Fix issues by severity — errors first, then warnings.`,
    ],
    [
      `Start with \`${command} --no-telemetry rules explain <rule>\`, then apply the narrowest control via \`${command} --no-telemetry rules disable|set|category|ignore-tag …\``,
      "Use the selected local command or pinned fallback for `rules explain <rule>`, then apply the narrowest control via `rules disable|set|category|ignore-tag …`",
    ],
  ];

  let personalized = markdown;
  for (const [upstreamText, replacement] of replacements) {
    assert(
      personalized.includes(upstreamText),
      "SKILL.md workflow wording changed upstream; review it before updating the personal command-selection guidance.",
    );
    personalized = personalized.replace(upstreamText, replacement);
  }
  return personalized;
}

export function customizeSkill(upstreamMarkdown, version) {
  assertExactVersion(version);
  assert(
    upstreamMarkdown.startsWith("---\n") && upstreamMarkdown.includes("\n---\n"),
    "SKILL.md must start with YAML frontmatter.",
  );

  const frontmatterEnd = upstreamMarkdown.indexOf("\n---\n", 4);
  const frontmatter = removeUnsupportedVersion(
    upstreamMarkdown.slice(0, frontmatterEnd + 5),
  );
  const body = upstreamMarkdown.slice(frontmatterEnd + 5);
  const withPinnedCommands = replaceUpstreamCommands(body, version, "SKILL.md");
  const customized = insertAfterIntroduction(
    `${frontmatter}${withPinnedCommands}`,
    commandSelectionSection(version),
  );

  return personalizeSkillInstructions(addNoTelemetry(customized, version), version);
}

export function customizeExplain(upstreamMarkdown, version) {
  assertExactVersion(version);
  const withPinnedCommands = replaceUpstreamCommands(
    upstreamMarkdown,
    version,
    "references/explain.md",
  );
  const triggerMarker = "\nTriggers:";
  assert(
    withPinnedCommands.includes(triggerMarker),
    "references/explain.md no longer contains the expected Triggers section.",
  );

  const note = `\n${CUSTOM_SECTION_START}\nUse the command selected by the main skill. The examples below show the pinned fallback; never replace it with \`@latest\`.\n${CUSTOM_SECTION_END}\n`;
  return addNoTelemetry(
    withPinnedCommands.replace(triggerMarker, `${note}${triggerMarker}`),
    version,
  );
}

export function validateCustomizedSkill(skill, explain, version) {
  assertExactVersion(version);
  const combined = `${skill}\n${explain}`;
  const exactCommand = pinnedCommand(version);
  const startMarkers = combined.split(CUSTOM_SECTION_START).length - 1;
  const endMarkers = combined.split(CUSTOM_SECTION_END).length - 1;

  assert(
    /^---\nname: react-doctor\n/m.test(skill),
    "SKILL.md has invalid name frontmatter.",
  );
  assert(
    /^description:\s*\S/m.test(skill),
    "SKILL.md is missing its description.",
  );
  assert(
    !/^version:/m.test(skill),
    "SKILL.md contains the unsupported version frontmatter key.",
  );
  assert(
    !combined.includes("react-doctor@latest"),
    "Generated skill still executes react-doctor@latest.",
  );
  assert(
    combined.includes(exactCommand),
    `Generated skill does not contain ${exactCommand}.`,
  );
  assert(
    startMarkers === 2 && endMarkers === 2,
    "Generated skill has incomplete or duplicate customization markers.",
  );
  assert(
    !new RegExp(
      `${exactCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![^\\n\\\`]*--no-telemetry)`,
    ).test(combined),
    "Every direct pinned CLI example must disable telemetry.",
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "jonasjancarik-react-doctor-skill-updater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  assert(response.ok, `Request failed (${response.status}) for ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "jonasjancarik-react-doctor-skill-updater" },
  });
  assert(response.ok, `Request failed (${response.status}) for ${url}`);
  return response.text();
}

async function fetchUpdateInputs() {
  const [branch, packument] = await Promise.all([
    fetchJson(`${UPSTREAM_API}/commits/main`),
    fetchJson(REGISTRY_PACKAGE),
  ]);
  const upstreamCommit = branch.sha;
  const selectedRelease = selectEligibleVersion(packument);
  const cliVersion = selectedRelease.version;
  assert(
    /^[0-9a-f]{40}$/.test(upstreamCommit),
    "GitHub returned an invalid upstream commit SHA.",
  );
  assertExactVersion(cliVersion);

  const rawRoot = `https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${upstreamCommit}`;
  const [skill, explain] = await Promise.all([
    fetchText(`${rawRoot}/skills/react-doctor/SKILL.md`),
    fetchText(`${rawRoot}/skills/react-doctor/references/explain.md`),
  ]);
  return {
    upstreamCommit,
    cliVersion,
    cliPublishedAt: selectedRelease.publishedAt,
    skill,
    explain,
  };
}

async function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function update() {
  const inputs = await fetchUpdateInputs();
  const skill = customizeSkill(inputs.skill, inputs.cliVersion);
  const explain = customizeExplain(inputs.explain, inputs.cliVersion);
  validateCustomizedSkill(skill, explain, inputs.cliVersion);

  await mkdir(path.dirname(EXPLAIN_PATH), { recursive: true });
  await Promise.all([
    writeFile(SKILL_PATH, skill),
    writeFile(EXPLAIN_PATH, explain),
    writeFile(
      METADATA_PATH,
      `${JSON.stringify(
        {
          upstreamRepository: UPSTREAM_REPOSITORY,
          upstreamCommit: inputs.upstreamCommit,
          cliPackage: "react-doctor",
          cliVersion: inputs.cliVersion,
          cliPublishedAt: inputs.cliPublishedAt,
          minimumReleaseAgeHours: MINIMUM_RELEASE_AGE_HOURS,
        },
        null,
        2,
      )}\n`,
    ),
  ]);
  await Promise.all([
    writeOutput("upstream_commit", inputs.upstreamCommit),
    writeOutput("cli_version", inputs.cliVersion),
    writeOutput("cli_published_at", inputs.cliPublishedAt),
  ]);

  console.log(
    `Updated personal React Doctor skill from ${inputs.upstreamCommit.slice(0, 12)} with react-doctor@${inputs.cliVersion}.`,
  );
}

async function validateLocalFiles() {
  const [skill, explain, metadataText] = await Promise.all([
    readFile(SKILL_PATH, "utf8"),
    readFile(EXPLAIN_PATH, "utf8"),
    readFile(METADATA_PATH, "utf8"),
  ]);
  const metadata = JSON.parse(metadataText);
  assert(
    /^[0-9a-f]{40}$/.test(metadata.upstreamCommit),
    "Metadata has an invalid upstream commit SHA.",
  );
  validateCustomizedSkill(skill, explain, metadata.cliVersion);
  assert(
    metadata.minimumReleaseAgeHours === MINIMUM_RELEASE_AGE_HOURS,
    `Metadata must require a ${MINIMUM_RELEASE_AGE_HOURS}-hour release age.`,
  );
  assert(
    Number.isFinite(Date.parse(metadata.cliPublishedAt)),
    "Metadata has an invalid CLI publication time.",
  );
  console.log(
    `Validated personal React Doctor skill at react-doctor@${metadata.cliVersion}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? "--update";
  if (mode === "--update") await update();
  else if (mode === "--validate") await validateLocalFiles();
  else throw new Error(`Unknown option: ${mode}`);
}
