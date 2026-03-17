import type { AbstractMesh, Scene } from "@babylonjs/core";

/**
 * Resolves which scene mesh should be treated as ground for hex picking/grid bounds.
 */
export class InGameGroundMeshResolver {
  /**
   * Finds best ground mesh candidate in the loaded district scene.
   *
   * Assumption: exported districts use mesh name "ground". If not, this resolver
   * falls back to any mesh containing "ground" in its name, then to the largest mesh.
   *
   * @param scene - Scene with district meshes.
   * @returns Ground mesh candidate.
   */
  public resolve(scene: Scene): AbstractMesh {
    const namedGround = scene.getMeshByName("ground");
    if (namedGround) {
      return namedGround;
    }

    const byKeyword = scene.meshes.find((mesh) => mesh.name.toLowerCase().includes("ground"));
    if (byKeyword) {
      return byKeyword;
    }

    const largestMesh = [...scene.meshes]
      .filter((mesh) => mesh.getTotalVertices() > 0)
      .sort((a, b) => b.getBoundingInfo().boundingBox.extendSizeWorld.lengthSquared() - a.getBoundingInfo().boundingBox.extendSizeWorld.lengthSquared())[0];

    if (!largestMesh) {
      throw new Error("No mesh suitable for ground detection was found in in-game scene.");
    }

    return largestMesh;
  }
}
