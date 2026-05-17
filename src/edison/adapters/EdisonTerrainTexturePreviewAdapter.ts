import type { Scene } from "@babylonjs/core";
import type { ImportedSceneTerrainContent } from "../../core/world/scene/SceneContentLoader";
import { EditorTerrainTextureLayerRegistry } from "../../editor/terrain/tools/EditorTerrainTextureLayerRegistry";
import { EditorTerrainTextureMapPersistence } from "../../editor/terrain/tools/EditorTerrainTextureMapPersistence";
import { EditorTerrainTexturePaintRuntime } from "../../editor/terrain/tools/EditorTerrainTexturePaintRuntime";
import type { EditorTerrainInstance } from "../../editor/types";

export class EdisonTerrainTexturePreviewAdapter {
  private readonly textureMapPersistence = new EditorTerrainTextureMapPersistence();
  private readonly textureRuntime: EditorTerrainTexturePaintRuntime;

  public constructor(scene: Scene) {
    this.textureRuntime = new EditorTerrainTexturePaintRuntime(
      scene,
      new EditorTerrainTextureLayerRegistry().getLayers()
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
      terrain as EditorTerrainInstance,
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
