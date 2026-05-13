import { Color3, Color4, StandardMaterial, Texture, VertexBuffer, type Mesh, type Scene } from "@babylonjs/core";
import { normalizeAssetPath } from "../../model/SceneAssetPath";
import type { SceneGeneratedTerrainDescriptor, SceneTerrainMaterialBandDescriptor } from "../scene/SceneDescriptor";
import type { TerrainHeightField } from "./TerrainHeightField";

export class TerrainMaterialBuilder {
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
      ? resolveColor3(descriptor.material.emissive)
      : new Color3(0, 0, 0);

    mesh.useVertexColors = false;

    if (descriptor.material?.kind === "bakedTexture") {
      material.diffuseColor = resolveColor3(descriptor.material.color ?? "#FFFFFF");
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

    material.diffuseColor = resolveColor3(descriptor.material?.color ?? "#8D9298");
    return material;
  }

  private buildBandColors(vertexHeights: readonly number[], bands: readonly SceneTerrainMaterialBandDescriptor[]): number[] {
    const colors: number[] = [];
    for (let index = 0; index < vertexHeights.length; index += 1) {
      const height = vertexHeights[index] ?? 0;
      const band =
        bands.find((candidate) => height >= candidate.minHeight && height <= candidate.maxHeight) ??
        (height < bands[0]!.minHeight ? bands[0]! : bands[bands.length - 1]!);
      const color = Color4.FromColor3(resolveColor3(band?.color ?? "#8D9298"), 1);
      colors.push(color.r, color.g, color.b, color.a);
    }

    return colors;
  }
}

function resolveColor3(hexColor: string): Color3 {
  try {
    return Color3.FromHexString(hexColor);
  } catch {
    return Color3.FromHexString("#8D9298");
  }
}
