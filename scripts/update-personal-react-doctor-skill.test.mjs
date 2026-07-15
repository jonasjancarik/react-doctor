import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertExactVersion,
  customizeExplain,
  customizeSkill,
  validateCustomizedSkill,
} from "./update-personal-react-doctor-skill.mjs";

const upstreamSkill = `---
name: react-doctor
description: Test skill
version: "1.2.0"
---

# React Doctor

Introduction.

## After changes

Run \`npx react-doctor@latest --verbose --scope changed\` and check the score did not regress.

## For general cleanup or code improvement:

Run \`npx react-doctor@latest --verbose\` (the default \`--scope full\`) to scan the full codebase. Fix issues by severity — errors first, then warnings.

## Configuring or explaining rules

Use a reference. Start with \`npx react-doctor@latest rules explain <rule>\`, then apply the narrowest control via \`npx react-doctor@latest rules disable|set|category|ignore-tag …\`.

## Command

\`npx -y react-doctor@latest --score\`
`;

const upstreamExplain = `# Explain

Introduction.

Triggers: explain a rule.

\`npx --yes react-doctor@latest rules explain example\`
`;

test("generates a pinned skill while preserving upstream content", () => {
  const skill = customizeSkill(upstreamSkill, "0.7.8");
  const explain = customizeExplain(upstreamExplain, "0.7.8");

  validateCustomizedSkill(skill, explain, "0.7.8");
  assert.match(skill, /Introduction\./);
  assert.match(skill, /## After changes/);
  assert.doesNotMatch(skill, /^version:/m);
  assert.doesNotMatch(`${skill}${explain}`, /react-doctor@latest/);
  assert.match(skill, /Run the selected command with `--verbose --scope changed --no-telemetry`/);
  assert.match(skill, /npx --yes react-doctor@0\.7\.8 --verbose --scope changed --no-telemetry/);
  assert.match(explain, /npx --yes react-doctor@0\.7\.8 --no-telemetry rules explain/);
});

test("rejects non-exact package versions", () => {
  for (const version of ["latest", "^0.7.8", "0.7", "0.7.8 || 1.0.0"]) {
    assert.throws(() => assertExactVersion(version), /exact react-doctor version/);
  }
});

test("stops for review when upstream command conventions change", () => {
  assert.throws(
    () => customizeSkill(upstreamSkill.replaceAll("react-doctor@latest", "react-doctor"), "0.7.8"),
    /review the upstream change/,
  );
  assert.throws(
    () => customizeExplain("# Explain\n\nTriggers: example\n", "0.7.8"),
    /review the upstream change/,
  );
});
