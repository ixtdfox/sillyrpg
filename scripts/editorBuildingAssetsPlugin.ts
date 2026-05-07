import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";

interface DiscoveredBuildingAsset {
  readonly id: string;
  readonly title: string;
  readonly model: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly filename: string;
  readonly tags: readonly string[];
}

const VIRTUAL_MODULE_ID = "virtual:editor-building-assets";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const BUILDINGS_ROOT = path.resolve(process.cwd(), "assets/models/buildings");
const INCLUDED_EXTENSIONS = new Set([".glb", ".gltf"]);

export function editorBuildingAssetsPlugin(): Plugin {
  return {
    name: "editor-building-assets",
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

      const assets = discoverBuildingAssets(BUILDINGS_ROOT);
      return `const buildingAssets = ${JSON.stringify(assets, null, 2)};\nexport default buildingAssets;\n`;
    },
    configureServer(server) {
      server.watcher.add(BUILDINGS_ROOT);
    },
    handleHotUpdate(context) {
      if (!isInBuildingsRoot(context.file)) {
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

function isInBuildingsRoot(filePath: string): boolean {
  const relativePath = path.relative(BUILDINGS_ROOT, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function discoverBuildingAssets(rootDirectory: string): DiscoveredBuildingAsset[] {
  const relativePaths = collectRelativeModelPaths(rootDirectory);
  const seenIds = new Set<string>();

  return relativePaths.map((relativePath) => {
    const filename = path.posix.basename(relativePath);
    const directory = path.posix.dirname(relativePath);
    const normalizedDirectory = directory === "." ? "" : directory;
    const baseName = filename.replace(/\.[^.]+$/, "");
    const baseId = slugify(relativePath.replace(/\.[^.]+$/, ""));
    const id = ensureUniqueId(baseId, relativePath, seenIds);

    return {
      id,
      title: humanize(baseName),
      model: toAssetModelPath(relativePath),
      relativePath,
      directory: normalizedDirectory,
      filename,
      tags: normalizedDirectory.length > 0 ? normalizedDirectory.split("/") : []
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
  return `assets/models/buildings/${relativePath}`;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureUniqueId(baseId: string, relativePath: string, seenIds: Set<string>): string {
  const normalizedBaseId = baseId.length > 0 ? baseId : "building";
  if (!seenIds.has(normalizedBaseId)) {
    seenIds.add(normalizedBaseId);
    return normalizedBaseId;
  }

  const suffix = createHash("sha1").update(relativePath).digest("hex").slice(0, 6);
  const candidateId = `${normalizedBaseId}-${suffix}`;
  seenIds.add(candidateId);
  return candidateId;
}
