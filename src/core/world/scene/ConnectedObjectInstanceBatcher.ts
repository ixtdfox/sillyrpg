import {
  BoundingBox,
  InstancedMesh,
  Matrix,
  Mesh,
  TransformNode,
  Vector3,
  type AbstractMesh
} from "@babylonjs/core";
import type { ImportedSceneObjectContent } from "./SceneContentLoader";

export interface ConnectedObjectInstanceBatcherOptions {
  readonly disposeImportedMesh: (mesh: AbstractMesh) => void;
  readonly markSharedResourceMesh: (mesh: AbstractMesh) => void;
  readonly supportsThinInstances?: () => boolean;
}

export interface ConnectedObjectInstanceBatchResult {
  readonly sceneObjects: readonly ImportedSceneObjectContent[];
  readonly batchCount: number;
  readonly batchedObjectCount: number;
}

interface BatchCandidate {
  readonly content: ImportedSceneObjectContent;
  readonly mesh: InstancedMesh;
  readonly sourceMesh: Mesh;
}

interface CreatedBatch {
  readonly content: ImportedSceneObjectContent;
  readonly batchId: string;
}

const SAFE_ROAD_ASSETS = new Set([
  "road_straight.glb",
  "road_corner_rotated_180.glb",
  "road_t_junction.glb",
  "road_cross.glb"
]);

/** Converts only explicitly allowlisted, render-only roads within one district chunk to thin instances. */
export class ConnectedObjectInstanceBatcher {
  public constructor(private readonly options: ConnectedObjectInstanceBatcherOptions) {}

  public batch(
    parent: TransformNode,
    sceneObjects: readonly ImportedSceneObjectContent[]
  ): ConnectedObjectInstanceBatchResult {
    const supportsThinInstances = this.options.supportsThinInstances?.()
      ?? parent.getScene().getEngine().getCaps().instancedArrays;
    if (!supportsThinInstances) {
      return { sceneObjects, batchCount: 0, batchedObjectCount: 0 };
    }

    const candidates = sceneObjects
      .map((content) => this.createCandidate(content))
      .filter((candidate): candidate is BatchCandidate => candidate !== null);

    const groups = this.groupCandidates(candidates);
    const replacements = new Map<string, ImportedSceneObjectContent>();
    let batchIndex = 0;
    let batchedObjectCount = 0;

    for (const group of groups.values()) {
      if (group.length < 2) {
        continue;
      }

      const batchObject = this.createBatchObject(group, batchIndex);
      if (!batchObject) {
        continue;
      }

      batchIndex += 1;
      batchedObjectCount += group.length;
      replacements.set(batchObject.content.objectId, batchObject.content);
      for (const candidate of group.slice(1)) {
        replacements.set(candidate.content.objectId, this.removeBatchedMeshes(candidate.content, batchObject.batchId));
      }
    }

    return {
      sceneObjects: sceneObjects.map((content) => replacements.get(content.objectId) ?? content),
      batchCount: batchIndex,
      batchedObjectCount
    };
  }

  private createCandidate(content: ImportedSceneObjectContent): BatchCandidate | null {
    const connected = content.descriptor.connected;
    if (
      content.type !== "connected-object" ||
      connected?.groupId !== "road" ||
      connected.presetId !== "asphalt-road" ||
      !SAFE_ROAD_ASSETS.has(this.resolveAssetFileName(content.descriptor.asset)) ||
      content.renderableMeshes.length !== 1 ||
      content.transformNodes.length > 0 ||
      content.skeletons.length > 0 ||
      content.animationGroups.length > 0 ||
      content.particleSystems.length > 0 ||
      content.helperMeshes.some((mesh) => mesh.getTotalVertices() > 0 || this.hasBehaviorMetadata(mesh))
    ) {
      return null;
    }

    const mesh = content.renderableMeshes[0];
    if (
      !(mesh instanceof InstancedMesh) ||
      !(mesh.sourceMesh instanceof Mesh) ||
      mesh.subMeshes.length !== 1 ||
      !mesh.isEnabled(false) ||
      !mesh.isVisible ||
      mesh.visibility <= 0 ||
      mesh.alwaysSelectAsActiveMesh ||
      mesh.checkCollisions ||
      mesh.actionManager ||
      mesh.morphTargetManager ||
      mesh.animations.length > 0 ||
      this.hasBehaviorMetadata(mesh)
    ) {
      return null;
    }

    return { content, mesh, sourceMesh: mesh.sourceMesh };
  }

  private groupCandidates(candidates: readonly BatchCandidate[]): Map<string, BatchCandidate[]> {
    const groups = new Map<string, BatchCandidate[]>();
    for (const candidate of candidates) {
      const materialId = candidate.mesh.material?.uniqueId ?? "none";
      const key = [
        candidate.content.descriptor.asset,
        candidate.sourceMesh.uniqueId,
        materialId,
        candidate.mesh.layerMask,
        candidate.mesh.visibility,
        candidate.mesh.receiveShadows
      ].join("|");
      const group = groups.get(key) ?? [];
      group.push(candidate);
      groups.set(key, group);
    }
    return groups;
  }

  private createBatchObject(
    candidates: readonly BatchCandidate[],
    batchIndex: number
  ): CreatedBatch | null {
    const representative = candidates[0];
    if (!representative) {
      return null;
    }

    const batchRoot = representative.content.root;
    batchRoot.computeWorldMatrix(true);
    const inverseParentWorld = batchRoot.getWorldMatrix().clone().invert();
    const matrices = candidates.map((candidate) =>
      candidate.mesh.computeWorldMatrix(true).clone().multiply(inverseParentWorld)
    );
    const batchId = `runtime-thin-road:${batchIndex}:${representative.content.descriptor.asset}`;

    let host: Mesh | null = null;
    try {
      host = representative.sourceMesh.clone(`${batchId}:${representative.sourceMesh.name}`, batchRoot, true, false);
      if (!host) {
        return null;
      }

      this.resetHostTransform(host);
      host.material = representative.mesh.material;
      host.visibility = representative.mesh.visibility;
      host.layerMask = representative.mesh.layerMask;
      host.receiveShadows = representative.mesh.receiveShadows;
      host.isPickable = false;
      host.thinInstanceEnablePicking = false;
      host.metadata = {
        ...(representative.mesh.metadata as Record<string, unknown> | undefined),
        sceneObjectId: representative.content.objectId,
        sceneObjectType: "connected-object",
        runtimeThinInstanceBatch: true,
        runtimeThinInstanceBatchId: batchId,
        runtimeThinInstanceMemberIds: candidates.map((candidate) => candidate.content.objectId)
      };
      const matrixBuffer = new Float32Array(matrices.length * 16);
      matrices.forEach((matrix, index) => matrix.copyToArray(matrixBuffer, index * 16));
      host.thinInstanceSetBuffer("matrix", matrixBuffer, 16, true);
      host.computeWorldMatrix(true);
      host.thinInstanceRefreshBoundingInfo(true);
      host.freezeWorldMatrix();
      this.options.markSharedResourceMesh(host);
    } catch {
      host?.dispose(false, false);
      return null;
    }

    for (const candidate of candidates) {
      for (const mesh of new Set(candidate.content.meshes)) {
        this.options.disposeImportedMesh(mesh);
      }
    }

    batchRoot.metadata = {
      ...(batchRoot.metadata as Record<string, unknown> | undefined),
      runtimeThinInstanceBatch: true,
      runtimeThinInstanceBatchId: batchId,
      runtimeThinInstanceMemberIds: candidates.map((candidate) => candidate.content.objectId)
    };
    batchRoot.freezeWorldMatrix();
    const bounds = host.getBoundingInfo().boundingBox;
    return {
      batchId,
      content: {
        ...representative.content,
        root: batchRoot,
        cullingBounds: new BoundingBox(bounds.minimumWorld.clone(), bounds.maximumWorld.clone()),
        meshes: [host],
        renderableMeshes: [host],
        helperMeshes: []
      }
    };
  }

  private removeBatchedMeshes(
    content: ImportedSceneObjectContent,
    batchId: string
  ): ImportedSceneObjectContent {
    content.root.metadata = {
      ...(content.root.metadata as Record<string, unknown> | undefined),
      runtimeThinInstanceBatchId: batchId
    };
    return {
      ...content,
      cullingBounds: null,
      meshes: [],
      renderableMeshes: [],
      helperMeshes: []
    };
  }

  private resetHostTransform(host: Mesh): void {
    host.position = Vector3.Zero();
    host.rotation = Vector3.Zero();
    host.rotationQuaternion = null;
    host.scaling = Vector3.One();
    host.setPivotMatrix(Matrix.Identity(), false);
    host.setEnabled(true);
    host.isVisible = true;
  }

  private hasBehaviorMetadata(mesh: AbstractMesh): boolean {
    const records = this.resolveMetadataRecords(mesh.metadata);
    return records.some((record) =>
      record.nav_kind !== undefined ||
      record.game_nav !== undefined ||
      record.game_pickable === true ||
      record.game_interactable === true ||
      record.interactable === true ||
      record.trigger !== undefined ||
      record.game_trigger !== undefined
    );
  }

  private resolveMetadataRecords(value: unknown): readonly Record<string, unknown>[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }

    const metadata = value as Record<string, unknown>;
    const records = [metadata];
    const gltf = metadata.gltf;
    if (gltf && typeof gltf === "object" && !Array.isArray(gltf)) {
      const extras = (gltf as Record<string, unknown>).extras;
      if (extras && typeof extras === "object" && !Array.isArray(extras)) {
        records.push(extras as Record<string, unknown>);
      }
    }
    return records;
  }

  private resolveAssetFileName(assetPath: string): string {
    return assetPath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  }
}
