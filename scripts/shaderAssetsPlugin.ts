import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const SHADERS_ROOT = path.resolve(process.cwd(), "shaders");
const SHADERS_URL_PREFIX = "/shaders";
const SHADER_EXTENSION = ".glsl";

/**
 * Vite plugin для единого lifecycle GLSL assets.
 *
 * В dev-режиме он раздает файлы как `/shaders/...`, а в production build
 * кладет те же файлы в `dist/shaders/...`. Благодаря этому runtime loader в
 * core не зависит от Vite-specific `?raw` imports и работает одинаково в
 * браузере, build output и node-тестах.
 */
export function shaderAssetsPlugin(): Plugin {
  return {
    name: "shader-assets",
    configureServer(server) {
      server.watcher.add(SHADERS_ROOT);
      server.middlewares.use(SHADERS_URL_PREFIX, (request, response, next) => {
        const shaderPath = resolveShaderRequestPath(request.url ?? "");
        if (!shaderPath) {
          next();
          return;
        }

        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(readFileSync(shaderPath, "utf8"));
        } catch {
          response.statusCode = 404;
          response.end("Shader not found.");
        }
      });
    },
    buildStart() {
      for (const shaderPath of collectShaderFiles(SHADERS_ROOT)) {
        this.addWatchFile(shaderPath);
      }
    },
    generateBundle() {
      for (const shaderPath of collectShaderFiles(SHADERS_ROOT)) {
        this.emitFile({
          type: "asset",
          fileName: `shaders/${toRelativeShaderPath(shaderPath)}`,
          source: readFileSync(shaderPath, "utf8")
        });
      }
    }
  };
}

/**
 * Преобразует URL из mounted middleware в абсолютный путь внутри shaders root.
 */
function resolveShaderRequestPath(rawUrl: string): string | null {
  const cleanUrl = parseShaderRequestUrl(rawUrl);
  if (!cleanUrl) {
    return null;
  }

  if (!cleanUrl.endsWith(SHADER_EXTENSION) || cleanUrl.includes("..")) {
    return null;
  }

  const resolvedPath = path.resolve(SHADERS_ROOT, cleanUrl);
  if (!isInsideShadersRoot(resolvedPath) || !existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    return null;
  }

  return resolvedPath;
}

function parseShaderRequestUrl(rawUrl: string): string | null {
  try {
    return decodeURIComponent(rawUrl.split("?")[0] ?? "").replace(/^\/+/u, "");
  } catch {
    return null;
  }
}

/**
 * Собирает все GLSL-файлы, которые нужно watch'ить и переносить в bundle.
 */
function collectShaderFiles(root: string): string[] {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
    return [];
  }

  const files: string[] = [];
  walkShaderDirectory(root, files);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

/**
 * Рекурсивный обход сохраняет структуру подпапок как смысловую группировку.
 */
function walkShaderDirectory(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkShaderDirectory(absolutePath, files);
      continue;
    }

    if (entry.isFile() && path.extname(entry.name) === SHADER_EXTENSION) {
      files.push(absolutePath);
    }
  }
}

/**
 * Нормализует путь для Rollup asset name независимо от платформы.
 */
function toRelativeShaderPath(shaderPath: string): string {
  return path.relative(SHADERS_ROOT, shaderPath).split(path.sep).join("/");
}

/**
 * Последняя защита от path traversal после path.resolve.
 */
function isInsideShadersRoot(filePath: string): boolean {
  const relativePath = path.relative(SHADERS_ROOT, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
