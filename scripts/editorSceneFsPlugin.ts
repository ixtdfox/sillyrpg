import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import {
  validateEditorSceneDescriptorPath,
  validateGeneratedTerrainAssetPath
} from "../src/editor/state/EditorSceneSavePaths";

const SCENES_ROOT = path.resolve(process.cwd(), "assets/data/scenes");
const GENERATED_TERRAIN_ASSETS_ROOT = path.resolve(process.cwd(), "assets/generated/terrain");

interface EditorSceneAssetPayload {
  readonly path: string;
  readonly encoding: "base64" | "dataUrl";
  readonly mimeType: "image/png";
  readonly data: string;
}

interface EditorSceneSavePayload {
  readonly path: string;
  readonly descriptor: unknown;
  readonly assets: readonly EditorSceneAssetPayload[];
}

export function editorSceneFsPlugin(): Plugin {
  return {
    name: "editor-scene-fs",
    configureServer(server) {
      server.middlewares.use("/__editor/scene", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Only POST /__editor/scene is supported.");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const relativePath = validateScenePath(body.path);
          const descriptor = body.descriptor;
          const absolutePath = path.resolve(process.cwd(), relativePath);

          for (const asset of body.assets) {
            const assetPath = validateEditorGeneratedAssetPath(asset.path);
            const assetAbsolutePath = path.resolve(process.cwd(), assetPath);
            await mkdir(path.dirname(assetAbsolutePath), { recursive: true });
            await writeFile(assetAbsolutePath, decodeEditorAssetData(asset));
          }

          await mkdir(path.dirname(absolutePath), { recursive: true });
          await writeFile(absolutePath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 400;
          res.end(error instanceof Error ? error.message : String(error));
        }
      });
    }
  };
}

async function readJsonBody(request: NodeJS.ReadableStream): Promise<EditorSceneSavePayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  if (typeof payload.path !== "string") {
    throw new Error("Request body must include a string 'path'.");
  }

  const assets = parseAssetPayloads(payload.assets);

  return {
    path: payload.path,
    descriptor: payload.descriptor,
    assets
  };
}

export function validateScenePath(scenePath: string): string {
  const normalized = validateEditorSceneDescriptorPath(scenePath);

  const resolved = path.resolve(process.cwd(), normalized);
  if (resolved !== SCENES_ROOT && !resolved.startsWith(`${SCENES_ROOT}${path.sep}`)) {
    throw new Error("Scene path traversal is not allowed.");
  }

  return normalized;
}

export function validateEditorGeneratedAssetPath(assetPath: string): string {
  const normalized = validateGeneratedTerrainAssetPath(assetPath);

  const resolved = path.resolve(process.cwd(), normalized);
  if (resolved !== GENERATED_TERRAIN_ASSETS_ROOT && !resolved.startsWith(`${GENERATED_TERRAIN_ASSETS_ROOT}${path.sep}`)) {
    throw new Error("Generated asset path traversal is not allowed.");
  }

  return normalized;
}

export function decodeEditorAssetData(asset: EditorSceneAssetPayload): Buffer {
  if (asset.mimeType !== "image/png") {
    throw new Error("Only image/png generated assets are supported.");
  }

  if (asset.encoding === "base64") {
    return Buffer.from(asset.data, "base64");
  }

  if (asset.encoding === "dataUrl") {
    const match = asset.data.match(/^data:(?<mime>[^;,]+);base64,(?<payload>[A-Za-z0-9+/=]+)$/u);
    if (!match?.groups?.payload || match.groups.mime !== asset.mimeType) {
      throw new Error("Generated asset data URL must match the declared mime type.");
    }
    return Buffer.from(match.groups.payload, "base64");
  }

  throw new Error("Generated asset encoding must be 'base64' or 'dataUrl'.");
}

function parseAssetPayloads(value: unknown): readonly EditorSceneAssetPayload[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Request body assets must be an array if provided.");
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Request body assets[${index}] must be an object.`);
    }

    const record = entry as Record<string, unknown>;
    if (typeof record.path !== "string") {
      throw new Error(`Request body assets[${index}].path must be a string.`);
    }
    if (record.encoding !== "base64" && record.encoding !== "dataUrl") {
      throw new Error(`Request body assets[${index}].encoding must be 'base64' or 'dataUrl'.`);
    }
    if (record.mimeType !== "image/png") {
      throw new Error(`Request body assets[${index}].mimeType must be 'image/png'.`);
    }
    if (typeof record.data !== "string") {
      throw new Error(`Request body assets[${index}].data must be a string.`);
    }

    return {
      path: record.path,
      encoding: record.encoding,
      mimeType: record.mimeType,
      data: record.data
    };
  });
}
