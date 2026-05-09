import { Color3, Color4, StandardMaterial, VertexBuffer, type Mesh, type Scene } from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor, SceneTerrainMaterialBandDescriptor } from "../scene/SceneDescriptor";
import type { TerrainHeightField } from "./TerrainHeightField";

export class TerrainMaterialBuilder {
  public build(scene: Scene, mesh: Mesh, descriptor: SceneGeneratedTerrainDescriptor, heightField: TerrainHeightField): StandardMaterial {
    const material = new StandardMaterial(`terrain-material:${descriptor.id}`, scene);
    material.specularColor = new Color3(0, 0, 0);
    material.ambientColor = new Color3(0.12, 0.12, 0.12);

    if (descriptor.material?.kind === "heightBands" && descriptor.material.bands?.length) {
      mesh.setVerticesData(VertexBuffer.ColorKind, this.buildBandColors(heightField, descriptor.material.bands), true);
      material.diffuseColor = new Color3(1, 1, 1);
      material.emissiveColor = new Color3(0.08, 0.08, 0.08);
      mesh.useVertexColors = true;
      return material;
    }

    material.diffuseColor = resolveColor3(descriptor.material?.color ?? "#8D9298");
    return material;
  }

  private buildBandColors(heightField: TerrainHeightField, bands: readonly SceneTerrainMaterialBandDescriptor[]): number[] {
    const colors: number[] = [];
    for (let index = 0; index < heightField.heights.length; index += 1) {
      const height = heightField.heights[index] ?? 0;
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
