import {
  ArcRotateCamera,
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
import type { EditorBuildingAssetOption } from "../types";

export class BuildingThumbnailService {
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly queue: Array<() => Promise<void>>;
  private readonly thumbnails: Map<string, string | null>;
  private readonly pending: Map<string, Promise<string | null>>;
  private isRunning: boolean;

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
    this.queue = [];
    this.thumbnails = new Map();
    this.pending = new Map();
    this.isRunning = false;
  }

  public getThumbnail(asset: EditorBuildingAssetOption): Promise<string | null> {
    const cached = this.thumbnails.get(asset.rawModelPath);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const existing = this.pending.get(asset.rawModelPath);
    if (existing) {
      return existing;
    }

    const task = new Promise<string | null>((resolve) => {
      this.queue.push(async () => {
        const thumbnail = await this.renderThumbnail(asset.rawModelPath);
        this.thumbnails.set(asset.rawModelPath, thumbnail);
        this.pending.delete(asset.rawModelPath);
        resolve(thumbnail);
      });
      this.runQueue();
    });

    this.pending.set(asset.rawModelPath, task);
    return task;
  }

  public dispose(): void {
    this.engine.dispose();
    this.canvas.remove();
    this.queue.length = 0;
    this.pending.clear();
  }

  private async runQueue(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    while (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        await nextTask();
      }
    }
    this.isRunning = false;
  }

  private async renderThumbnail(modelPath: string): Promise<string | null> {
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.07, 0.09, 0.12, 1);
    const camera = new ArcRotateCamera("building-thumb-camera", -Math.PI / 4, Math.PI / 3, 12, Vector3.Zero(), scene);
    const light = new HemisphericLight("building-thumb-light", new Vector3(0.4, 1, 0.2), scene);
    light.intensity = 1.2;

    const root = new TransformNode("building-thumb-root", scene);

    try {
      const { rootUrl, fileName } = resolveSceneAssetPath(modelPath);
      const importResult = await SceneLoader.ImportMeshAsync(undefined, rootUrl, fileName, scene);

      for (const transformNode of importResult.transformNodes) {
        if (transformNode.parent) {
          continue;
        }

        transformNode.setParent(root, true);
      }

      for (const mesh of importResult.meshes) {
        if (!mesh.parent) {
          mesh.setParent(root, true);
        }

        if (this.isHelperMesh(mesh)) {
          mesh.isVisible = false;
        }
      }

      const renderableMeshes = importResult.meshes.filter((mesh) => mesh.isVisible && mesh.getTotalVertices() > 0);
      if (renderableMeshes.length === 0) {
        scene.dispose();
        return null;
      }

      const bounds = this.resolveBounds(renderableMeshes);
      if (!bounds) {
        scene.dispose();
        return null;
      }

      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min);
      camera.target.copyFrom(center);
      camera.radius = Math.max(size.length() * 1.35, 6);
      scene.activeCamera = camera;

      scene.render();
      await waitForAnimationFrame();
      scene.render();
      return this.canvas.toDataURL("image/png");
    } catch (error) {
      console.warn(`[EditorThumbnail] Failed to build thumbnail for '${modelPath}'.`, error);
      return null;
    } finally {
      scene.dispose();
    }
  }

  private resolveBounds(meshes: readonly AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
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

    if (name.includes("metadata") || id.includes("metadata")) {
      return true;
    }

    if (metadata.editorHelper === true || metadata.gameHelper === true || metadata.isMetadata === true) {
      return true;
    }

    return (
      rawMetadata.editor_helper === true ||
      rawMetadata.game_helper === true ||
      rawMetadata.metadata_carrier === true
    );
  }
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
