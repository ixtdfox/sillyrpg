import { BoundingBox, Frustum, type Camera, type TransformNode } from "@babylonjs/core";
import type { ImportedSceneObjectContent } from "../../world/scene/SceneContentLoader";

interface TrackedSceneObject {
  readonly content: ImportedSceneObjectContent;
  readonly root: TransformNode;
  readonly initiallyEnabled: boolean;
}

const UPDATE_INTERVAL_SECONDS = 0.1;
const CULLABLE_OBJECT_TYPES = new Set(["street", "interior"]);
export const RUNTIME_FRUSTUM_CULLED_METADATA_KEY = "runtimeFrustumCulled";

/** Broad-phase frustum culling for static decorative scene objects. */
export class SceneObjectVisibilityController {
  private readonly trackedObjects = new Map<number, TrackedSceneObject>();
  private sceneObjectsReference: readonly ImportedSceneObjectContent[] | null = null;
  private elapsedSeconds = UPDATE_INTERVAL_SECONDS;

  public update(
    deltaSeconds: number,
    camera: Camera | null,
    sceneObjects: readonly ImportedSceneObjectContent[],
  ): void {
    const objectsChanged = sceneObjects !== this.sceneObjectsReference;
    if (objectsChanged) {
      this.reconcile(sceneObjects);
    }

    this.elapsedSeconds += Math.max(0, deltaSeconds);
    if (!objectsChanged && this.elapsedSeconds < UPDATE_INTERVAL_SECONDS) {
      return;
    }
    this.elapsedSeconds = 0;

    if (!camera) {
      this.restoreAll();
      return;
    }

    const viewMatrix = camera.getViewMatrix(true);
    const projectionMatrix = camera.getProjectionMatrix(true);
    const frustumPlanes = Frustum.GetPlanes(viewMatrix.multiply(projectionMatrix));

    for (const tracked of this.trackedObjects.values()) {
      const { cullingBounds } = tracked.content;
      if (!cullingBounds || tracked.root.isDisposed()) {
        continue;
      }

      const isInFrustum = BoundingBox.IsInFrustum([...cullingBounds.vectorsWorld], frustumPlanes);
      this.setRuntimeFrustumCulled(tracked.root, tracked.initiallyEnabled && !isInFrustum);
      tracked.root.setEnabled(tracked.initiallyEnabled && isInFrustum);
    }
  }

  public dispose(): void {
    this.restoreAll();
    this.trackedObjects.clear();
    this.sceneObjectsReference = null;
  }

  private reconcile(sceneObjects: readonly ImportedSceneObjectContent[]): void {
    const nextRootIds = new Set(
      sceneObjects
        .filter((content) => this.isCullable(content))
        .map((content) => content.root.uniqueId),
    );

    for (const [rootId, tracked] of this.trackedObjects) {
      if (nextRootIds.has(rootId)) {
        continue;
      }

      this.restore(tracked);
      this.trackedObjects.delete(rootId);
    }

    for (const content of sceneObjects) {
      if (!this.isCullable(content) || this.trackedObjects.has(content.root.uniqueId)) {
        continue;
      }

      this.trackedObjects.set(content.root.uniqueId, {
        content,
        root: content.root,
        initiallyEnabled: content.root.isEnabled(false),
      });
    }

    this.sceneObjectsReference = sceneObjects;
    this.elapsedSeconds = UPDATE_INTERVAL_SECONDS;
  }

  private isCullable(content: ImportedSceneObjectContent): boolean {
    return (
      CULLABLE_OBJECT_TYPES.has(content.type) &&
      content.cullingBounds !== null &&
      content.skeletons.length === 0 &&
      content.animationGroups.length === 0 &&
      content.particleSystems.length === 0
    );
  }

  private restoreAll(): void {
    for (const tracked of this.trackedObjects.values()) {
      this.restore(tracked);
    }
  }

  private restore(tracked: TrackedSceneObject): void {
    if (!tracked.root.isDisposed()) {
      this.setRuntimeFrustumCulled(tracked.root, false);
      tracked.root.setEnabled(tracked.initiallyEnabled);
    }
  }

  private setRuntimeFrustumCulled(root: TransformNode, culled: boolean): void {
    const metadata = root.metadata && typeof root.metadata === "object"
      ? root.metadata as Record<string, unknown>
      : {};
    if (culled) {
      metadata[RUNTIME_FRUSTUM_CULLED_METADATA_KEY] = true;
    } else {
      delete metadata[RUNTIME_FRUSTUM_CULLED_METADATA_KEY];
    }
    root.metadata = metadata;
  }
}
