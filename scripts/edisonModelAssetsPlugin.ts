import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";

interface DiscoveredEdisonModelAsset {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly category: string;
  readonly filename: string;
  readonly extension: string;
  readonly tags: readonly string[];
}

const VIRTUAL_MODULE_ID = "virtual:edison-model-assets";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const MODELS_ROOT = path.resolve(process.cwd(), "assets/models");
const INCLUDED_EXTENSIONS = new Set([".glb", ".gltf"]);

export function edisonModelAssetsPlugin(): Plugin {
  return {
    name: "edison-model-assets",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }

      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return null;
      }

      const assets = discoverModelAssets(MODELS_ROOT);
      return `const modelAssets = ${JSON.stringify(assets, null, 2)};\nexport default modelAssets;\n`;
    },
    configureServer(server) {
      server.watcher.add(MODELS_ROOT);
    },
    handleHotUpdate(context) {
      if (!isInModelsRoot(context.file)) {
        return;
      }

      invalidateVirtualModule(context.server);
      context.server.ws.send({ type: "full-reload" });
      return [];
    }
  };
}

function invalidateVirtualModule(server: ViteDevServer): void {
  const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
  if (!module) {
    return;
  }

  server.moduleGraph.invalidateModule(module);
}

function isInModelsRoot(filePath: string): boolean {
  const relativePath = path.relative(MODELS_ROOT, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function discoverModelAssets(rootDirectory: string): DiscoveredEdisonModelAsset[] {
  const relativePaths = collectRelativeModelPaths(rootDirectory);
  const seenIds = new Set<string>();

  return relativePaths.map((relativePath) => {
    const filename = path.posix.basename(relativePath);
    const directory = path.posix.dirname(relativePath);
    const normalizedDirectory = directory === "." ? "" : directory;
    const pathSegments = normalizedDirectory ? normalizedDirectory.split("/") : [];
    const category = pathSegments[0] ?? "unknown";
    const baseName = filename.replace(/\.[^.]+$/, "");
    const titleSource = /^(model|object)$/i.test(baseName)
      ? pathSegments.at(-1) ?? baseName
      : baseName;
    const baseId = slugify(relativePath.replace(/\.[^.]+$/, ""));
    const id = ensureUniqueId(baseId, relativePath, seenIds);
    const extension = path.posix.extname(filename).toLowerCase();

    return {
      id,
      title: humanize(titleSource),
      model: toAssetModelPath(relativePath),
      relativePath,
      directory: normalizedDirectory,
      category,
      filename,
      extension,
      tags: pathSegments
    };
  });
}

function collectRelativeModelPaths(rootDirectory: string): string[] {
  try {
    const stats = statSync(rootDirectory);
    if (!stats.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const discoveredPaths: string[] = [];
  walkDirectory(rootDirectory, "", discoveredPaths);
  discoveredPaths.sort((left, right) => left.localeCompare(right));
  return discoveredPaths;
}

function walkDirectory(absoluteDirectory: string, relativeDirectory: string, discoveredPaths: string[]): void {
  const entries = readdirSync(absoluteDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      walkDirectory(absolutePath, relativePath, discoveredPaths);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!INCLUDED_EXTENSIONS.has(extension)) {
      continue;
    }

    discoveredPaths.push(relativePath.split(path.sep).join("/"));
  }
}

function toAssetModelPath(relativePath: string): string {
  return `assets/models/${relativePath}`;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureUniqueId(baseId: string, relativePath: string, seenIds: Set<string>): string {
  const normalizedBaseId = baseId.length > 0 ? baseId : "model";
  if (!seenIds.has(normalizedBaseId)) {
    seenIds.add(normalizedBaseId);
    return normalizedBaseId;
  }

  const suffix = createHash("sha1").update(relativePath).digest("hex").slice(0, 6);
  const candidateId = `${normalizedBaseId}-${suffix}`;
  seenIds.add(candidateId);
  return candidateId;
}
