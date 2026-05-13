import { Mesh, type Material, type Scene } from "@babylonjs/core";
import { TerrainSplatMaterialBuilder, type TerrainSplatMaterialRuntime } from "../../../core/world/terrain/TerrainSplatMaterialBuilder";
import type { TerrainHeightField } from "../../../core/world/terrain/TerrainHeightField";
import { TerrainSplatMap } from "../../../core/world/terrain/editing/TerrainSplatMap";
import { TerrainTexturePainter, type TerrainTexturePaintResult } from "../../../core/world/terrain/editing/TerrainTexturePainter";
import type { TerrainBrushCenter, TerrainBrushSettings } from "../../../core/world/terrain/editing/TerrainBrushTypes";
import type { TerrainTextureLayerDescriptor } from "../../../core/world/terrain/editing/TerrainTextureLayer";
import type { EditorTerrainInstance } from "../../types";

export class EditorTerrainTexturePaintRuntime {
  private readonly scene: Scene;
  private readonly layers: readonly TerrainTextureLayerDescriptor[];
  private readonly materialBuilder: TerrainSplatMaterialBuilder;
  private readonly painter: TerrainTexturePainter;
  private splatMap: TerrainSplatMap | null = null;
  private heightField: TerrainHeightField | null = null;
  private materialRuntime: TerrainSplatMaterialRuntime | null = null;
  private selectedLayerId: string | null = null;
  private supportedLayerCount: number;
  private layerLimitMessage = "";
  private hasPaint = false;

  public constructor(
    scene: Scene,
    layers: readonly TerrainTextureLayerDescriptor[],
    materialBuilder = new TerrainSplatMaterialBuilder(),
    painter = new TerrainTexturePainter()
  ) {
    this.scene = scene;
    this.layers = layers;
    this.materialBuilder = materialBuilder;
    this.painter = painter;
    this.supportedLayerCount = this.resolveSupportedLayerCount();
    this.selectedLayerId = this.getPaintableLayers()[0]?.id ?? null;
  }

  public getLayers(): readonly TerrainTextureLayerDescriptor[] {
    return this.layers;
  }

  public getPaintableLayerCount(): number {
    return this.supportedLayerCount;
  }

  public getLayerLimitMessage(): string {
    return this.layerLimitMessage;
  }

  public getSelectedLayerId(): string | null {
    return this.selectedLayerId;
  }

  public selectLayer(layerId: string): { readonly selected: boolean; readonly message: string } {
    const layerIndex = this.layers.findIndex((layer) => layer.id === layerId);
    if (layerIndex < 0) {
      return {
        selected: false,
        message: "Texture layer not found."
      };
    }

    if (layerIndex >= this.getPaintableLayerCount()) {
      return {
        selected: false,
        message: this.layerLimitMessage || "This texture layer is not paintable on the current graphics device."
      };
    }

    this.selectedLayerId = layerId;
    return {
      selected: true,
      message: `Selected texture: ${this.layers[layerIndex]?.label ?? layerId}.`
    };
  }

  public resetForTerrain(terrain: EditorTerrainInstance | null, heightField: TerrainHeightField | null): void {
    this.resetForTerrainWithOptions(terrain, heightField, { allowCreateDefault: true });
  }

  public resetForTerrainWithOptions(
    terrain: EditorTerrainInstance | null,
    heightField: TerrainHeightField | null,
    options: {
      readonly initialSplatMap?: TerrainSplatMap | null;
      readonly allowCreateDefault?: boolean;
    }
  ): void {
    const previousRuntime = this.materialRuntime;
    const previousRuntimeMaterial = previousRuntime?.material ?? null;
    const previousSplatMap = this.splatMap;
    const previousHeightField = this.heightField;
    const previousHasPaint = this.hasPaint;
    this.materialRuntime = null;
    this.splatMap = null;
    this.heightField = heightField;
    this.hasPaint = false;
    this.supportedLayerCount = this.resolveSupportedLayerCount();
    this.ensureSelectedLayerIsPaintable();

    const paintableLayers = this.getPaintableLayers();
    if (!terrain || terrain.descriptor.kind !== "generated" || !heightField || paintableLayers.length === 0) {
      previousRuntime?.dispose();
      return;
    }

    const terrainMesh = terrain.renderableMeshes.find((mesh): mesh is Mesh => mesh instanceof Mesh) ?? null;
    if (!terrainMesh) {
      previousRuntime?.dispose();
      return;
    }

    const previousMaterial = terrainMesh.material;
    const canKeepPreviousRuntime = previousRuntime !== null && previousMaterial === previousRuntimeMaterial;
    const nextSplatMap =
      cloneCompatibleSplatMap(options.initialSplatMap ?? null, paintableLayers.length) ??
      cloneCompatibleSplatMap(previousSplatMap, paintableLayers.length) ??
      (options.allowCreateDefault ? new TerrainSplatMap(256, 256, paintableLayers.length) : null);

    if (!nextSplatMap) {
      previousRuntime?.dispose();
      restoreTerrainMaterial(terrainMesh, previousMaterial);
      this.splatMap = null;
      this.heightField = heightField;
      this.hasPaint = false;
      return;
    }

    try {
      const nextRuntime = this.materialBuilder.build(
        this.scene,
        terrainMesh,
        paintableLayers,
        nextSplatMap,
        heightField.width,
        heightField.depth
      );

      this.splatMap = nextSplatMap;
      this.materialRuntime = nextRuntime;
      this.hasPaint = previousHasPaint && previousSplatMap !== null;
      previousRuntime?.dispose();
      disposePreviousTerrainMaterial(previousMaterial, previousRuntimeMaterial, nextRuntime.material);
    } catch (error) {
      restoreTerrainMaterial(terrainMesh, previousMaterial);
      if (canKeepPreviousRuntime) {
        this.materialRuntime = previousRuntime;
        this.splatMap = previousSplatMap;
        this.heightField = previousHeightField;
        this.hasPaint = previousHasPaint;
      } else {
        previousRuntime?.dispose();
        this.supportedLayerCount = 0;
        this.selectedLayerId = null;
      }
      this.layerLimitMessage = `Texture painting is unavailable: ${formatErrorMessage(error)}`;
      console.error("Failed to initialize terrain texture painting.", error);
    }
  }

  public paint(
    center: TerrainBrushCenter,
    brush: TerrainBrushSettings,
    deltaTime: number
  ): TerrainTexturePaintResult {
    if (!this.splatMap || !this.heightField || !this.materialRuntime || !this.selectedLayerId) {
      return { changedTexelCount: 0 };
    }

    const layerIndex = this.getPaintableLayers().findIndex((layer) => layer.id === this.selectedLayerId);
    if (layerIndex < 0) {
      return { changedTexelCount: 0 };
    }

    const result = this.painter.paint(this.splatMap, {
      center,
      terrainWidth: this.heightField.width,
      terrainDepth: this.heightField.depth,
      brush,
      layerIndex,
      deltaTime
    });
    if (result.changedTexelCount > 0) {
      this.hasPaint = true;
      this.materialRuntime.updateSplatTexture();
    }
    return result;
  }

  public hasPaintedTexture(): boolean {
    return this.hasPaint && this.splatMap !== null;
  }

  public hasEditableTextureMap(): boolean {
    return this.splatMap !== null;
  }

  public isReadyToPaint(): boolean {
    return this.splatMap !== null && this.materialRuntime !== null && this.heightField !== null;
  }

  public createBakeSnapshot(): TerrainSplatMap | null {
    return this.splatMap?.clone() ?? null;
  }

  public getActiveLayers(): readonly TerrainTextureLayerDescriptor[] {
    return this.getPaintableLayers();
  }

  public dispose(): void {
    this.disposeMaterialResources();
    this.splatMap = null;
    this.heightField = null;
    this.hasPaint = false;
  }

  private getPaintableLayers(): readonly TerrainTextureLayerDescriptor[] {
    return this.layers.slice(0, this.supportedLayerCount);
  }

  private ensureSelectedLayerIsPaintable(): void {
    const paintableLayers = this.getPaintableLayers();
    if (!paintableLayers.some((layer) => layer.id === this.selectedLayerId)) {
      this.selectedLayerId = paintableLayers[0]?.id ?? null;
    }
  }

  private disposeMaterialResources(): void {
    this.materialRuntime?.dispose();
    this.materialRuntime = null;
  }

  private resolveSupportedLayerCount(): number {
    const supportedLayerCount = this.materialBuilder.getSupportedLayerCount(this.scene, this.layers.length);
    if (supportedLayerCount < this.layers.length) {
      this.layerLimitMessage =
        `Texture painting is limited to ${supportedLayerCount} of ${this.layers.length} terrain textures by this device's texture sampler limit.`;
    } else {
      this.layerLimitMessage = "";
    }
    return supportedLayerCount;
  }
}

function cloneCompatibleSplatMap(splatMap: TerrainSplatMap | null, layerCount: number): TerrainSplatMap | null {
  if (!splatMap || splatMap.layerCount !== layerCount) {
    return null;
  }

  return splatMap.clone();
}

function disposePreviousTerrainMaterial(
  previousMaterial: Material | null,
  previousRuntimeMaterial: Material | null,
  nextMaterial: Material
): void {
  if (!previousMaterial || previousMaterial === previousRuntimeMaterial || previousMaterial === nextMaterial) {
    return;
  }

  previousMaterial.dispose(true, true);
}

function restoreTerrainMaterial(terrainMesh: Mesh, previousMaterial: Material | null): void {
  if (terrainMesh.material === previousMaterial) {
    return;
  }

  terrainMesh.material?.dispose(true, false);
  terrainMesh.material = previousMaterial;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
