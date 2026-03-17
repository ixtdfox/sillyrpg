import type { AbstractMesh, Node, Scene } from "@babylonjs/core";

/**
 * Selection result for ground used by hex-grid sizing and mouse picking.
 */
export interface HexGridGroundSelection {
  /** Primary ground mesh used for bounds/origin setup. */
  readonly groundMesh: AbstractMesh;

  /** Predicate used by scene picking to accept valid ground hits. */
  readonly isGroundPick: (mesh: AbstractMesh) => boolean;
}

/**
 * Resolves the scene ground mesh for hex-grid initialization.
 */
export class HexGridGroundMeshResolver {
  private static readonly EXACT_GROUND_NAMES = ["ground", "hex-ground", "terrain", "floor"];

  /**
   * Resolves a stable ground selection using explicit conventions.
   *
   * Resolution order:
   * 1) metadata marker `metadata.isGround === true`
   * 2) exact naming convention (`ground`, `terrain`, `floor`, `hex-ground`)
   * 3) single conservative keyword candidate (`ground` or `terrain` in name)
   *
   * This intentionally avoids selecting arbitrary "largest" meshes.
   */
  public resolve(scene: Scene): HexGridGroundSelection {
    const meshes = scene.meshes.filter((mesh) => mesh.getTotalVertices() > 0);

    const metadataMatch = meshes.find((mesh) => (mesh.metadata as { isGround?: unknown } | null | undefined)?.isGround === true);
    if (metadataMatch) {
      return this.createSelection(metadataMatch);
    }

    const exactNameMatch = meshes.find((mesh) => HexGridGroundMeshResolver.EXACT_GROUND_NAMES.includes(mesh.name.toLowerCase()));
    if (exactNameMatch) {
      return this.createSelection(exactNameMatch);
    }

    const conservativeCandidates = meshes.filter((mesh) => {
      const name = mesh.name.toLowerCase();
      return name.includes("ground") || name.includes("terrain");
    });

    if (conservativeCandidates.length === 1) {
      return this.createSelection(conservativeCandidates[0]);
    }

    throw new Error(
      "Hex grid ground mesh was not resolved. Mark ground mesh with metadata.isGround=true or use an exact ground name (ground/terrain/floor/hex-ground)."
    );
  }

  private createSelection(groundMesh: AbstractMesh): HexGridGroundSelection {
    return {
      groundMesh,
      isGroundPick: (mesh: AbstractMesh): boolean => this.isMeshInGroundHierarchy(mesh, groundMesh),
    };
  }

  private isMeshInGroundHierarchy(mesh: AbstractMesh, groundMesh: AbstractMesh): boolean {
    let current: AbstractMesh | null = mesh;

    while (current) {
      if (current === groundMesh) {
        return true;
      }

      const parent: Node | null = current.parent;
      current = parent && "getTotalVertices" in parent ? (parent as AbstractMesh) : null;
    }

    return false;
  }
}
