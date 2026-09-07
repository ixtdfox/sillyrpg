import type { AbstractMesh, Node } from "@babylonjs/core";
import { NavigationMetadataParser } from "../../navigation/BuildingNavigationMetadata";
import { parseBuildingVisibilityMesh } from "../../scene/visibility/BuildingVisibilityMetadata";
import type { ImportedSceneObjectContent } from "./SceneContentLoader";

export interface RuntimeSceneObjectPreparationResult {
  readonly prepared: boolean;
  readonly frozenNodeCount: number;
  readonly pickableMeshCountBefore: number;
  readonly pickableMeshCountAfter: number;
}

/** Applies runtime-only static preparation without changing editor import behavior. */
export class RuntimeSceneObjectPreparer {
  public constructor(
    private readonly navigationMetadataParser: NavigationMetadataParser = NavigationMetadataParser.getShared()
  ) {}

  public prepare(content: ImportedSceneObjectContent): RuntimeSceneObjectPreparationResult {
    if (content.type !== "building" && content.type !== "street" && content.type !== "interior") {
      return this.createSkippedResult(content);
    }

    const pickableMeshCountBefore = content.renderableMeshes.filter((mesh) => mesh.isPickable).length;
    if (content.type === "building") {
      for (const mesh of content.renderableMeshes) {
        mesh.isPickable = this.mustRemainPickable(mesh);
      }
    }

    let frozenNodeCount = 0;
    if (this.canFreezeTransforms(content)) {
      const nodes = this.collectUniqueTransformNodes(content);
      for (const node of nodes) {
        node.computeWorldMatrix(true);
      }
      for (const node of nodes) {
        node.freezeWorldMatrix();
        frozenNodeCount += 1;
      }
    }

    content.root.metadata = {
      ...(content.root.metadata as Record<string, unknown> | undefined),
      runtimeStaticPrepared: true,
      runtimeFrozenNodeCount: frozenNodeCount
    };

    return {
      prepared: true,
      frozenNodeCount,
      pickableMeshCountBefore,
      pickableMeshCountAfter: content.renderableMeshes.filter((mesh) => mesh.isPickable).length
    };
  }

  private mustRemainPickable(mesh: AbstractMesh): boolean {
    if (this.hasExplicitPickOrInteractionBehavior(mesh)) {
      return true;
    }

    if (/(wall|railing|border|ceiling|window|door|glass|frame|sill|reveal)/i.test(mesh.name)) {
      return false;
    }

    if (this.navigationMetadataParser.parseStairPickMetadata(mesh)?.isStairLike) {
      return true;
    }

    const navigation = this.navigationMetadataParser.parseGameNavigationMetadata(mesh);
    if (navigation?.kind === "floor" || navigation?.kind === "stairs") {
      return true;
    }

    const building = parseBuildingVisibilityMesh(mesh);
    const surfaceLabel = `${building?.part ?? ""} ${mesh.name}`;
    return (
      this.navigationMetadataParser.isNavigationPickableSurface(mesh) &&
      /(floor|platform|landing|balcony|walkway|terrace(?![_ -]?railing))/i.test(surfaceLabel)
    );
  }

  private hasExplicitPickOrInteractionBehavior(mesh: AbstractMesh): boolean {
    const meshWithActions = mesh as AbstractMesh & { readonly actionManager?: unknown };
    if (meshWithActions.actionManager) {
      return true;
    }

    let node: Node | null = mesh;
    while (node) {
      const metadata = this.resolveMetadataRecord(node.metadata);
      if (
        metadata.game_pickable === true ||
        metadata.game_interactable === true ||
        metadata.interactable === true ||
        metadata.pickable === true
      ) {
        return true;
      }
      node = node.parent;
    }

    return false;
  }

  private canFreezeTransforms(content: ImportedSceneObjectContent): boolean {
    if (
      content.skeletons.length > 0 ||
      content.animationGroups.length > 0 ||
      content.particleSystems.length > 0
    ) {
      return false;
    }

    const nodes = [content.root, ...content.transformNodes, ...content.meshes];
    if (nodes.some((node) => this.hasTransformInteractionBehavior(node))) {
      return false;
    }

    return [...content.transformNodes, ...content.meshes].every((node) => {
      const animatedNode = node as Node & { readonly animations?: readonly unknown[] };
      const mesh = node as AbstractMesh & { readonly morphTargetManager?: unknown };
      return (animatedNode.animations?.length ?? 0) === 0 && !mesh.morphTargetManager;
    });
  }

  private hasTransformInteractionBehavior(node: Node): boolean {
    const nodeWithActions = node as Node & { readonly actionManager?: unknown };
    if (nodeWithActions.actionManager) {
      return true;
    }

    const metadata = this.resolveMetadataRecord(node.metadata);
    return (
      metadata.game_interactable === true ||
      metadata.interactable === true ||
      metadata.trigger !== undefined ||
      metadata.game_trigger !== undefined
    );
  }

  private collectUniqueTransformNodes(content: ImportedSceneObjectContent) {
    const nodes = [content.root, ...content.transformNodes, ...content.meshes];
    return [...new Map(nodes.map((node) => [node.uniqueId, node])).values()];
  }

  private resolveMetadataRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const metadata = value as Record<string, unknown>;
    const gltf = metadata.gltf;
    if (gltf && typeof gltf === "object" && !Array.isArray(gltf)) {
      const extras = (gltf as Record<string, unknown>).extras;
      if (extras && typeof extras === "object" && !Array.isArray(extras)) {
        return { ...metadata, ...(extras as Record<string, unknown>) };
      }
    }

    return metadata;
  }

  private createSkippedResult(content: ImportedSceneObjectContent): RuntimeSceneObjectPreparationResult {
    const pickableMeshCount = content.renderableMeshes.filter((mesh) => mesh.isPickable).length;
    return {
      prepared: false,
      frozenNodeCount: 0,
      pickableMeshCountBefore: pickableMeshCount,
      pickableMeshCountAfter: pickableMeshCount
    };
  }
}
