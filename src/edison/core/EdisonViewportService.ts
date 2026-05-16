import {
  Color3,
  HighlightLayer,
  Matrix,
  Mesh,
  MeshBuilder,
  Plane,
  Vector3,
  type AbstractMesh,
  type Engine,
  type LinesMesh,
  type Scene
} from "@babylonjs/core";
import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";
import type { TerrainLodAnchor } from "../../core/world/terrain/lod/TerrainQuadtreeLodTypes";
import { LightingCoreAdapter } from "../adapters/LightingCoreAdapter";
import { ModelInstantiationAdapter } from "../adapters/ModelInstantiationAdapter";
import type { EdisonSceneOption } from "../adapters/SceneDescriptorAdapter";
import { EditorCameraTool, type EdisonBounds } from "../tools/EditorCameraTool";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import type { EdisonSelection } from "./EdisonSelectionService";

const GRID_EXTENT = 80;
const GRID_STEP = 1;

export class EdisonViewportService {
  private readonly modelAdapter = new ModelInstantiationAdapter();
  private readonly lightingAdapter: LightingCoreAdapter;
  private readonly cameraTool: EditorCameraTool;
  private readonly highlightLayer: HighlightLayer;
  private readonly highlightedMeshes: Mesh[] = [];
  private readonly gridMeshes: LinesMesh[];
  private readonly axesMeshes: LinesMesh[];
  private canvasRestore: { readonly parent: Node; readonly nextSibling: Node | null; readonly style: string } | null = null;
  private gridVisible = true;
  private axesVisible = true;

  public constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly objects: EdisonObjectRegistry,
    private readonly events: EdisonEventBus
  ) {
    this.lightingAdapter = new LightingCoreAdapter(scene);
    this.cameraTool = new EditorCameraTool(scene, canvas, () => this.frameScene());
    this.highlightLayer = new HighlightLayer("edison-selection-highlight", scene);
    this.gridMeshes = this.createGridMeshes();
    this.axesMeshes = this.createAxesMeshes();
    this.applyGridVisibility();
    this.applyAxesVisibility();
  }

  public attachCanvas(host: HTMLElement): void {
    if (!this.canvasRestore && this.canvas.parentNode) {
      this.canvasRestore = {
        parent: this.canvas.parentNode,
        nextSibling: this.canvas.nextSibling,
        style: this.canvas.getAttribute("style") ?? ""
      };
    }

    host.appendChild(this.canvas);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.outline = "none";
    this.engine.resize();
  }

  public async loadScene(option: EdisonSceneOption, descriptor: SceneDescriptor): Promise<void> {
    this.clearSceneContent();
    const content = await this.modelAdapter.importScene(this.scene, option, descriptor);
    this.objects.setContent(content);
    this.lightingAdapter.apply(content.lightingDescriptor, [
      {
        ownerId: "edison:terrain",
        source: "terrain",
        meshes: content.terrainMeshes
      },
      {
        ownerId: "edison:scene-objects",
        source: "sceneObject",
        meshes: content.sceneObjects.flatMap((object) => object.renderableMeshes)
      }
    ]);
    this.frameScene();
  }

  public update(deltaSeconds: number): void {
    const content = this.objects.getContent();
    const camera = this.cameraTool.getCamera();
    if (!content || content.terrainLodControllers.length === 0) {
      return;
    }

    const anchor: TerrainLodAnchor = {
      position: camera.globalPosition.clone(),
      source: "camera-fallback"
    };

    for (const controller of content.terrainLodControllers) {
      controller.update(deltaSeconds, anchor);
    }
  }

  public pickObjectId(clientX: number, clientY: number): string | null {
    const coordinates = this.toRenderCoordinates(clientX, clientY);
    const pick = this.scene.pick(coordinates.x, coordinates.y, (mesh) => {
      return this.objects.resolveObjectIdFromMesh(mesh) !== null;
    });

    if (!pick?.hit || !pick.pickedMesh) {
      return null;
    }

    return this.objects.resolveObjectIdFromMesh(pick.pickedMesh);
  }

  public pickGroundPoint(clientX: number, clientY: number): Vector3 | null {
    const coordinates = this.toRenderCoordinates(clientX, clientY);
    const terrainPick = this.scene.pick(coordinates.x, coordinates.y, (mesh) => this.objects.isTerrainMesh(mesh));
    if (terrainPick?.hit && terrainPick.pickedPoint) {
      return terrainPick.pickedPoint.clone();
    }

    if (!this.scene.activeCamera) {
      return null;
    }

    const ray = this.scene.createPickingRay(coordinates.x, coordinates.y, Matrix.Identity(), this.scene.activeCamera);
    const distance = ray.intersectsPlane(Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up()));
    if (distance === null || distance < 0) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  public updateSelectionHighlight(selection: EdisonSelection): void {
    for (const mesh of this.highlightedMeshes) {
      this.highlightLayer.removeMesh(mesh);
    }
    this.highlightedMeshes.length = 0;

    if (selection?.kind !== "scene-object") {
      return;
    }

    const object = this.objects.getObject(selection.objectId);
    if (!object) {
      return;
    }

    for (const mesh of object.renderableMeshes) {
      if (mesh instanceof Mesh) {
        this.highlightLayer.addMesh(mesh, Color3.FromHexString("#F7B84B"));
        this.highlightedMeshes.push(mesh);
      }
    }
  }

  public frameScene(): void {
    this.cameraTool.frameBounds(this.resolveBounds() ?? this.getDefaultBounds());
    this.engine.resize();
  }

  public setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    this.applyGridVisibility();
    this.events.emit("edison.viewport.changed", { gridVisible: this.gridVisible, axesVisible: this.axesVisible });
  }

  public getGridVisible(): boolean {
    return this.gridVisible;
  }

  public setAxesVisible(visible: boolean): void {
    this.axesVisible = visible;
    this.applyAxesVisibility();
    this.events.emit("edison.viewport.changed", { gridVisible: this.gridVisible, axesVisible: this.axesVisible });
  }

  public getAxesVisible(): boolean {
    return this.axesVisible;
  }

  public clearSceneContent(): void {
    const content = this.objects.getContent();
    if (content) {
      for (const controller of content.terrainLodControllers) {
        controller.dispose();
      }
      for (const animationGroup of content.animationGroups) {
        animationGroup.dispose();
      }
      for (const particleSystem of content.particleSystems) {
        particleSystem.dispose();
      }
      for (const skeleton of content.skeletons) {
        skeleton.dispose();
      }
      if (!content.root.isDisposed()) {
        content.root.dispose(false);
      }
      for (const transformNode of content.transformNodes) {
        if (!transformNode.isDisposed()) {
          transformNode.dispose(false);
        }
      }
      for (const mesh of content.meshes) {
        if (!mesh.isDisposed()) {
          mesh.dispose(false, true);
        }
      }
    }

    this.objects.clear();
    this.updateSelectionHighlight(null);
  }

  public dispose(): void {
    this.clearSceneContent();
    for (const mesh of this.gridMeshes) {
      mesh.dispose(false);
    }
    for (const mesh of this.axesMeshes) {
      mesh.dispose(false);
    }
    this.highlightLayer.dispose();
    this.cameraTool.dispose();
    this.lightingAdapter.dispose();

    if (this.canvasRestore) {
      if (this.canvasRestore.nextSibling && this.canvasRestore.nextSibling.parentNode === this.canvasRestore.parent) {
        this.canvasRestore.parent.insertBefore(this.canvas, this.canvasRestore.nextSibling);
      } else {
        this.canvasRestore.parent.appendChild(this.canvas);
      }
      this.canvas.setAttribute("style", this.canvasRestore.style);
      this.canvasRestore = null;
    }
  }

  private createGridMeshes(): LinesMesh[] {
    const lines: Vector3[][] = [];
    for (let index = -GRID_EXTENT; index <= GRID_EXTENT; index += GRID_STEP) {
      lines.push([new Vector3(-GRID_EXTENT, 0, index), new Vector3(GRID_EXTENT, 0, index)]);
      lines.push([new Vector3(index, 0, -GRID_EXTENT), new Vector3(index, 0, GRID_EXTENT)]);
    }

    const grid = MeshBuilder.CreateLineSystem("edison-grid", { lines, updatable: false }, this.scene);
    grid.color = Color3.FromHexString("#334563");
    grid.isPickable = false;
    return [grid];
  }

  private createAxesMeshes(): LinesMesh[] {
    const createAxis = (name: string, points: Vector3[], color: Color3): LinesMesh => {
      const mesh = MeshBuilder.CreateLines(name, { points, updatable: false }, this.scene);
      mesh.color = color;
      mesh.isPickable = false;
      return mesh;
    };

    return [
      createAxis("edison-axis-x", [Vector3.Zero(), new Vector3(6, 0, 0)], Color3.FromHexString("#E45B45")),
      createAxis("edison-axis-y", [Vector3.Zero(), new Vector3(0, 6, 0)], Color3.FromHexString("#4BC878")),
      createAxis("edison-axis-z", [Vector3.Zero(), new Vector3(0, 0, 6)], Color3.FromHexString("#4B8DF7"))
    ];
  }

  private applyGridVisibility(): void {
    for (const mesh of this.gridMeshes) {
      mesh.isVisible = this.gridVisible;
    }
  }

  private applyAxesVisibility(): void {
    for (const mesh of this.axesMeshes) {
      mesh.isVisible = this.axesVisible;
    }
  }

  private resolveBounds(): EdisonBounds | null {
    const meshes = this.objects.getRenderableMeshes().filter((mesh) => {
      if (mesh.isDisposed() || !mesh.isEnabled()) {
        return false;
      }

      const bounds = mesh.getBoundingInfo().boundingBox;
      const min = bounds.minimumWorld;
      const max = bounds.maximumWorld;
      return [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite);
    });

    if (meshes.length === 0) {
      return null;
    }

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

    return {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ)
    };
  }

  private getDefaultBounds(): EdisonBounds {
    return {
      min: new Vector3(-8, -1, -8),
      max: new Vector3(8, 4, 8)
    };
  }

  private toRenderCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.engine.getRenderWidth(),
      y: ((clientY - rect.top) / rect.height) * this.engine.getRenderHeight()
    };
  }
}
