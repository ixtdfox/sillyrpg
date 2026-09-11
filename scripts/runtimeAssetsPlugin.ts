import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const ASSETS_ROOT = path.resolve(process.cwd(), "assets");
const ASSETS_URL_PREFIX = "/assets";
const INCLUDED_DIRECTORIES = new Set(["data", "edison", "generated", "models", "scenes", "textures"]);

export function runtimeAssetsPlugin(): Plugin {
  return {
    name: "runtime-assets",
    configureServer(server) {
      server.watcher.add(ASSETS_ROOT);
      server.middlewares.use(ASSETS_URL_PREFIX, (request, response, next) => {
        if (isViteModuleRequest(request.url ?? "")) {
          next();
          return;
        }

        const assetPath = resolveAssetRequestPath(request.url ?? "");
        if (!assetPath) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", getContentType(assetPath));
        response.end(readFileSync(assetPath));
      });
    },
    buildStart() {
      for (const assetPath of collectAssetFiles(ASSETS_ROOT)) {
        this.addWatchFile(assetPath);
      }
    },
    generateBundle() {
      for (const assetPath of collectAssetFiles(ASSETS_ROOT)) {
        this.emitFile({
          type: "asset",
          fileName: `assets/${toRelativeAssetPath(assetPath)}`,
          source: readFileSync(assetPath)
        });
      }
    }
  };
}

function resolveAssetRequestPath(rawUrl: string): string | null {
  const requestPath = parseAssetRequestPath(rawUrl);
  if (!requestPath) {
    return null;
  }

  const resolvedPath = path.resolve(ASSETS_ROOT, requestPath);
  if (!isInsideAssetsRoot(resolvedPath) || !existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    return null;
  }

  return resolvedPath;
}

function parseAssetRequestPath(rawUrl: string): string | null {
  try {
    const pathname = new URL(rawUrl, "http://localhost").pathname;
    return decodeURIComponent(pathname).replace(/^\/+/, "").replace(/^assets\//, "");
  } catch {
    return null;
  }
}

function isViteModuleRequest(rawUrl: string): boolean {
  try {
    const searchParams = new URL(rawUrl, "http://localhost").searchParams;
    return searchParams.has("import") || searchParams.has("raw");
  } catch {
    return false;
  }
}

function collectAssetFiles(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }

  const files: string[] = [];
  walkAssetDirectory(root, files);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function walkAssetDirectory(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory === ASSETS_ROOT && !INCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      walkAssetDirectory(absolutePath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
}

function toRelativeAssetPath(assetPath: string): string {
  return path.relative(ASSETS_ROOT, assetPath).split(path.sep).join("/");
}

function isInsideAssetsRoot(filePath: string): boolean {
  const relativePath = path.relative(ASSETS_ROOT, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".json":
      return "application/json; charset=utf-8";
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
