import type { Scene } from "@babylonjs/core";
import type { ImportedSceneTerrainContent } from "../../core/world/scene/SceneContentLoader";
import { EdisonTerrainTextureLayerRegistry } from "../terrain/texture/EdisonTerrainTextureLayerRegistry";
import { EdisonTerrainTextureMapPersistence } from "../terrain/texture/EdisonTerrainTextureMapPersistence";
import { EdisonTerrainTexturePaintRuntime } from "../terrain/texture/EdisonTerrainTexturePaintRuntime";

export class EdisonTerrainTexturePreviewAdapter {
  private readonly textureMapPersistence = new EdisonTerrainTextureMapPersistence();
  private readonly textureRuntime: EdisonTerrainTexturePaintRuntime;

  public constructor(scene: Scene) {
    this.textureRuntime = new EdisonTerrainTexturePaintRuntime(
      scene,
      new EdisonTerrainTextureLayerRegistry().getLayers()
    );
  }

  public async apply(terrain: ImportedSceneTerrainContent | null | undefined): Promise<boolean> {
    this.textureRuntime.dispose();

    if (
      terrain?.descriptor.kind !== "generated" ||
      !terrain.descriptor.editedTextureMap ||
      !terrain.heightField
    ) {
      return false;
    }

    const loadedTextureMap = await this.textureMapPersistence.load({
      editedTextureMap: terrain.descriptor.editedTextureMap,
      availableLayers: this.textureRuntime.getLayers(),
      maxPaintableLayerCount: this.textureRuntime.getPaintableLayerCount()
    });

    if (!loadedTextureMap) {
      return false;
    }

    this.textureRuntime.resetForTerrainWithOptions(
      terrain,
      terrain.heightField,
      {
        initialSplatMap: loadedTextureMap.splatMap,
        allowCreateDefault: false
      }
    );

    return this.textureRuntime.isReadyToPaint();
  }

  public dispose(): void {
    this.textureRuntime.dispose();
  }
}
