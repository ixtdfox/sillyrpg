import { Color3, Color4, StandardMaterial, Texture, VertexBuffer, type Mesh, type Scene } from "@babylonjs/core";
import { normalizeAssetPath } from "../../model/SceneAssetPath";
import type { SceneGeneratedTerrainDescriptor, SceneTerrainMaterialBandDescriptor } from "../scene/SceneDescriptor";
import { TerrainColorResolver } from "./TerrainColorResolver";
import type { TerrainHeightField } from "./TerrainHeightField";

/**
 * Builder стандартного terrain-материала.
 */
export class TerrainMaterialBuilder {
  private readonly colorResolver: TerrainColorResolver;

  public constructor(colorResolver = new TerrainColorResolver()) {
    this.colorResolver = colorResolver;
  }

  /**
   * Создает Babylon StandardMaterial по descriptor'у terrain.
   */
  public build(
    scene: Scene,
    mesh: Mesh,
    descriptor: SceneGeneratedTerrainDescriptor,
    heightField: TerrainHeightField,
    vertexHeights: readonly number[] = Array.from(heightField.heights)
  ): StandardMaterial {
    const material = new StandardMaterial(`terrain-material:${descriptor.id}`, scene);
    material.disableLighting = false;
    material.specularColor = new Color3(0, 0, 0);
    material.ambientColor = new Color3(0.12, 0.12, 0.12);
    material.emissiveColor = descriptor.material?.emissive
      ? this.colorResolver.resolveColor3(descriptor.material.emissive)
      : new Color3(0, 0, 0);

    mesh.useVertexColors = false;

    if (descriptor.material?.kind === "bakedTexture") {
      material.diffuseColor = this.colorResolver.resolveColor3(descriptor.material.color ?? "#FFFFFF");
      const texture = new Texture(
        normalizeAssetPath(descriptor.material.texture),
        scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE
      );
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 8;
      if (descriptor.material.uvScale) {
        texture.uScale = descriptor.material.uvScale[0];
        texture.vScale = descriptor.material.uvScale[1];
      }
      material.diffuseTexture = texture;
      return material;
    }

    if (descriptor.material?.kind === "heightBands" && descriptor.material.bands?.length) {
      mesh.setVerticesData(VertexBuffer.ColorKind, this.buildBandColors(vertexHeights, descriptor.material.bands), true);
      material.diffuseColor = new Color3(1, 1, 1);
      mesh.useVertexColors = true;
      return material;
    }

    material.diffuseColor = this.colorResolver.resolveColor3(descriptor.material?.color ?? "#8D9298");
    return material;
  }

  /**
   * Преобразует height bands в vertex colors.
   */
  private buildBandColors(vertexHeights: readonly number[], bands: readonly SceneTerrainMaterialBandDescriptor[]): number[] {
    return this.colorResolver.buildHeightBandColors(vertexHeights, bands);
  }
}
