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
  private static readonly KEYWORD_GROUND_NAMES = ["ground", "terrain", "floor", "walk", "tile"];

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
  public resolve(scene: Scene, preferredMeshes: readonly AbstractMesh[] = []): HexGridGroundSelection {
    const scopeSource = preferredMeshes.length > 0 ? preferredMeshes : scene.meshes;
    const meshes = scopeSource.filter((mesh) => mesh.getTotalVertices() > 0 && !mesh.isDisposed());
    console.debug(
      `[HexGridGroundMeshResolver] Ground resolution started meshCount=${meshes.length} preferredScope=${preferredMeshes.length > 0}.`
    );

    if (meshes.length === 0) {
      throw new Error("[HexGridGroundMeshResolver] No mesh candidates available for ground resolution.");
    }

    this.logCandidateMeshes(meshes);

    const metadataMatches = meshes.filter((mesh) => (mesh.metadata as { isGround?: unknown } | null | undefined)?.isGround === true);
    if (metadataMatches.length > 0) {
      return this.createSelection(this.selectLargestHorizontalMesh(metadataMatches), "metadata.isGround=true");
    }

    const exactNameMatches = meshes.filter((mesh) => {
      const normalizedName = this.normalizeName(mesh.name);
      return HexGridGroundMeshResolver.EXACT_GROUND_NAMES.includes(normalizedName);
    });
    if (exactNameMatches.length > 0) {
      return this.createSelection(this.selectLargestHorizontalMesh(exactNameMatches), "exact-name-match");
    }

    const keywordMatches = meshes.filter((mesh) => {
      const normalizedName = this.normalizeName(mesh.name);
      return HexGridGroundMeshResolver.KEYWORD_GROUND_NAMES.some((token) => normalizedName.includes(token));
    });
    if (keywordMatches.length > 0) {
      return this.createSelection(this.selectLargestHorizontalMesh(keywordMatches), "keyword-name-match");
    }

    const fallback = this.selectLargestHorizontalMesh(meshes);
    if (fallback) {
      return this.createSelection(fallback, "largest-horizontal-footprint-fallback");
    }

    const inspectedMeshes = meshes.map((mesh) => `'${mesh.name}'(id='${mesh.id}')`).join(", ");
    throw new Error(
      `[HexGridGroundMeshResolver] Ground mesh was not resolved. Inspected candidates: ${inspectedMeshes}.`
    );
  }

  private createSelection(groundMesh: AbstractMesh, reason: string): HexGridGroundSelection {
    console.debug(
      `[HexGridGroundMeshResolver] Ground selected mesh='${groundMesh.name}' id='${groundMesh.id}' reason=${reason}.`
    );

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

  private selectLargestHorizontalMesh(meshes: readonly AbstractMesh[]): AbstractMesh {
    const [bestMesh] = [...meshes].sort((left, right) => {
      const leftBounds = left.getBoundingInfo().boundingBox.extendSizeWorld;
      const rightBounds = right.getBoundingInfo().boundingBox.extendSizeWorld;
      const leftArea = (leftBounds.x * 2) * (leftBounds.z * 2);
      const rightArea = (rightBounds.x * 2) * (rightBounds.z * 2);

      if (leftArea !== rightArea) {
        return rightArea - leftArea;
      }

      return left.name.localeCompare(right.name);
    });

    return bestMesh;
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/\.[0-9]+$/u, "");
  }

  private logCandidateMeshes(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      const bounds = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
      const area = (bounds.x * 2) * (bounds.z * 2);
      const metadataGround = (mesh.metadata as { isGround?: unknown } | null | undefined)?.isGround === true;
      console.debug(
        `[HexGridGroundMeshResolver] Candidate mesh='${mesh.name}' id='${mesh.id}' metadataGround=${metadataGround} footprint=${area.toFixed(2)}.`
      );
    }
  }
}
