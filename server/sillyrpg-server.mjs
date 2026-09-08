import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const WEB_ROOT = path.resolve(process.env.SILLYRPG_WEB_ROOT ?? path.join(__dirname, "../dist"));
const DATA_ROOT = path.resolve(process.env.SILLYRPG_DATA_ROOT ?? WEB_ROOT);
const MAX_BODY_BYTES = Number(process.env.SILLYRPG_MAX_BODY_BYTES ?? 200 * 1024 * 1024);
const INSTALLED_PLUGINS_PATH = "assets/edison/plugins/installed/plugins.json";

createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    respondError(response, error);
  });
}).listen(PORT, () => {
  console.log(`SillyRPG server listening on ${PORT}`);
  console.log(`Web root: ${WEB_ROOT}`);
  console.log(`Data root: ${DATA_ROOT}`);
});

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const method = request.method ?? "GET";

  if (url.pathname === "/__editor/scene/assets") {
    await handleEditorSceneAssets(request, response, method);
    return;
  }

  if (url.pathname === "/__editor/scene") {
    await handleEditorScene(request, response, method);
    return;
  }

  if (url.pathname === "/__edison/plugins/install") {
    await handleEdisonPluginInstall(request, response, method);
    return;
  }

  if (url.pathname === "/__edison/plugins") {
    await handleEdisonPlugins(response, method);
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    throw new HttpError(405, "Method not allowed.");
  }

  await serveStatic(url.pathname, response, method === "HEAD");
}

async function handleEditorScene(request, response, method) {
  if (method !== "POST") {
    throw new HttpError(405, "Only POST /__editor/scene is supported.");
  }

  const body = await readJsonBody(request);
  if (typeof body.path !== "string") {
    throw new HttpError(400, "Request body must include a string 'path'.");
  }
  if (body.descriptor === undefined) {
    throw new HttpError(400, "Request body must include 'descriptor'.");
  }

  const relativePath = validateScenePath(body.path);
  await writeJsonFile(DATA_ROOT, relativePath, body.descriptor);
  await writeGeneratedAssets(parseAssetPayloads(body.assets));

  respondJson(response, 200, {
    ok: true,
    path: relativePath,
    objectCount: countSceneObjects(body.descriptor)
  });
}

async function handleEditorSceneAssets(request, response, method) {
  if (method !== "POST") {
    throw new HttpError(405, "Only POST /__editor/scene/assets is supported.");
  }

  const body = await readJsonBody(request);
  const assets = parseAssetPayloads(body.assets);
  await writeGeneratedAssets(assets);

  respondJson(response, 200, {
    ok: true,
    assetCount: assets.length
  });
}

async function handleEdisonPlugins(response, method) {
  if (method !== "GET" && method !== "HEAD") {
    throw new HttpError(405, "Use GET /__edison/plugins.");
  }

  const index = await readPluginIndex();
  respondJson(response, 200, {
    ok: true,
    plugins: index.plugins.map(toInstalledPluginResponse)
  }, method === "HEAD");
}

async function handleEdisonPluginInstall(request, response, method) {
  if (method !== "POST") {
    throw new HttpError(405, "Use POST /__edison/plugins/install.");
  }

  const body = await readJsonBody(request);
  const manifest = validateManifest(body.manifest);
  const files = validatePluginFiles(body.files, manifest);
  const directory = pluginDirectoryName(manifest.id);
  const pluginRoot = resolveWritablePath(DATA_ROOT, `assets/edison/plugins/installed/${directory}`);
  const now = new Date().toISOString();
  const index = await readPluginIndex();
  const existing = index.plugins.find((plugin) => plugin.manifest.id === manifest.id);

  await rm(pluginRoot, { recursive: true, force: true });
  await mkdir(pluginRoot, { recursive: true });
  for (const file of files) {
    const outputPath = resolveWritablePath(pluginRoot, file.path);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(file.data, "base64"));
  }

  const record = {
    manifest,
    directory,
    entry: manifest.entry,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now
  };
  await writeJsonFile(DATA_ROOT, INSTALLED_PLUGINS_PATH, {
    plugins: [
      ...index.plugins.filter((plugin) => plugin.manifest.id !== manifest.id),
      record
    ].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))
  });

  respondJson(response, 200, {
    ok: true,
    action: existing ? "updated" : "installed",
    plugin: toInstalledPluginResponse(record)
  });
}

async function serveStatic(pathname, response, headOnly) {
  const relativePath = normalizeRequestPath(pathname);
  const filePath = await findStaticFile(relativePath);
  if (!filePath) {
    throw new HttpError(404, "Not found.");
  }

  const stats = await stat(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", getContentType(filePath));
  response.setHeader("Content-Length", String(stats.size));
  if (shouldDisableCache(relativePath)) {
    response.setHeader("Cache-Control", "no-store, max-age=0");
  }

  if (headOnly) {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

async function findStaticFile(relativePath) {
  for (const root of [DATA_ROOT, WEB_ROOT]) {
    const candidate = resolveReadablePath(root, relativePath);
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function writeGeneratedAssets(assets) {
  for (const asset of assets) {
    const assetPath = validateGeneratedTerrainAssetPath(asset.path);
    const outputPath = resolveWritablePath(DATA_ROOT, assetPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, decodeEditorAssetData(asset));
  }
}

async function writeJsonFile(root, relativePath, value) {
  const outputPath = resolveWritablePath(root, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readPluginIndex() {
  for (const root of [DATA_ROOT, WEB_ROOT]) {
    try {
      const raw = await readFile(resolveReadablePath(root, INSTALLED_PLUGINS_PATH), "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.plugins)) {
        return { plugins: [] };
      }
      return {
        plugins: parsed.plugins.map(normalizePluginRecord)
      };
    } catch {
      continue;
    }
  }

  return { plugins: [] };
}

function validateScenePath(scenePath) {
  const normalized = normalizeEditablePath(scenePath);
  if (!normalized.startsWith("assets/data/scenes/")) {
    throw new HttpError(400, "Scene path must stay under assets/data/scenes.");
  }
  if (!normalized.endsWith(".json")) {
    throw new HttpError(400, "Scene descriptor paths must be .json files.");
  }
  return normalized;
}

function validateGeneratedTerrainAssetPath(assetPath) {
  const normalized = normalizeEditablePath(assetPath);
  if (!normalized.startsWith("assets/generated/terrain/")) {
    throw new HttpError(400, "Generated asset path must stay under assets/generated/terrain.");
  }
  if (!normalized.endsWith(".png")) {
    throw new HttpError(400, "Generated terrain assets must be .png files.");
  }
  return normalized;
}

function normalizeEditablePath(inputPath) {
  if (typeof inputPath !== "string" || inputPath.startsWith("/") || inputPath.startsWith("\\")) {
    throw new HttpError(400, "Absolute paths are not allowed.");
  }

  const normalized = inputPath.replace(/\\/g, "/");
  if (!normalized || normalized.split("/").some((segment) => segment === "" || segment === "..")) {
    throw new HttpError(400, "Path traversal is not allowed.");
  }
  return normalized;
}

function parseAssetPayloads(value) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "Request body assets must be an array if provided.");
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new HttpError(400, `Request body assets[${index}] must be an object.`);
    }
    if (typeof entry.path !== "string") {
      throw new HttpError(400, `Request body assets[${index}].path must be a string.`);
    }
    if (entry.encoding !== "base64" && entry.encoding !== "dataUrl") {
      throw new HttpError(400, `Request body assets[${index}].encoding must be 'base64' or 'dataUrl'.`);
    }
    if (entry.mimeType !== "image/png") {
      throw new HttpError(400, `Request body assets[${index}].mimeType must be 'image/png'.`);
    }
    if (typeof entry.data !== "string") {
      throw new HttpError(400, `Request body assets[${index}].data must be a string.`);
    }

    return entry;
  });
}

function decodeEditorAssetData(asset) {
  if (asset.encoding === "base64") {
    return Buffer.from(asset.data, "base64");
  }

  const match = asset.data.match(/^data:(?<mime>[^;,]+);base64,(?<payload>[A-Za-z0-9+/=]+)$/u);
  if (!match?.groups?.payload || match.groups.mime !== asset.mimeType) {
    throw new HttpError(400, "Generated asset data URL must match the declared mime type.");
  }
  return Buffer.from(match.groups.payload, "base64");
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new HttpError(400, "Plugin manifest must be an object.");
  }
  if (!manifest.id || !manifest.name || !manifest.version || !manifest.entry) {
    throw new HttpError(400, "Plugin manifest must include id, name, version, and entry.");
  }
  if (manifest.edisonApiVersion !== "1") {
    throw new HttpError(400, "Only Edison plugin API version 1 is supported.");
  }

  return {
    id: String(manifest.id),
    name: String(manifest.name),
    version: String(manifest.version),
    author: typeof manifest.author === "string" ? manifest.author : undefined,
    description: typeof manifest.description === "string" ? manifest.description : undefined,
    entry: normalizeArchivePath(String(manifest.entry)),
    edisonApiVersion: "1"
  };
}

function validatePluginFiles(files, manifest) {
  if (!Array.isArray(files)) {
    throw new HttpError(400, "Plugin install payload must include a files array.");
  }

  const normalized = files.map((file, index) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new HttpError(400, `Plugin install payload files[${index}] must be an object.`);
    }
    if (typeof file.path !== "string") {
      throw new HttpError(400, `Plugin install payload files[${index}].path must be a string.`);
    }
    if (file.encoding !== "base64") {
      throw new HttpError(400, `Plugin install payload files[${index}].encoding must be 'base64'.`);
    }
    if (typeof file.data !== "string") {
      throw new HttpError(400, `Plugin install payload files[${index}].data must be a string.`);
    }

    return {
      path: normalizeArchivePath(file.path),
      encoding: "base64",
      data: file.data
    };
  });

  if (!normalized.some((file) => file.path === "edison-plugin.json")) {
    throw new HttpError(400, "Plugin archive must include edison-plugin.json.");
  }
  if (!normalized.some((file) => file.path === manifest.entry)) {
    throw new HttpError(400, `Plugin archive must include entry '${manifest.entry}'.`);
  }

  return normalized;
}

function normalizePluginRecord(plugin) {
  const manifest = validateManifest(plugin.manifest);
  return {
    manifest,
    directory: pluginDirectoryName(manifest.id),
    entry: normalizeArchivePath(plugin.entry ?? manifest.entry),
    installedAt: typeof plugin.installedAt === "string" ? plugin.installedAt : new Date(0).toISOString(),
    updatedAt: typeof plugin.updatedAt === "string" ? plugin.updatedAt : new Date(0).toISOString()
  };
}

function normalizeArchivePath(archivePath) {
  const normalized = archivePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "" || segment === "..")) {
    throw new HttpError(400, `Plugin archive path '${archivePath}' is not allowed.`);
  }
  return normalized;
}

function pluginDirectoryName(pluginId) {
  const directory = pluginId.replace(/[^a-z0-9._-]/giu, "_");
  if (!directory) {
    throw new HttpError(400, "Plugin id cannot be converted to an install directory.");
  }
  return directory;
}

function toInstalledPluginResponse(record) {
  return {
    manifest: record.manifest,
    entryUrl: `/assets/edison/plugins/installed/${encodeURIComponent(record.directory)}/${record.entry}`,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt
  };
}

function countSceneObjects(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    return 0;
  }
  return Array.isArray(descriptor.objects) ? descriptor.objects.length : 0;
}

function normalizeRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    throw new HttpError(400, "Request path is malformed.");
  }

  if (!decoded) {
    return "index.html";
  }
  if (decoded.includes("\\") || decoded.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new HttpError(400, "Path traversal is not allowed.");
  }

  return decoded;
}

function resolveReadablePath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (!isInsideRoot(root, resolved)) {
    throw new HttpError(400, "Path traversal is not allowed.");
  }
  return resolved;
}

function resolveWritablePath(root, relativePath) {
  return resolveReadablePath(root, relativePath);
}

function isInsideRoot(root, filePath) {
  const relativePath = path.relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function shouldDisableCache(relativePath) {
  return relativePath.startsWith("assets/data/scenes/")
    || relativePath.startsWith("assets/generated/terrain/")
    || relativePath.startsWith("assets/edison/plugins/installed/");
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json; charset=utf-8";
    case ".mtl":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function respondJson(response, statusCode, payload, headOnly = false) {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Length", String(Buffer.byteLength(body)));
  response.end(headOnly ? undefined : body);
}

function respondError(response, error) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : String(error);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(message);
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
