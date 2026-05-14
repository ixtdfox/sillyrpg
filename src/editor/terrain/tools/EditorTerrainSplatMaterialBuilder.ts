import {
  Color3,
  DynamicTexture,
  RawTexture,
  StandardMaterial,
  Texture,
  type AbstractEngine,
  type AbstractMesh,
  type BaseTexture,
  type Mesh,
  type Scene,
  type SubMesh,
  type UniformBuffer
} from "@babylonjs/core";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import {
  SHADER_SOURCE_IDS,
  ShaderSourceLoader,
  ShaderTemplateRenderer,
  type ShaderSourceId
} from "../../../core/rendering/shaders/ShaderSourceLoader";
import type { TerrainSplatMap } from "../editing/TerrainSplatMap";
import type { TerrainTextureLayerDescriptor } from "../editing/TerrainTextureLayer";

const SPLAT_TEXTURE_CHANNEL_COUNT = 4;
const LAYER_ATLAS_SAMPLER_COUNT = 1;
const LAYER_ATLAS_CELL_SIZE = 256;

interface TerrainLayerAtlasLayout {
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
}

/**
 * Политика бюджета texture samplers для splat material.
 */
export class TerrainSplatSamplerBudget {
  /**
   * Вычисляет, сколько layers можно поддержать с учетом WebGL sampler limit.
   */
  public getSupportedLayerCount(scene: Scene, requestedLayerCount: number): number {
    const maxTextureSamplers = this.resolveMaxTextureSamplers(scene);
    const normalizedLayerCount = Math.max(0, Math.round(requestedLayerCount));

    for (let layerCount = normalizedLayerCount; layerCount >= 1; layerCount -= 1) {
      if (this.getRequiredSamplerCount(layerCount) <= maxTextureSamplers) {
        return layerCount;
      }
    }

    return 0;
  }

  /**
   * Возвращает требуемое число texture samplers для заданного количества layers.
   */
  public getRequiredSamplerCount(layerCount: number): number {
    return Math.ceil(layerCount / SPLAT_TEXTURE_CHANNEL_COUNT) + LAYER_ATLAS_SAMPLER_COUNT;
  }

  /**
   * Читает аппаратный лимит texture samplers из Babylon capabilities.
   */
  public resolveMaxTextureSamplers(scene: Scene): number {
    return Math.max(1, scene.getEngine().getCaps().maxTexturesImageUnits ?? 16);
  }
}

/**
 * Политика тайлинга terrain layer textures.
 */
export class TerrainSplatTileScalePolicy {
  /**
   * Подбирает повторяемость atlas texture по максимальному размеру terrain.
   */
  public resolve(terrainWidth: number, terrainDepth: number): number {
    const maxSize = Math.max(Math.abs(terrainWidth), Math.abs(terrainDepth), 1);
    return Math.max(4, Math.min(24, maxSize / 6));
  }
}

/**
 * Resolver layout'а atlas texture для набора terrain layers.
 */
class TerrainLayerAtlasLayoutResolver {
  /**
   * Подбирает прямоугольную сетку atlas cells под число layers.
   */
  public resolve(layerCount: number): TerrainLayerAtlasLayout {
    const columns = Math.max(1, Math.ceil(Math.sqrt(layerCount)));
    const rows = Math.max(1, Math.ceil(layerCount / columns));
    return {
      columns,
      rows,
      cellSize: LAYER_ATLAS_CELL_SIZE
    };
  }
}

/**
 * Factory RGBA splat textures из TerrainSplatMap chunks.
 */
class TerrainSplatTextureFactory {
  /**
   * Создает RawTexture на каждый RGBA chunk весов splat map.
   */
  public create(scene: Scene, mesh: Mesh, splatMap: TerrainSplatMap): RawTexture[] {
    const textures: RawTexture[] = [];
    for (let chunkIndex = 0; chunkIndex < splatMap.getSplatTextureCount(); chunkIndex += 1) {
      const texture = RawTexture.CreateRGBATexture(
        splatMap.toRgba8ArrayForChunk(chunkIndex, true),
        splatMap.resolutionX,
        splatMap.resolutionZ,
        scene,
        false,
        false,
        Texture.BILINEAR_SAMPLINGMODE
      );
      texture.name = `terrain-splat-map:${mesh.name}:${chunkIndex}`;
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      textures.push(texture);
    }
    return textures;
  }
}

/**
 * Политика fallback-цвета для layer atlas cell, если изображение layer не загрузилось.
 */
class TerrainLayerFallbackColorPolicy {
  /**
   * Генерирует стабильный HSL цвет из id layer'а.
   */
  public resolve(layerId: string): string {
    let hash = 0;
    for (let index = 0; index < layerId.length; index += 1) {
      hash = ((hash << 5) - hash + layerId.charCodeAt(index)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 36%, 48%)`;
  }
}

/**
 * Factory atlas texture для diffuse layers.
 */
class TerrainLayerAtlasTextureFactory {
  private readonly fallbackColorPolicy: TerrainLayerFallbackColorPolicy;

  public constructor(fallbackColorPolicy = new TerrainLayerFallbackColorPolicy()) {
    this.fallbackColorPolicy = fallbackColorPolicy;
  }

  public create(
    scene: Scene,
    mesh: Mesh,
    layers: readonly TerrainTextureLayerDescriptor[],
    layout: TerrainLayerAtlasLayout
  ): DynamicTexture {
    const texture = new DynamicTexture(
      `terrain-layer-atlas:${mesh.name}`,
      {
        width: layout.columns * layout.cellSize,
        height: layout.rows * layout.cellSize
      },
      scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE
    );
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.hasAlpha = false;
    this.populate(texture, layers, layout);
    return texture;
  }

  private populate(
    texture: DynamicTexture,
    layers: readonly TerrainTextureLayerDescriptor[],
    layout: TerrainLayerAtlasLayout
  ): void {
    const context = texture.getContext() as CanvasRenderingContext2D;
    let disposed = false;
    texture.onDisposeObservable.addOnce(() => {
      disposed = true;
    });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, layout.columns * layout.cellSize, layout.rows * layout.cellSize);
    if ("imageSmoothingEnabled" in context) {
      context.imageSmoothingEnabled = true;
    }

    if (typeof Image === "undefined") {
      if (!disposed) {
        texture.update(false);
      }
      return;
    }

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
      const layer = layers[layerIndex];
      if (!layer) {
        continue;
      }

      const image = new Image();
      image.onload = () => {
        if (disposed) {
          return;
        }
        this.drawCell(context, image, layerIndex, layout);
        texture.update(false);
      };
      image.onerror = () => {
        if (disposed) {
          return;
        }
        this.fillFallback(context, layer.id, layerIndex, layout);
        texture.update(false);
      };
      image.src = layer.url;
    }

    if (!disposed) {
      texture.update(false);
    }
  }

  private drawCell(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    layerIndex: number,
    layout: TerrainLayerAtlasLayout
  ): void {
    const x = (layerIndex % layout.columns) * layout.cellSize;
    const y = Math.floor(layerIndex / layout.columns) * layout.cellSize;
    context.drawImage(image, x, y, layout.cellSize, layout.cellSize);
  }

  private fillFallback(
    context: CanvasRenderingContext2D,
    layerId: string,
    layerIndex: number,
    layout: TerrainLayerAtlasLayout
  ): void {
    const x = (layerIndex % layout.columns) * layout.cellSize;
    const y = Math.floor(layerIndex / layout.columns) * layout.cellSize;
    context.fillStyle = this.fallbackColorPolicy.resolve(layerId);
    context.fillRect(x, y, layout.cellSize, layout.cellSize);
  }
}

/**
 * Factory GLSL-фрагментов для material plugin.
 */
class TerrainSplatShaderSourceFactory {
  private readonly shaderSourceLoader: ShaderSourceLoader;
  private readonly templateRenderer: ShaderTemplateRenderer;

  public constructor(
    shaderSourceLoader = ShaderSourceLoader.getShared(),
    templateRenderer = new ShaderTemplateRenderer()
  ) {
    this.shaderSourceLoader = shaderSourceLoader;
    this.templateRenderer = templateRenderer;
  }

  /**
   * Генерирует uniform declarations для splat map textures и layer atlas.
   */
  public generateSamplerDeclarations(splatTextureCount: number): string {
    const lines: string[] = [];
    for (let chunkIndex = 0; chunkIndex < splatTextureCount; chunkIndex += 1) {
      lines.push(
        this.renderTemplate(SHADER_SOURCE_IDS.editorTerrain.splat.splatMapSamplerLine, {
          samplerName: this.getSplatSamplerName(chunkIndex)
        })
      );
    }

    return this.templateRenderer.render(
      this.shaderSourceLoader.load(SHADER_SOURCE_IDS.editorTerrain.splat.samplerDeclarations),
      {
        terrainSplatMapSamplers: lines.join("\n")
      }
    );
  }

  /**
   * Генерирует GLSL функцию смешивания albedo по weights из splat map.
   */
  public generateSplatFunction(layerCount: number, splatTextureCount: number): string {
    const lines: string[] = [];

    for (let chunkIndex = 0; chunkIndex < splatTextureCount; chunkIndex += 1) {
      const samplerName = this.getSplatSamplerName(chunkIndex);
      const weightsVar = this.getSplatWeightsVarName(chunkIndex);
      lines.push(
        this.renderTemplate(SHADER_SOURCE_IDS.editorTerrain.splat.weightReadLine, {
          samplerName,
          weightsVar
        })
      );
      for (let channelIndex = 0; channelIndex < SPLAT_TEXTURE_CHANNEL_COUNT; channelIndex += 1) {
        const layerIndex = (chunkIndex * SPLAT_TEXTURE_CHANNEL_COUNT) + channelIndex;
        if (layerIndex >= layerCount) {
          continue;
        }
        const channelName = this.getSplatChannelName(channelIndex);
        lines.push(
          this.renderTemplate(SHADER_SOURCE_IDS.editorTerrain.splat.albedoAccumulateLine, {
            channelName,
            layerIndex: `${layerIndex}`,
            weightsVar
          })
        );
        lines.push(
          this.renderTemplate(SHADER_SOURCE_IDS.editorTerrain.splat.weightAccumulateLine, {
            channelName,
            weightsVar
          })
        );
      }
    }

    return this.templateRenderer.render(
      this.shaderSourceLoader.load(SHADER_SOURCE_IDS.editorTerrain.splat.albedoFunction),
      {
        terrainSplatWeightSampling: lines.join("\n")
      }
    );
  }

  /**
   * Возвращает fragment hook, который подменяет diffuse albedo terrain.
   */
  public generateDiffuseUpdate(): string {
    return this.shaderSourceLoader.load(SHADER_SOURCE_IDS.editorTerrain.splat.updateDiffuse);
  }

  private renderTemplate(id: ShaderSourceId, values: Readonly<Record<string, string>>): string {
    return this.templateRenderer.render(this.shaderSourceLoader.load(id), values);
  }

  private getSplatSamplerName(chunkIndex: number): string {
    return `terrainSplatMap${chunkIndex}`;
  }

  private getSplatWeightsVarName(chunkIndex: number): string {
    return `weights${chunkIndex}`;
  }

  private getSplatChannelName(channelIndex: number): string {
    switch (channelIndex) {
      case 0:
        return "r";
      case 1:
        return "g";
      case 2:
        return "b";
      default:
        return "a";
    }
  }
}

/**
 * Runtime-владение ресурсами splat material.
 *
 * Объект хранит Babylon material, splat textures и atlas texture вместе, чтобы
 * редактор мог обновлять веса paint layer'ов и корректно освобождать GPU ресурсы.
 */
export class TerrainSplatMaterialRuntime {
  public readonly material: StandardMaterial;
  private readonly splatTextures: readonly RawTexture[];
  private readonly layerAtlasTexture: DynamicTexture;
  private readonly splatMap: TerrainSplatMap;

  public constructor(
    material: StandardMaterial,
    splatTextures: readonly RawTexture[],
    layerAtlasTexture: DynamicTexture,
    splatMap: TerrainSplatMap
  ) {
    this.material = material;
    this.splatTextures = splatTextures;
    this.layerAtlasTexture = layerAtlasTexture;
    this.splatMap = splatMap;
  }

  /**
   * Синхронизирует CPU splat map с GPU RawTexture chunks.
   */
  public updateSplatTexture(): void {
    for (let chunkIndex = 0; chunkIndex < this.splatTextures.length; chunkIndex += 1) {
      this.splatTextures[chunkIndex]?.update(this.splatMap.toRgba8ArrayForChunk(chunkIndex, true));
    }
  }

  /**
   * Освобождает material и все texture resources, созданные builder'ом.
   */
  public dispose(): void {
    this.material.dispose(true, false);
    for (const texture of this.splatTextures) {
      texture.dispose();
    }
    this.layerAtlasTexture.dispose();
  }
}

/**
 * Builder shader-based splat material для paintable terrain layers.
 *
 * Класс разбит на object collaborators: sampler budget policy, factories для
 * splat textures/atlas и shader source factory. Это удерживает WebGL ограничения
 * и материализацию ресурсов внутри одного OOP pipeline.
 */
export class TerrainSplatMaterialBuilder {
  private readonly samplerBudget: TerrainSplatSamplerBudget;
  private readonly splatTextureFactory: TerrainSplatTextureFactory;
  private readonly atlasLayoutResolver: TerrainLayerAtlasLayoutResolver;
  private readonly atlasTextureFactory: TerrainLayerAtlasTextureFactory;
  private readonly tileScalePolicy: TerrainSplatTileScalePolicy;
  private readonly shaderSourceFactory: TerrainSplatShaderSourceFactory;

  public constructor(
    samplerBudget = new TerrainSplatSamplerBudget(),
    splatTextureFactory = new TerrainSplatTextureFactory(),
    atlasLayoutResolver = new TerrainLayerAtlasLayoutResolver(),
    atlasTextureFactory = new TerrainLayerAtlasTextureFactory(),
    tileScalePolicy = new TerrainSplatTileScalePolicy(),
    shaderSourceFactory = new TerrainSplatShaderSourceFactory()
  ) {
    this.samplerBudget = samplerBudget;
    this.splatTextureFactory = splatTextureFactory;
    this.atlasLayoutResolver = atlasLayoutResolver;
    this.atlasTextureFactory = atlasTextureFactory;
    this.tileScalePolicy = tileScalePolicy;
    this.shaderSourceFactory = shaderSourceFactory;
  }

  /**
   * Возвращает максимальное число layers, которое устройство сможет отрисовать.
   */
  public getSupportedLayerCount(scene: Scene, requestedLayerCount: number): number {
    return this.samplerBudget.getSupportedLayerCount(scene, requestedLayerCount);
  }

  /**
   * Создает runtime splat material и привязывает его к mesh.
   */
  public build(
    scene: Scene,
    mesh: Mesh,
    layers: readonly TerrainTextureLayerDescriptor[],
    splatMap: TerrainSplatMap,
    terrainWidth: number,
    terrainDepth: number
  ): TerrainSplatMaterialRuntime {
    if (layers.length === 0) {
      throw new Error("TerrainSplatMaterialBuilder requires at least one texture layer.");
    }
    if (layers.length !== splatMap.layerCount) {
      throw new Error("TerrainSplatMaterialBuilder layer count must match the splat map layer count.");
    }

    const supportedLayerCount = this.getSupportedLayerCount(scene, layers.length);
    if (layers.length > supportedLayerCount) {
      throw new Error(
        `Terrain splat material requires ${this.samplerBudget.getRequiredSamplerCount(layers.length)} texture samplers, but this device supports ${this.samplerBudget.resolveMaxTextureSamplers(scene)}.`
      );
    }

    const splatTextures = this.splatTextureFactory.create(scene, mesh, splatMap);
    const layerAtlasLayout = this.atlasLayoutResolver.resolve(layers.length);
    const layerAtlasTexture = this.atlasTextureFactory.create(scene, mesh, layers, layerAtlasLayout);
    const material = new StandardMaterial(`terrain-splat-material:${mesh.name}`, scene);
    material.backFaceCulling = true;
    material.disableLighting = false;
    material.diffuseColor = Color3.White();
    material.specularColor = Color3.Black();
    material.ambientColor = new Color3(0.12, 0.12, 0.12);

    new TerrainSplatMaterialPlugin(
      material,
      splatTextures,
      layerAtlasTexture,
      layers.length,
      layerAtlasLayout,
      this.tileScalePolicy.resolve(terrainWidth, terrainDepth),
      this.shaderSourceFactory
    );

    mesh.useVertexColors = false;
    mesh.receiveShadows = true;
    mesh.material = material;
    return new TerrainSplatMaterialRuntime(material, splatTextures, layerAtlasTexture, splatMap);
  }
}

class TerrainSplatMaterialPlugin extends MaterialPluginBase {
  private readonly splatTextures: readonly RawTexture[];
  private readonly layerAtlasTexture: DynamicTexture;
  private readonly layerCount: number;
  private readonly layerAtlasLayout: TerrainLayerAtlasLayout;
  private readonly tileScale: number;
  private readonly shaderSourceFactory: TerrainSplatShaderSourceFactory;

  public constructor(
    material: StandardMaterial,
    splatTextures: readonly RawTexture[],
    layerAtlasTexture: DynamicTexture,
    layerCount: number,
    layerAtlasLayout: TerrainLayerAtlasLayout,
    tileScale: number,
    shaderSourceFactory: TerrainSplatShaderSourceFactory
  ) {
    super(material, "TerrainSplat", 200, { TERRAIN_SPLAT: false }, false, false);
    this.splatTextures = splatTextures;
    this.layerAtlasTexture = layerAtlasTexture;
    this.layerCount = layerCount;
    this.layerAtlasLayout = layerAtlasLayout;
    this.tileScale = tileScale;
    this.shaderSourceFactory = shaderSourceFactory;
    this._pluginManager._addPlugin(this);
    this._enable(true);
    this.markAllDefinesAsDirty();
  }

  public override isReadyForSubMesh(
    _defines: MaterialDefines,
    scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh
  ): boolean {
    if (!scene.texturesEnabled) {
      return true;
    }

    return [...this.splatTextures, this.layerAtlasTexture].every((texture) => texture.isReadyOrNotBlocking());
  }

  /**
   * Включает shader defines, необходимые для terrain splat pipeline.
   */
  public override prepareDefines(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
    defines["TERRAIN_SPLAT"] = true;
    defines["UV1"] = true;
    defines["MAINUV1"] = true;
  }

  public override bindForSubMesh(
    uniformBuffer: UniformBuffer,
    scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh
  ): void {
    if (!scene.texturesEnabled) {
      return;
    }

    if (!uniformBuffer.useUbo || !this._material.isFrozen || !uniformBuffer.isSync) {
      uniformBuffer.updateFloat("terrainSplatTileScale", this.tileScale);
      uniformBuffer.updateFloat2("terrainLayerAtlasGrid", this.layerAtlasLayout.columns, this.layerAtlasLayout.rows);
    }

    for (let chunkIndex = 0; chunkIndex < this.splatTextures.length; chunkIndex += 1) {
      const texture = this.splatTextures[chunkIndex];
      if (texture) {
        uniformBuffer.setTexture(`terrainSplatMap${chunkIndex}`, texture);
      }
    }
    uniformBuffer.setTexture("terrainLayerAtlas", this.layerAtlasTexture);
  }

  /**
   * Сообщает Babylon о texture resources, которыми владеет plugin.
   */
  public override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(...this.splatTextures, this.layerAtlasTexture);
  }

  /**
   * Проверяет, относится ли texture к splat material plugin.
   */
  public override hasTexture(texture: BaseTexture): boolean {
    return this.splatTextures.includes(texture as RawTexture) || this.layerAtlasTexture === texture;
  }

  /**
   * Освобождает texture resources только при явном forceDisposeTextures.
   */
  public override dispose(forceDisposeTextures?: boolean): void {
    if (!forceDisposeTextures) {
      return;
    }

    for (const texture of this.splatTextures) {
      texture.dispose();
    }
    this.layerAtlasTexture.dispose();
  }

  /**
   * Возвращает имя plugin class для Babylon diagnostics.
   */
  public override getClassName(): string {
    return "TerrainSplatMaterialPlugin";
  }

  /**
   * Регистрирует sampler names, которые будут использоваться GLSL кодом.
   */
  public override getSamplers(samplers: string[]): void {
    for (let chunkIndex = 0; chunkIndex < this.splatTextures.length; chunkIndex += 1) {
      samplers.push(`terrainSplatMap${chunkIndex}`);
    }
    samplers.push("terrainLayerAtlas");
  }

  /**
   * Гарантирует наличие UV attribute для fragment shader.
   */
  public override getAttributes(attributes: string[]): void {
    if (!attributes.includes("uv")) {
      attributes.push("uv");
    }
  }

  /**
   * Описывает uniforms, которые plugin кладет в Babylon uniform buffer.
   */
  public override getUniforms(): {
    ubo?: Array<{ name: string; size?: number; type?: string; arraySize?: number }>;
    fragment?: string;
  } {
    return {
      ubo: [
        { name: "terrainSplatTileScale", size: 1, type: "float" },
        { name: "terrainLayerAtlasGrid", size: 2, type: "vec2" }
      ]
    };
  }

  /**
   * Встраивает generated GLSL в fragment shader material.
   */
  public override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") {
      return null;
    }

    return {
      CUSTOM_FRAGMENT_DEFINITIONS: [
        this.shaderSourceFactory.generateSamplerDeclarations(this.splatTextures.length),
        this.shaderSourceFactory.generateSplatFunction(this.layerCount, this.splatTextures.length)
      ].join("\n"),
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: this.shaderSourceFactory.generateDiffuseUpdate()
    };
  }
}
