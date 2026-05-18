import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import type { EdisonPluginManifest } from "../src/edison/plugins/EdisonPluginManifest";

const INSTALLED_PLUGINS_ROOT = path.resolve(process.cwd(), "assets/edison/plugins/installed");
const INSTALLED_PLUGINS_INDEX = path.join(INSTALLED_PLUGINS_ROOT, "plugins.json");

interface EdisonPluginFilePayload {
  readonly path: string;
  readonly encoding: "base64";
  readonly data: string;
}

interface EdisonPluginInstallPayload {
  readonly manifest: EdisonPluginManifest;
  readonly files: readonly EdisonPluginFilePayload[];
}

interface EdisonPersistedPluginRecord {
  readonly manifest: EdisonPluginManifest;
  readonly directory: string;
  readonly entry: string;
  readonly installedAt: string;
  readonly updatedAt: string;
}

interface EdisonPersistedPluginIndex {
  readonly plugins: readonly EdisonPersistedPluginRecord[];
}

export interface EdisonPluginFsInstalledPlugin {
  readonly manifest: EdisonPluginManifest;
  readonly entryUrl: string;
  readonly installedAt: string;
  readonly updatedAt: string;
}

export function edisonPluginFsPlugin(): Plugin {
  return {
    name: "edison-plugin-fs",
    configureServer(server) {
      server.middlewares.use("/__edison/plugins", async (req, res) => {
        try {
          if (req.method === "GET") {
            const index = await readPluginIndex();
            respondJson(res, {
              ok: true,
              plugins: index.plugins.map(toInstalledPluginResponse)
            });
            return;
          }

          if (req.method === "POST" && req.url === "/install") {
            const payload = await readJsonBody(req);
            const result = await installPlugin(payload);
            respondJson(res, result);
            return;
          }

          res.statusCode = 405;
          res.end("Use GET /__edison/plugins or POST /__edison/plugins/install.");
        } catch (error) {
          res.statusCode = 400;
          res.end(error instanceof Error ? error.message : String(error));
        }
      });
    }
  };
}

async function installPlugin(payload: EdisonPluginInstallPayload): Promise<{
  readonly ok: true;
  readonly action: "installed" | "updated";
  readonly plugin: EdisonPluginFsInstalledPlugin;
}> {
  const manifest = validateManifest(payload.manifest);
  const files = validatePluginFiles(payload.files, manifest);
  const directory = pluginDirectoryName(manifest.id);
  const pluginRoot = path.join(INSTALLED_PLUGINS_ROOT, directory);
  const now = new Date().toISOString();
  const index = await readPluginIndex();
  const existing = index.plugins.find((plugin) => plugin.manifest.id === manifest.id);

  await rm(pluginRoot, { recursive: true, force: true });
  await mkdir(pluginRoot, { recursive: true });
  for (const file of files) {
    const outputPath = resolvePluginFilePath(pluginRoot, file.path);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(file.data, "base64"));
  }

  const record: EdisonPersistedPluginRecord = {
    manifest,
    directory,
    entry: manifest.entry,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now
  };
  await writePluginIndex({
    plugins: [
      ...index.plugins.filter((plugin) => plugin.manifest.id !== manifest.id),
      record
    ].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))
  });

  return {
    ok: true,
    action: existing ? "updated" : "installed",
    plugin: toInstalledPluginResponse(record)
  };
}

async function readJsonBody(request: NodeJS.ReadableStream): Promise<EdisonPluginInstallPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  if (!payload.manifest || typeof payload.manifest !== "object" || Array.isArray(payload.manifest)) {
    throw new Error("Plugin install payload must include a manifest object.");
  }
  if (!Array.isArray(payload.files)) {
    throw new Error("Plugin install payload must include a files array.");
  }

  return {
    manifest: payload.manifest as EdisonPluginManifest,
    files: payload.files.map((file, index) => parseFilePayload(file, index))
  };
}

function parseFilePayload(value: unknown, index: number): EdisonPluginFilePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Plugin install payload files[${index}] must be an object.`);
  }

  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string") {
    throw new Error(`Plugin install payload files[${index}].path must be a string.`);
  }
  if (record.encoding !== "base64") {
    throw new Error(`Plugin install payload files[${index}].encoding must be 'base64'.`);
  }
  if (typeof record.data !== "string") {
    throw new Error(`Plugin install payload files[${index}].data must be a string.`);
  }

  return {
    path: record.path,
    encoding: "base64",
    data: record.data
  };
}

async function readPluginIndex(): Promise<EdisonPersistedPluginIndex> {
  try {
    const raw = await readFile(INSTALLED_PLUGINS_INDEX, "utf8");
    const parsed = JSON.parse(raw) as Partial<EdisonPersistedPluginIndex>;
    if (!Array.isArray(parsed.plugins)) {
      return { plugins: [] };
    }

    return {
      plugins: parsed.plugins.map((plugin) => ({
        manifest: validateManifest(plugin.manifest),
        directory: pluginDirectoryName(plugin.manifest.id),
        entry: normalizeArchivePath(plugin.entry ?? plugin.manifest.entry),
        installedAt: typeof plugin.installedAt === "string" ? plugin.installedAt : new Date(0).toISOString(),
        updatedAt: typeof plugin.updatedAt === "string" ? plugin.updatedAt : new Date(0).toISOString()
      }))
    };
  } catch {
    return { plugins: [] };
  }
}

async function writePluginIndex(index: EdisonPersistedPluginIndex): Promise<void> {
  await mkdir(INSTALLED_PLUGINS_ROOT, { recursive: true });
  await writeFile(INSTALLED_PLUGINS_INDEX, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function validateManifest(manifest: unknown): EdisonPluginManifest {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Plugin manifest must be an object.");
  }

  const record = manifest as Partial<EdisonPluginManifest>;
  if (!record.id || !record.name || !record.version || !record.entry) {
    throw new Error("Plugin manifest must include id, name, version, and entry.");
  }
  if (record.edisonApiVersion !== "1") {
    throw new Error("Only Edison plugin API version 1 is supported.");
  }

  return {
    id: String(record.id),
    name: String(record.name),
    version: String(record.version),
    author: typeof record.author === "string" ? record.author : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    entry: normalizeArchivePath(String(record.entry)),
    edisonApiVersion: "1"
  };
}

function validatePluginFiles(
  files: readonly EdisonPluginFilePayload[],
  manifest: EdisonPluginManifest
): readonly EdisonPluginFilePayload[] {
  if (files.length === 0) {
    throw new Error("Plugin archive has no files to install.");
  }

  const normalized = files.map((file) => ({
    ...file,
    path: normalizeArchivePath(file.path)
  }));
  if (!normalized.some((file) => file.path === "edison-plugin.json")) {
    throw new Error("Plugin archive must include edison-plugin.json.");
  }
  if (!normalized.some((file) => file.path === manifest.entry)) {
    throw new Error(`Plugin archive must include entry '${manifest.entry}'.`);
  }

  return normalized;
}

function resolvePluginFilePath(pluginRoot: string, archivePath: string): string {
  const resolved = path.resolve(pluginRoot, archivePath);
  if (resolved !== pluginRoot && !resolved.startsWith(`${pluginRoot}${path.sep}`)) {
    throw new Error(`Plugin archive path '${archivePath}' is not allowed.`);
  }

  return resolved;
}

function normalizeArchivePath(archivePath: string): string {
  const normalized = archivePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error(`Plugin archive path '${archivePath}' is not allowed.`);
  }

  return normalized;
}

function pluginDirectoryName(pluginId: string): string {
  const directory = pluginId.replace(/[^a-z0-9._-]/giu, "_");
  if (!directory) {
    throw new Error("Plugin id cannot be converted to an install directory.");
  }

  return directory;
}

function toInstalledPluginResponse(record: EdisonPersistedPluginRecord): EdisonPluginFsInstalledPlugin {
  return {
    manifest: record.manifest,
    entryUrl: `/assets/edison/plugins/installed/${encodeURIComponent(record.directory)}/${record.entry
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt
  };
}

function respondJson(response: NodeJS.WritableStream & { statusCode?: number; setHeader?: (name: string, value: string) => void }, body: unknown): void {
  response.statusCode = 200;
  response.setHeader?.("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}
