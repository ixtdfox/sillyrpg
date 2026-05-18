import {
  ArcRotateCamera,
  BoundingBox,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
  type AbstractMesh
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { resolveSceneAssetPath } from "../../core/model/SceneAssetPath";

export class EdisonModelThumbnailService {
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly queue: Array<() => Promise<void>> = [];
  private readonly thumbnails = new Map<string, string | null>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private isRunning = false;

  public constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 160;
    this.canvas.style.position = "fixed";
    this.canvas.style.left = "-9999px";
    this.canvas.style.top = "-9999px";
    this.canvas.style.width = "256px";
    this.canvas.style.height = "160px";
    document.body.appendChild(this.canvas);

    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });
  }

  public getThumbnail(modelPath: string): Promise<string | null> {
    const cached = this.thumbnails.get(modelPath);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const existing = this.pending.get(modelPath);
    if (existing) {
      return existing;
    }

    const task = new Promise<string | null>((resolve) => {
      this.queue.push(async () => {
        const thumbnail = await this.renderThumbnail(modelPath);
        this.thumbnails.set(modelPath, thumbnail);
        this.pending.delete(modelPath);
        resolve(thumbnail);
      });
      void this.runQueue();
    });

    this.pending.set(modelPath, task);
    return task;
  }

  public dispose(): void {
    this.engine.dispose();
    this.canvas.remove();
    this.queue.length = 0;
    this.pending.clear();
    this.thumbnails.clear();
  }

  private async runQueue(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    this.isRunning = false;
  }

  private async renderThumbnail(modelPath: string): Promise<string | null> {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.05, 0.08, 0.13, 1);
    const camera = new ArcRotateCamera("edison-model-thumb-camera", -Math.PI / 3, Math.PI / 2.75, 12, Vector3.Zero(), scene);
    const light = new HemisphericLight("edison-model-thumb-light", new Vector3(0.4, 1, 0.25), scene);
    const root = new TransformNode("edison-model-thumb-root", scene);
    light.intensity = 1.25;

    try {
      const { rootUrl, fileName } = resolveSceneAssetPath(modelPath);
      const importResult = await SceneLoader.ImportMeshAsync(undefined, rootUrl, fileName, scene);
      for (const transformNode of importResult.transformNodes) {
        if (!transformNode.parent) {
          transformNode.parent = root;
        }
      }
      for (const mesh of importResult.meshes) {
        if (!mesh.parent) {
          mesh.parent = root;
        }
        if (this.isHelperMesh(mesh)) {
          mesh.isVisible = false;
          mesh.isPickable = false;
        }
      }

      scene.transformNodes.forEach((node) => node.computeWorldMatrix(true));
      scene.meshes.forEach((mesh) => {
        mesh.computeWorldMatrix(true);
        try {
          mesh.refreshBoundingInfo({});
        } catch {
          // Imported helpers can reject bounding refresh.
        }
      });

      const renderableMeshes = importResult.meshes.filter((mesh) => this.isRenderableThumbnailMesh(mesh));
      if (renderableMeshes.length === 0) {
        return null;
      }

      const bounds = this.resolveBounds(renderableMeshes);
      if (!bounds) {
        return null;
      }

      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min);
      camera.target.copyFrom(center);
      camera.radius = Math.max(Math.max(size.x, size.y, size.z) * 2.25, 5);
      scene.activeCamera = camera;

      await scene.whenReadyAsync();
      scene.render();
      await waitForAnimationFrame();
      scene.render();
      await waitForAnimationFrame();
      scene.render();
      return this.canvas.toDataURL("image/png");
    } catch (error) {
      console.warn(`[EdisonModels] Failed to render thumbnail for '${modelPath}'.`, error);
      return null;
    } finally {
      scene.dispose();
    }
  }

  private resolveBounds(meshes: readonly AbstractMesh[]): { readonly min: Vector3; readonly max: Vector3 } | null {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const mesh of meshes) {
      const bounds = mesh.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bounds.minimumWorld.x);
      minY = Math.min(minY, bounds.minimumWorld.y);
      minZ = Math.min(minZ, bounds.minimumWorld.z);
      maxX = Math.max(maxX, bounds.maximumWorld.x);
      maxY = Math.max(maxY, bounds.maximumWorld.y);
      maxZ = Math.max(maxZ, bounds.maximumWorld.z);
    }

    if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
      return null;
    }

    return {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ)
    };
  }

  private isHelperMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.toLowerCase();
    const id = mesh.id.toLowerCase();
    const metadata = (mesh.metadata ?? {}) as Record<string, unknown>;
    const rawMetadata = (metadata.rawMetadata ?? {}) as Record<string, unknown>;

    if (
      name.includes("metadata") ||
      id.includes("metadata") ||
      name.includes("helper") ||
      id.includes("helper") ||
      name.includes("navigationmetadata") ||
      id.includes("navigationmetadata")
    ) {
      return true;
    }

    return (
      metadata.editorHelper === true ||
      metadata.gameHelper === true ||
      metadata.isMetadata === true ||
      metadata.metadataCarrier === true ||
      rawMetadata.editor_helper === true ||
      rawMetadata.game_helper === true ||
      rawMetadata.metadata_carrier === true
    );
  }

  private isRenderableThumbnailMesh(mesh: AbstractMesh): boolean {
    if (!mesh.isEnabled(true) || !mesh.isVisible || mesh.getTotalVertices() <= 0 || this.isHelperMesh(mesh)) {
      return false;
    }

    const bounds = this.tryGetBounds(mesh);
    if (!bounds) {
      return false;
    }

    const min = bounds.minimumWorld;
    const max = bounds.maximumWorld;
    return [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) && max.y >= -100 && min.y >= -100;
  }

  private tryGetBounds(mesh: AbstractMesh): BoundingBox | null {
    try {
      return mesh.getBoundingInfo().boundingBox;
    } catch {
      return null;
    }
  }
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
