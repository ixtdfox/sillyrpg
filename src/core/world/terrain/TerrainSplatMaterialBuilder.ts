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
import type { TerrainSplatMap } from "./editing/TerrainSplatMap";
import type { TerrainTextureLayerDescriptor } from "./editing/TerrainTextureLayer";

const SPLAT_TEXTURE_CHANNEL_COUNT = 4;
const LAYER_ATLAS_SAMPLER_COUNT = 1;
const LAYER_ATLAS_CELL_SIZE = 256;

interface TerrainLayerAtlasLayout {
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
}

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

  public updateSplatTexture(): void {
    for (let chunkIndex = 0; chunkIndex < this.splatTextures.length; chunkIndex += 1) {
      this.splatTextures[chunkIndex]?.update(this.splatMap.toRgba8ArrayForChunk(chunkIndex, true));
    }
  }

  public dispose(): void {
    this.material.dispose(true, false);
    for (const texture of this.splatTextures) {
      texture.dispose();
    }
    this.layerAtlasTexture.dispose();
  }
}

export class TerrainSplatMaterialBuilder {
  public getSupportedLayerCount(scene: Scene, requestedLayerCount: number): number {
    const maxTextureSamplers = resolveMaxTextureSamplers(scene);
    const normalizedLayerCount = Math.max(0, Math.round(requestedLayerCount));

    for (let layerCount = normalizedLayerCount; layerCount >= 1; layerCount -= 1) {
      if (getRequiredSamplerCount(layerCount) <= maxTextureSamplers) {
        return layerCount;
      }
    }

    return 0;
  }

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
        `Terrain splat material requires ${getRequiredSamplerCount(layers.length)} texture samplers, but this device supports ${resolveMaxTextureSamplers(scene)}.`
      );
    }

    const splatTextures = createSplatTextures(scene, mesh, splatMap);
    const layerAtlasLayout = resolveLayerAtlasLayout(layers.length);
    const layerAtlasTexture = createLayerAtlasTexture(scene, mesh, layers, layerAtlasLayout);
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
      resolveTerrainSplatTileScale(terrainWidth, terrainDepth)
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

  public constructor(
    material: StandardMaterial,
    splatTextures: readonly RawTexture[],
    layerAtlasTexture: DynamicTexture,
    layerCount: number,
    layerAtlasLayout: TerrainLayerAtlasLayout,
    tileScale: number
  ) {
    super(material, "TerrainSplat", 200, { TERRAIN_SPLAT: false }, false, false);
    this.splatTextures = splatTextures;
    this.layerAtlasTexture = layerAtlasTexture;
    this.layerCount = layerCount;
    this.layerAtlasLayout = layerAtlasLayout;
    this.tileScale = tileScale;
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

  public override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(...this.splatTextures, this.layerAtlasTexture);
  }

  public override hasTexture(texture: BaseTexture): boolean {
    return this.splatTextures.includes(texture as RawTexture) || this.layerAtlasTexture === texture;
  }

  public override dispose(forceDisposeTextures?: boolean): void {
    if (!forceDisposeTextures) {
      return;
    }

    for (const texture of this.splatTextures) {
      texture.dispose();
    }
    this.layerAtlasTexture.dispose();
  }

  public override getClassName(): string {
    return "TerrainSplatMaterialPlugin";
  }

  public override getSamplers(samplers: string[]): void {
    for (let chunkIndex = 0; chunkIndex < this.splatTextures.length; chunkIndex += 1) {
      samplers.push(`terrainSplatMap${chunkIndex}`);
    }
    samplers.push("terrainLayerAtlas");
  }

  public override getAttributes(attributes: string[]): void {
    if (!attributes.includes("uv")) {
      attributes.push("uv");
    }
  }

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

  public override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") {
      return null;
    }

    return {
      CUSTOM_FRAGMENT_DEFINITIONS: [
        generateTerrainSplatSamplerDeclarations(this.splatTextures.length),
        generateTerrainSplatFunction(this.layerCount, this.splatTextures.length)
      ].join("\n"),
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: "baseColor.rgb = terrainSplatAlbedo(vMainUV1);"
    };
  }
}

function generateTerrainSplatSamplerDeclarations(splatTextureCount: number): string {
  const lines: string[] = [];
  for (let chunkIndex = 0; chunkIndex < splatTextureCount; chunkIndex += 1) {
    lines.push(`uniform sampler2D terrainSplatMap${chunkIndex};`);
  }
  lines.push("uniform sampler2D terrainLayerAtlas;");
  return lines.join("\n");
}

function createSplatTextures(scene: Scene, mesh: Mesh, splatMap: TerrainSplatMap): RawTexture[] {
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

function createLayerAtlasTexture(
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
  populateLayerAtlasTexture(texture, layers, layout);
  return texture;
}

function populateLayerAtlasTexture(
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
      drawLayerAtlasCell(context, image, layerIndex, layout);
      texture.update(false);
    };
    image.onerror = () => {
      if (disposed) {
        return;
      }
      fillLayerAtlasFallback(context, layer.id, layerIndex, layout);
      texture.update(false);
    };
    image.src = layer.url;
  }

  if (!disposed) {
    texture.update(false);
  }
}

function drawLayerAtlasCell(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  layerIndex: number,
  layout: TerrainLayerAtlasLayout
): void {
  const x = (layerIndex % layout.columns) * layout.cellSize;
  const y = Math.floor(layerIndex / layout.columns) * layout.cellSize;
  context.drawImage(image, x, y, layout.cellSize, layout.cellSize);
}

function fillLayerAtlasFallback(
  context: CanvasRenderingContext2D,
  layerId: string,
  layerIndex: number,
  layout: TerrainLayerAtlasLayout
): void {
  const x = (layerIndex % layout.columns) * layout.cellSize;
  const y = Math.floor(layerIndex / layout.columns) * layout.cellSize;
  context.fillStyle = resolveFallbackLayerColor(layerId);
  context.fillRect(x, y, layout.cellSize, layout.cellSize);
}

function generateTerrainSplatFunction(layerCount: number, splatTextureCount: number): string {
  const lines: string[] = [
    "vec2 terrainSplatAtlasUv(vec2 tiledUv, float layerIndex) {",
    "  float column = mod(layerIndex, terrainLayerAtlasGrid.x);",
    "  float row = floor(layerIndex / terrainLayerAtlasGrid.x);",
    "  vec2 cellUv = clamp(fract(tiledUv), vec2(0.002), vec2(0.998));",
    "  return (vec2(column, row) + cellUv) / terrainLayerAtlasGrid;",
    "}",
    "vec3 terrainSplatAlbedo(vec2 uv) {",
    "  vec2 tiledUv = uv * terrainSplatTileScale;",
    "  vec3 albedo = vec3(0.0);",
    "  float totalWeight = 0.0;"
  ];

  for (let chunkIndex = 0; chunkIndex < splatTextureCount; chunkIndex += 1) {
    lines.push(`  vec4 weights${chunkIndex} = texture2D(terrainSplatMap${chunkIndex}, uv);`);
    for (let channelIndex = 0; channelIndex < SPLAT_TEXTURE_CHANNEL_COUNT; channelIndex += 1) {
      const layerIndex = (chunkIndex * SPLAT_TEXTURE_CHANNEL_COUNT) + channelIndex;
      if (layerIndex >= layerCount) {
        continue;
      }
      const channelName = getSplatChannelName(channelIndex);
      lines.push(`  albedo += texture2D(terrainLayerAtlas, terrainSplatAtlasUv(tiledUv, ${layerIndex}.0)).rgb * weights${chunkIndex}.${channelName};`);
      lines.push(`  totalWeight += weights${chunkIndex}.${channelName};`);
    }
  }

  lines.push("  return albedo / max(totalWeight, 0.0001);");
  lines.push("}");
  return lines.join("\n");
}

function getSplatChannelName(channelIndex: number): string {
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

export function resolveTerrainSplatTileScale(terrainWidth: number, terrainDepth: number): number {
  const maxSize = Math.max(Math.abs(terrainWidth), Math.abs(terrainDepth), 1);
  return Math.max(4, Math.min(24, maxSize / 6));
}

function resolveLayerAtlasLayout(layerCount: number): TerrainLayerAtlasLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(layerCount)));
  const rows = Math.max(1, Math.ceil(layerCount / columns));
  return {
    columns,
    rows,
    cellSize: LAYER_ATLAS_CELL_SIZE
  };
}

function resolveFallbackLayerColor(layerId: string): string {
  let hash = 0;
  for (let index = 0; index < layerId.length; index += 1) {
    hash = ((hash << 5) - hash + layerId.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 36%, 48%)`;
}

function getRequiredSamplerCount(layerCount: number): number {
  return Math.ceil(layerCount / SPLAT_TEXTURE_CHANNEL_COUNT) + LAYER_ATLAS_SAMPLER_COUNT;
}

function resolveMaxTextureSamplers(scene: Scene): number {
  return Math.max(1, scene.getEngine().getCaps().maxTexturesImageUnits ?? 16);
}
