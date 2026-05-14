import type { AbstractMesh, Node, Scene } from "@babylonjs/core";
import { isNavigationPickableSurface } from "../navigation/BuildingNavigationMetadata";

/**
 * Selection result for ground used by rect-grid sizing and mouse picking.
 */
export interface RectGridGroundSelection {
  /** Primary ground mesh used for bounds/origin setup. */
  readonly groundMesh: AbstractMesh;

  /** All candidate ground meshes participating in grid bounds/picking. */
  readonly groundMeshes: readonly AbstractMesh[];

  /** Predicate used by scene picking to accept valid ground hits. */
  readonly isGroundPick: (mesh: AbstractMesh) => boolean;
}

/**
 * Resolves the scene ground mesh for rect-grid initialization.
 */
export class RectGridGroundMeshResolver {
  private static readonly EXACT_GROUND_NAMES = ["ground", "grid-ground", "terrain", "floor"];
  private static readonly KEYWORD_GROUND_NAMES = ["ground", "terrain", "floor", "walk", "tile"];

  /**
   * Resolves a stable ground selection using explicit conventions.
   *
   * Resolution order:
   * 1) metadata marker `metadata.isGround === true`
   * 2) exact naming convention (`ground`, `terrain`, `floor`, `grid-ground`)
   * 3) single conservative keyword candidate (`ground` or `terrain` in name)
   *
   * This intentionally avoids selecting arbitrary "largest" meshes.
   */
  public resolve(scene: Scene, preferredMeshes: readonly AbstractMesh[] = []): RectGridGroundSelection {
    const scopeSource = preferredMeshes.length > 0 ? preferredMeshes : scene.meshes;
    const meshes = scopeSource.filter((mesh) =>
      mesh.getTotalVertices() > 0 && !mesh.isDisposed() && !isTerrainVisualOnlyMesh(mesh)
    );
    console.debug(
      `[RectGridGroundMeshResolver] Ground resolution started meshCount=${meshes.length} preferredScope=${preferredMeshes.length > 0}.`
    );

    if (meshes.length === 0) {
      throw new Error("[RectGridGroundMeshResolver] No mesh candidates available for ground resolution.");
    }

    this.logCandidateMeshes(meshes);

    const metadataMatches = meshes.filter((mesh) => (mesh.metadata as { isGround?: unknown } | null | undefined)?.isGround === true);
    if (metadataMatches.length > 0) {
      return this.createSelection(this.selectLargestHorizontalMesh(metadataMatches), metadataMatches, "metadata.isGround=true");
    }

    const exactNameMatches = meshes.filter((mesh) => {
      const normalizedName = this.normalizeName(mesh.name);
      return RectGridGroundMeshResolver.EXACT_GROUND_NAMES.includes(normalizedName);
    });
    if (exactNameMatches.length > 0) {
      return this.createSelection(this.selectLargestHorizontalMesh(exactNameMatches), exactNameMatches, "exact-name-match");
    }

    const keywordMatches = meshes.filter((mesh) => {
      const normalizedName = this.normalizeName(mesh.name);
      return RectGridGroundMeshResolver.KEYWORD_GROUND_NAMES.some((token) => normalizedName.includes(token));
    });
    if (keywordMatches.length > 0) {
      return this.createSelection(this.selectLargestHorizontalMesh(keywordMatches), keywordMatches, "keyword-name-match");
    }

    const fallback = this.selectLargestHorizontalMesh(meshes);
    if (fallback) {
      return this.createSelection(fallback, meshes, "largest-horizontal-footprint-fallback");
    }

    const inspectedMeshes = meshes.map((mesh) => `'${mesh.name}'(id='${mesh.id}')`).join(", ");
    throw new Error(
      `[RectGridGroundMeshResolver] Ground mesh was not resolved. Inspected candidates: ${inspectedMeshes}.`
    );
  }

  private createSelection(groundMesh: AbstractMesh, groundMeshes: readonly AbstractMesh[], reason: string): RectGridGroundSelection {
    console.debug(
      `[RectGridGroundMeshResolver] Ground selected mesh='${groundMesh.name}' id='${groundMesh.id}' reason=${reason}.`
    );

    return {
      groundMesh,
      groundMeshes,
      isGroundPick: (mesh: AbstractMesh): boolean =>
        groundMeshes.some((candidate) => this.isMeshInGroundHierarchy(mesh, candidate)) || this.isNavigationPickableSurface(mesh),
    };
  }

  private isNavigationPickableSurface(mesh: AbstractMesh): boolean {
    return isNavigationPickableSurface(mesh);
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
        `[RectGridGroundMeshResolver] Candidate mesh='${mesh.name}' id='${mesh.id}' metadataGround=${metadataGround} footprint=${area.toFixed(2)}.`
      );
    }
  }
}

function isTerrainVisualOnlyMesh(mesh: AbstractMesh): boolean {
  return (mesh.metadata as { terrainVisualOnly?: unknown } | null | undefined)?.terrainVisualOnly === true;
}
