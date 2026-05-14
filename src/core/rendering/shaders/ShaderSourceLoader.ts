declare const require: ((moduleName: string) => unknown) | undefined;
declare const process: { cwd(): string } | undefined;

export const SHADER_SOURCE_IDS = {
  visibility: {
    wallHalo: {
      uniforms: "visibility/wall-halo/uniforms.glsl",
      fragmentExtension: "visibility/wall-halo/fragment-extension.glsl",
      updateAlpha: "visibility/wall-halo/update-alpha.glsl",
      finalColorComposition: "visibility/wall-halo/final-color-composition.glsl",
      beforeFragColor: "visibility/wall-halo/before-frag-color.glsl"
    }
  },
  editorTerrain: {
    splat: {
      samplerDeclarations: "editor-terrain/splat/sampler-declarations.glsl",
      albedoFunction: "editor-terrain/splat/albedo-function.glsl",
      splatMapSamplerLine: "editor-terrain/splat/splat-map-sampler-line.glsl",
      weightReadLine: "editor-terrain/splat/weight-read-line.glsl",
      albedoAccumulateLine: "editor-terrain/splat/albedo-accumulate-line.glsl",
      weightAccumulateLine: "editor-terrain/splat/weight-accumulate-line.glsl",
      updateDiffuse: "editor-terrain/splat/update-diffuse.glsl"
    }
  }
} as const;

export type ShaderSourceId =
  | typeof SHADER_SOURCE_IDS.visibility.wallHalo.uniforms
  | typeof SHADER_SOURCE_IDS.visibility.wallHalo.fragmentExtension
  | typeof SHADER_SOURCE_IDS.visibility.wallHalo.updateAlpha
  | typeof SHADER_SOURCE_IDS.visibility.wallHalo.finalColorComposition
  | typeof SHADER_SOURCE_IDS.visibility.wallHalo.beforeFragColor
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.samplerDeclarations
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.albedoFunction
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.splatMapSamplerLine
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.weightReadLine
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.albedoAccumulateLine
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.weightAccumulateLine
  | typeof SHADER_SOURCE_IDS.editorTerrain.splat.updateDiffuse;

/**
 * Синхронный loader GLSL-файлов из корневой директории shaders.
 *
 * Babylon MaterialPluginBase запрашивает shader snippets синхронно во время
 * компиляции материала, поэтому loader держит кеш и имеет два backend'а:
 * браузер читает `/shaders/...`, а node-тесты читают те же файлы с диска.
 */
export class ShaderSourceLoader {
  private static shared: ShaderSourceLoader | null = null;

  private readonly baseUrl: string;
  private readonly cache: Map<ShaderSourceId, string>;

  public constructor(baseUrl = "/shaders") {
    this.baseUrl = baseUrl.replace(/\/+$/u, "");
    this.cache = new Map();
  }

  public static getShared(): ShaderSourceLoader {
    if (!ShaderSourceLoader.shared) {
      ShaderSourceLoader.shared = new ShaderSourceLoader();
    }

    return ShaderSourceLoader.shared;
  }

  /**
   * Возвращает shader source по стабильному id.
   */
  public load(id: ShaderSourceId): string {
    const cached = this.cache.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const normalizedId = this.normalizeId(id);
    const source = this.loadFromBrowser(normalizedId) ?? this.loadFromFileSystem(normalizedId);
    this.cache.set(id, source);
    return source;
  }

  private normalizeId(id: ShaderSourceId): ShaderSourceId {
    const normalized = id.replace(/^\/+/u, "").replace(/\\/gu, "/") as ShaderSourceId;
    if (
      normalized.includes("..") ||
      !/^[a-z0-9/_-]+\.glsl$/u.test(normalized)
    ) {
      throw new Error(`Invalid shader source id '${id}'.`);
    }

    return normalized;
  }

  private loadFromBrowser(id: ShaderSourceId): string | null {
    if (typeof XMLHttpRequest === "undefined") {
      return null;
    }

    const request = new XMLHttpRequest();
    request.open("GET", `${this.baseUrl}/${id}`, false);
    request.send();

    if ((request.status >= 200 && request.status < 300) || request.status === 0) {
      return request.responseText;
    }

    throw new Error(`Failed to load shader '${id}' from '${this.baseUrl}': ${request.status}.`);
  }

  private loadFromFileSystem(id: ShaderSourceId): string {
    const nodeRequire = this.resolveNodeRequire();
    if (!nodeRequire || typeof process === "undefined") {
      throw new Error(`Shader '${id}' cannot be loaded: no browser or file-system loader is available.`);
    }

    const fs = nodeRequire("node:fs") as { readFileSync(path: string, encoding: "utf8"): string };
    const path = nodeRequire("node:path") as { resolve(...parts: string[]): string };
    return fs.readFileSync(path.resolve(process.cwd(), "shaders", id), "utf8");
  }

  private resolveNodeRequire(): ((moduleName: string) => unknown) | null {
    try {
      if (typeof require === "function") {
        return require;
      }
    } catch {
      return null;
    }

    return null;
  }
}

/**
 * Минимальный renderer GLSL templates с именованными placeholders.
 */
export class ShaderTemplateRenderer {
  public render(template: string, values: Readonly<Record<string, string>>): string {
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/gu, (_match, key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Shader template placeholder '${key}' was not provided.`);
      }

      return value;
    });
  }
}
