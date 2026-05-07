import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const SCENES_ROOT = path.resolve(process.cwd(), "assets/data/scenes");

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

async function readJsonBody(request: NodeJS.ReadableStream): Promise<{ path: string; descriptor: unknown }> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  if (typeof payload.path !== "string") {
    throw new Error("Request body must include a string 'path'.");
  }

  return {
    path: payload.path,
    descriptor: payload.descriptor
  };
}

function validateScenePath(scenePath: string): string {
  if (path.isAbsolute(scenePath)) {
    throw new Error("Absolute scene paths are not allowed.");
  }

  const normalized = scenePath.replace(/\\/g, "/");
  if (!normalized.startsWith("assets/data/scenes/")) {
    throw new Error("Scene path must stay under assets/data/scenes.");
  }

  const resolved = path.resolve(process.cwd(), normalized);
  if (resolved !== SCENES_ROOT && !resolved.startsWith(`${SCENES_ROOT}${path.sep}`)) {
    throw new Error("Scene path traversal is not allowed.");
  }

  return normalized;
}
