import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const testPath = process.argv[2];
if (!testPath || !testPath.endsWith(".ts")) {
  throw new Error("Usage: node scripts/run-esm-test.mjs <test-file.ts>");
}

const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outputRoot = "/tmp/sillyrpg-esm-test";
const outputTestPath = resolve(outputRoot, testPath.replace(/\.ts$/, ".js"));

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const tscPath = resolve(projectRoot, "node_modules/typescript/bin/tsc");
if (!existsSync(tscPath)) {
  throw new Error(`TypeScript compiler not found at ${tscPath}`);
}

const compile = spawnSync(process.execPath, [
  tscPath,
  "--module",
  "ES2022",
  "--target",
  "ES2022",
  "--moduleResolution",
  "node",
  "--esModuleInterop",
  "--skipLibCheck",
  "--outDir",
  outputRoot,
  testPath
], {
  cwd: projectRoot,
  stdio: "inherit"
});

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

writeFileSync(resolve(outputRoot, "package.json"), JSON.stringify({ type: "module" }));
symlinkSync(resolve(projectRoot, "node_modules"), resolve(outputRoot, "node_modules"), "dir");

const run = spawnSync(process.execPath, [
  "--require",
  resolve(projectRoot, "scripts/esm-test-bootstrap.cjs"),
  "--experimental-specifier-resolution=node",
  outputTestPath
], {
  cwd: projectRoot,
  stdio: "inherit"
});

process.exit(run.status ?? 1);
