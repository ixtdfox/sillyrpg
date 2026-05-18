import {
  Color3,
  DynamicTexture,
  HighlightLayer,
  Matrix,
  Mesh,
  MeshBuilder,
  Plane,
  StandardMaterial,
  Texture,
  VertexData,
  Vector3,
  type AbstractMesh,
  type Engine,
  type LinesMesh,
  type Scene
} from "@babylonjs/core";
import {
  applyTransform,
  importSceneTerrainContent,
  type ImportedSceneAssetNodes,
  type ImportedSceneContent,
  type ImportedSceneTerrainContent
} from "../../core/world/scene/SceneContentLoader";
import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";
import { TerrainHeightFieldSerializer } from "../../core/world/terrain/TerrainHeightFieldSerializer";
import { TerrainMaterialBuilder } from "../../core/world/terrain/TerrainMaterialBuilder";
import { TerrainMeshBuilder } from "../../core/world/terrain/TerrainMeshBuilder";
import type { TerrainLodAnchor } from "../../core/world/terrain/lod/TerrainQuadtreeLodTypes";
import { EdisonTerrainTexturePreviewAdapter } from "../adapters/EdisonTerrainTexturePreviewAdapter";
import { LightingCoreAdapter } from "../adapters/LightingCoreAdapter";
import { ModelInstantiationAdapter } from "../adapters/ModelInstantiationAdapter";
import type { EdisonSceneOption } from "../adapters/SceneDescriptorAdapter";
import {
  EditorCameraTool,
  type EdisonBounds,
  type EdisonOrientationGizmoAxis,
  type EdisonOrientationGizmoPoint
} from "../tools/EditorCameraTool";
import { EdisonEventBus } from "./EdisonEventBus";
import { EdisonObjectRegistry } from "./EdisonObjectRegistry";
import type { EdisonSelection } from "./EdisonSelectionService";

const GRID_EXTENT = 200;
const GRID_STEP = 1;
const GRID_Y_OFFSET = 0.02;
const BRUSH_PREVIEW_Y_OFFSET = 0.08;

export interface EdisonTerrainBrushPreviewOptions {
  readonly center: { readonly x: number; readonly y: number; readonly z: number };
  readonly radius: number;
  readonly shape: "circle" | "square";
  readonly falloff: number;
  readonly color?: string;
  readonly gridColor?: string;
}

export type EdisonTerrainTexturePaintPreviewSource = HTMLCanvasElement | string;

export class EdisonViewportService {
  private readonly modelAdapter = new ModelInstantiationAdapter();
  private readonly lightingAdapter: LightingCoreAdapter;
  private readonly terrainTexturePreviewAdapter: EdisonTerrainTexturePreviewAdapter;
  private readonly terrainHeightFieldSerializer = new TerrainHeightFieldSerializer();
  private readonly terrainMaterialBuilder = new TerrainMaterialBuilder();
  private readonly terrainMeshBuilder = new TerrainMeshBuilder();
  private readonly cameraTool: EditorCameraTool;
  private readonly highlightLayer: HighlightLayer;
  private readonly highlightedMeshes: Mesh[] = [];
  private readonly gridMeshes: LinesMesh[];
  private readonly brushPreviewMeshes: LinesMesh[] = [];
  private canvasRestore: { readonly parent: Node; readonly nextSibling: Node | null; readonly style: string } | null = null;
  private gridVisible = true;
  private axesVisible = true;
  private terrainLodNeedsRefresh = false;

  public constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly objects: EdisonObjectRegistry,
    private readonly events: EdisonEventBus
  ) {
    this.lightingAdapter = new LightingCoreAdapter(scene);
    this.terrainTexturePreviewAdapter = new EdisonTerrainTexturePreviewAdapter(scene);
    this.cameraTool = new EditorCameraTool(scene, canvas, () => this.frameScene());
    this.highlightLayer = new HighlightLayer("edison-selection-highlight", scene);
    this.gridMeshes = this.createGridMeshes();
    this.applyGridVisibility();
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

  public readonly getCanvas = (): HTMLCanvasElement => {
    return this.canvas;
  };

  public readonly projectWorldPoint = (point: { readonly x: number; readonly y: number; readonly z: number }): { readonly x: number; readonly y: number } | null => {
    if (!this.scene.activeCamera) {
      return null;
    }

    const viewport = this.scene.activeCamera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight());
    const projected = Vector3.Project(
      new Vector3(point.x, point.y, point.z),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      viewport
    );

    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) {
      return null;
    }

    const rect = this.canvas.getBoundingClientRect();
    const renderWidth = Math.max(1, this.engine.getRenderWidth());
    const renderHeight = Math.max(1, this.engine.getRenderHeight());
    return {
      x: rect.left + projected.x * (rect.width / renderWidth),
      y: rect.top + projected.y * (rect.height / renderHeight)
    };
  };

  public readonly setTerrainBrushPreview = (options: EdisonTerrainBrushPreviewOptions): void => {
    this.clearTerrainBrushPreview();
    const preview = this.buildTerrainBrushPreviewLines(options);
    if (!preview) {
      return;
    }

    const outline = MeshBuilder.CreateLineSystem("edison-terrain-brush-preview-outline", {
      lines: preview.outlineLines,
      updatable: false
    }, this.scene);
    outline.color = Color3.FromHexString(options.color ?? "#F7B84B");
    outline.isPickable = false;
    outline.alwaysSelectAsActiveMesh = true;
    outline.metadata = { edisonBrushPreview: true, gameHelper: true };
    this.brushPreviewMeshes.push(outline);

    if (preview.gridLines.length > 0) {
      const grid = MeshBuilder.CreateLineSystem("edison-terrain-brush-preview-grid", {
        lines: preview.gridLines,
        updatable: false
      }, this.scene);
      grid.color = Color3.FromHexString(options.gridColor ?? "#4FB9ED");
      grid.isPickable = false;
      grid.alwaysSelectAsActiveMesh = true;
      grid.metadata = { edisonBrushPreview: true, gameHelper: true };
      this.brushPreviewMeshes.push(grid);
    }
  };

  public readonly clearTerrainBrushPreview = (): void => {
    for (const mesh of this.brushPreviewMeshes.splice(0)) {
      mesh.dispose(false);
    }
  };

  public async loadScene(option: EdisonSceneOption, descriptor: SceneDescriptor): Promise<void> {
    this.clearSceneContent();
    const content = await this.modelAdapter.importScene(this.scene, option, descriptor);
    this.objects.setContent(content);
    await this.applyTerrainTexturePreview(content.terrainContent);
    this.applyGridVisibility();
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
    this.refreshTerrainLod(1);
  }

  public readonly replaceTerrain = async (descriptor: SceneDescriptor): Promise<void> => {
    const current = this.objects.getContent();
    if (!current) {
      return;
    }

    if (await this.updateGeneratedTerrainInPlace(current, descriptor)) {
      return;
    }

    const nextTerrain = descriptor.terrain
      ? await importSceneTerrainContent(this.scene, descriptor.terrain, current.root, "edison", {
          generatedTerrainLodEnabled: false
        })
      : null;

    this.clearTerrainBrushPreview();
    this.terrainTexturePreviewAdapter.dispose();
    this.disposeTerrainContent(current.terrainContent ?? null);
    const nextContent = this.rebuildContentWithTerrain(current, nextTerrain, descriptor);
    this.objects.setContent(nextContent);
    await this.applyTerrainTexturePreview(nextContent.terrainContent);
    this.applyGridVisibility();
    this.lightingAdapter.apply(nextContent.lightingDescriptor, [
      {
        ownerId: "edison:terrain",
        source: "terrain",
        meshes: nextContent.terrainMeshes
      },
      {
        ownerId: "edison:scene-objects",
        source: "sceneObject",
        meshes: nextContent.sceneObjects.flatMap((object) => object.renderableMeshes)
      }
    ]);
    this.refreshTerrainLod(1);
  };

  public readonly applyTerrainTexturePaintPreview = (
    descriptor: SceneDescriptor,
    textureSource: EdisonTerrainTexturePaintPreviewSource
  ): boolean => {
    const current = this.objects.getContent();
    const terrainDescriptor = descriptor.terrain;
    const terrainContent = current?.terrainContent;
    if (!current || terrainDescriptor?.kind !== "generated" || terrainContent?.descriptor.kind !== "generated") {
      return false;
    }

    const meshes = this.collectTerrainPreviewMeshes(current, terrainDescriptor.id);
    if (meshes.length === 0) {
      return false;
    }

    const texture = this.createBakedTexturePreview(`terrain-texture-preview:${terrainDescriptor.id}`, textureSource);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 8;
    for (const mesh of meshes) {
      this.applyBakedTexturePreviewToMesh(mesh, terrainDescriptor.id, texture);
      mesh.metadata = {
        ...(mesh.metadata as Record<string, unknown> | undefined),
        generatedTerrainDescriptor: terrainDescriptor
      };
    }

    const nextTerrainContent: ImportedSceneTerrainContent = {
      ...terrainContent,
      descriptor: terrainDescriptor
    };
    this.objects.setContent(this.rebuildContentWithTerrain(current, nextTerrainContent, descriptor));
    this.applyGridVisibility();
    this.refreshTerrainLod(1);
    return true;
  };

  private collectTerrainPreviewMeshes(current: ImportedSceneContent, terrainId: string): Mesh[] {
    const terrainContent = current.terrainContent;
    const meshes = new Set<Mesh>();
    const append = (mesh: AbstractMesh): void => {
      if (mesh instanceof Mesh && !mesh.isDisposed()) {
        meshes.add(mesh);
      }
    };

    for (const mesh of current.terrainMeshes) {
      append(mesh);
    }
    for (const mesh of terrainContent?.terrainSurfaceMeshes ?? []) {
      append(mesh);
    }
    for (const mesh of terrainContent?.renderableMeshes ?? []) {
      append(mesh);
    }
    for (const mesh of terrainContent?.meshes ?? []) {
      append(mesh);
    }
    for (const mesh of this.scene.meshes) {
      const metadata = (mesh.metadata ?? null) as Record<string, unknown> | null;
      const descriptor = metadata?.generatedTerrainDescriptor as { readonly id?: unknown } | undefined;
      if (
        metadata?.terrainKind === "generated" ||
        descriptor?.id === terrainId ||
        mesh.name.startsWith(`terrain:${terrainId}`)
      ) {
        append(mesh);
      }
    }

    return [...meshes];
  }

  public update(deltaSeconds: number): void {
    if (!this.terrainLodNeedsRefresh) {
      void deltaSeconds;
      return;
    }

    this.terrainLodNeedsRefresh = false;
    this.refreshTerrainLod(Math.max(deltaSeconds, 1));
  }

  private refreshTerrainLod(deltaSeconds: number): void {
    this.terrainLodNeedsRefresh = false;
    const content = this.objects.getContent();
    const camera = this.cameraTool.getCamera();
    if (!content || content.terrainLodControllers.length === 0) {
      return;
    }

    const anchor: TerrainLodAnchor = {
      // Editor camera orbit/zoom should not churn terrain patches. Anchor LOD
      // to the view target, and refresh it only from explicit editor actions.
      position: camera.target.clone(),
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
    this.terrainLodNeedsRefresh = true;
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
    this.events.emit("edison.viewport.changed", { gridVisible: this.gridVisible, axesVisible: this.axesVisible });
  }

  public getAxesVisible(): boolean {
    return this.axesVisible;
  }

  public setCameraAxisView(axis: EdisonOrientationGizmoAxis): void {
    this.cameraTool.setAxisView(axis);
    this.events.emit("edison.viewport.changed", { gridVisible: this.gridVisible, axesVisible: this.axesVisible });
  }

  public resetCameraView(): void {
    this.cameraTool.resetDefaultView();
    this.events.emit("edison.viewport.changed", { gridVisible: this.gridVisible, axesVisible: this.axesVisible });
  }

  public toggleProjectionMode(): void {
    this.cameraTool.toggleProjection();
    this.events.emit("edison.viewport.changed", { gridVisible: this.gridVisible, axesVisible: this.axesVisible });
  }

  public getProjectionMode(): "Perspective" | "Orthographic" {
    return this.cameraTool.getProjectionMode();
  }

  public getOrientationGizmoPoints(): readonly EdisonOrientationGizmoPoint[] {
    return this.cameraTool.getOrientationGizmoPoints();
  }

  public clearSceneContent(): void {
    this.clearTerrainBrushPreview();
    this.terrainTexturePreviewAdapter.dispose();
    const content = this.objects.getContent();
    if (content) {
      this.disposeImportedNodes(content);
      if (!content.root.isDisposed()) {
        content.root.dispose(false);
      }
    }

    this.objects.clear();
    this.applyGridVisibility();
    this.updateSelectionHighlight(null);
  }

  public dispose(): void {
    this.clearTerrainBrushPreview();
    this.terrainTexturePreviewAdapter.dispose();
    this.clearSceneContent();
    for (const mesh of this.gridMeshes) {
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
      lines.push([new Vector3(-GRID_EXTENT, GRID_Y_OFFSET, index), new Vector3(GRID_EXTENT, GRID_Y_OFFSET, index)]);
      lines.push([new Vector3(index, GRID_Y_OFFSET, -GRID_EXTENT), new Vector3(index, GRID_Y_OFFSET, GRID_EXTENT)]);
    }

    const grid = MeshBuilder.CreateLineSystem("edison-grid", { lines, updatable: false }, this.scene);
    grid.color = new Color3(0.31, 0.73, 0.93);
    grid.isPickable = false;
    return [grid];
  }

  private applyGridVisibility(): void {
    for (const mesh of this.gridMeshes) {
      mesh.isVisible = this.gridVisible;
    }
  }

  private buildTerrainBrushPreviewLines(options: EdisonTerrainBrushPreviewOptions): {
    readonly outlineLines: Vector3[][];
    readonly gridLines: Vector3[][];
  } | null {
    const terrain = this.objects.getTerrain();
    if (terrain?.descriptor.kind !== "generated" || !terrain.heightField) {
      return null;
    }

    const radius = Math.max(0.05, Math.min(512, options.radius));
    const falloff = Math.max(0, Math.min(1, options.falloff));
    const worldMatrix = terrain.root.computeWorldMatrix(true);
    const inverseWorld = worldMatrix.clone().invert();
    const centerLocal = Vector3.TransformCoordinates(new Vector3(options.center.x, options.center.y, options.center.z), inverseWorld);
    const sample = (x: number, z: number): Vector3 | null => {
      const y = terrain.heightField?.sampleBilinearLocal(x, z);
      if (y === null || y === undefined) {
        return null;
      }
      return Vector3.TransformCoordinates(new Vector3(x, y + BRUSH_PREVIEW_Y_OFFSET, z), worldMatrix);
    };

    const outlineLines = [
      ...this.buildBrushShapeLines(options.shape, centerLocal, radius, sample)
    ];
    const innerRadius = radius * (1 - falloff);
    if (falloff > 0.01 && innerRadius > 0.05 && innerRadius < radius * 0.98) {
      outlineLines.push(...this.buildBrushShapeLines(options.shape, centerLocal, innerRadius, sample));
    }

    if (outlineLines.length === 0) {
      return null;
    }

    return {
      outlineLines,
      gridLines: this.buildBrushGridLines(options.shape, centerLocal, radius, terrain.descriptor.terrainGridStep ?? 1, sample)
    };
  }

  private buildBrushShapeLines(
    shape: "circle" | "square",
    centerLocal: Vector3,
    radius: number,
    sample: (x: number, z: number) => Vector3 | null
  ): Vector3[][] {
    if (shape === "square") {
      const minX = centerLocal.x - radius;
      const maxX = centerLocal.x + radius;
      const minZ = centerLocal.z - radius;
      const maxZ = centerLocal.z + radius;
      const segments = Math.max(4, Math.ceil((radius * 2) / Math.max(0.5, radius / 24)));
      return [
        this.compactSampledLine(this.buildAxisLineCoordinates(minX, minZ, maxX, minZ, segments), sample),
        this.compactSampledLine(this.buildAxisLineCoordinates(maxX, minZ, maxX, maxZ, segments), sample),
        this.compactSampledLine(this.buildAxisLineCoordinates(maxX, maxZ, minX, maxZ, segments), sample),
        this.compactSampledLine(this.buildAxisLineCoordinates(minX, maxZ, minX, minZ, segments), sample)
      ].filter((line) => line.length >= 2);
    }

    const points: Vector3[] = [];
    const segments = 96;
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const point = sample(centerLocal.x + Math.cos(angle) * radius, centerLocal.z + Math.sin(angle) * radius);
      if (point) {
        points.push(point);
      }
    }
    return points.length >= 2 ? [points] : [];
  }

  private buildBrushGridLines(
    shape: "circle" | "square",
    centerLocal: Vector3,
    radius: number,
    terrainGridStep: number,
    sample: (x: number, z: number) => Vector3 | null
  ): Vector3[][] {
    const lines: Vector3[][] = [];
    const step = Math.max(0.25, terrainGridStep, radius / 28);
    const minX = centerLocal.x - radius;
    const maxX = centerLocal.x + radius;
    const minZ = centerLocal.z - radius;
    const maxZ = centerLocal.z + radius;
    const firstX = Math.ceil(minX / step) * step;
    const firstZ = Math.ceil(minZ / step) * step;
    const appendLine = (coordinates: Array<readonly [number, number]>): void => {
      const line = this.compactSampledLine(coordinates, sample);
      if (line.length >= 2) {
        lines.push(line);
      }
    };

    for (let x = firstX; x <= maxX + 1e-6; x += step) {
      if (shape === "circle") {
        const dx = x - centerLocal.x;
        const extent = Math.sqrt(Math.max(0, radius * radius - dx * dx));
        appendLine(this.buildAxisLineCoordinates(x, centerLocal.z - extent, x, centerLocal.z + extent, Math.max(2, Math.ceil((extent * 2) / Math.max(0.5, step * 0.5)))));
      } else {
        appendLine(this.buildAxisLineCoordinates(x, minZ, x, maxZ, Math.max(2, Math.ceil((maxZ - minZ) / Math.max(0.5, step * 0.5)))));
      }
    }

    for (let z = firstZ; z <= maxZ + 1e-6; z += step) {
      if (shape === "circle") {
        const dz = z - centerLocal.z;
        const extent = Math.sqrt(Math.max(0, radius * radius - dz * dz));
        appendLine(this.buildAxisLineCoordinates(centerLocal.x - extent, z, centerLocal.x + extent, z, Math.max(2, Math.ceil((extent * 2) / Math.max(0.5, step * 0.5)))));
      } else {
        appendLine(this.buildAxisLineCoordinates(minX, z, maxX, z, Math.max(2, Math.ceil((maxX - minX) / Math.max(0.5, step * 0.5)))));
      }
    }

    return lines;
  }

  private buildAxisLineCoordinates(x0: number, z0: number, x1: number, z1: number, segments: number): Array<readonly [number, number]> {
    const coordinates: Array<readonly [number, number]> = [];
    const safeSegments = Math.max(1, Math.min(96, segments));
    for (let index = 0; index <= safeSegments; index += 1) {
      const t = index / safeSegments;
      coordinates.push([
        x0 + (x1 - x0) * t,
        z0 + (z1 - z0) * t
      ]);
    }
    return coordinates;
  }

  private compactSampledLine(
    coordinates: Array<readonly [number, number]>,
    sample: (x: number, z: number) => Vector3 | null
  ): Vector3[] {
    const points: Vector3[] = [];
    for (const [x, z] of coordinates) {
      const point = sample(x, z);
      if (point) {
        points.push(point);
      }
    }
    return points;
  }

  private async updateGeneratedTerrainInPlace(current: ImportedSceneContent, descriptor: SceneDescriptor): Promise<boolean> {
    const terrainDescriptor = descriptor.terrain;
    const terrainContent = current.terrainContent;
    if (terrainDescriptor?.kind !== "generated" || terrainContent?.descriptor.kind !== "generated") {
      return false;
    }

    const mesh = terrainContent.terrainSurfaceMeshes[0];
    if (!(mesh instanceof Mesh)) {
      return false;
    }

    const heightField = this.terrainHeightFieldSerializer.deserialize(terrainDescriptor);
    if (!heightField) {
      return false;
    }

    this.terrainTexturePreviewAdapter.dispose();
    applyTransform(terrainContent.root, terrainDescriptor);
    terrainContent.root.computeWorldMatrix(true);

    const geometry = this.terrainMeshBuilder.buildVertexData(heightField, terrainDescriptor.normalMode);
    const vertexData = new VertexData();
    vertexData.positions = geometry.positions;
    vertexData.indices = geometry.indices;
    vertexData.normals = geometry.normals;
    vertexData.uvs = geometry.uvs;
    vertexData.applyToMesh(mesh, true);

    mesh.metadata = {
      ...(mesh.metadata as Record<string, unknown> | undefined),
      terrainKind: "generated",
      generatedTerrainDescriptor: terrainDescriptor,
      generatedTerrainHeightField: heightField,
      terrainSurfaceCanonical: true,
      terrainCanonicalMeshMode: "FULL_RENDER_FALLBACK"
    };
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    mesh.material?.dispose();
    mesh.material = this.terrainMaterialBuilder.build(this.scene, mesh, terrainDescriptor, heightField, geometry.vertexHeights);

    const nextTerrainContent: ImportedSceneTerrainContent = {
      ...terrainContent,
      descriptor: terrainDescriptor,
      heightField,
      meshes: [mesh],
      renderableMeshes: [mesh],
      terrainSurfaceMeshes: [mesh],
      terrainLodControllers: []
    };
    const nextContent = this.rebuildContentWithTerrain(current, nextTerrainContent, descriptor);
    this.objects.setContent(nextContent);
    await this.applyTerrainTexturePreview(nextContent.terrainContent);
    this.applyGridVisibility();
    this.lightingAdapter.apply(nextContent.lightingDescriptor, [
      {
        ownerId: "edison:terrain",
        source: "terrain",
        meshes: nextContent.terrainMeshes
      },
      {
        ownerId: "edison:scene-objects",
        source: "sceneObject",
        meshes: nextContent.sceneObjects.flatMap((object) => object.renderableMeshes)
      }
    ]);
    this.refreshTerrainLod(1);
    return true;
  }

  private applyBakedTexturePreviewToMesh(
    mesh: Mesh,
    terrainId: string,
    texture: Texture
  ): void {
    const previousMaterial = mesh.material;
    const material = previousMaterial instanceof StandardMaterial
      ? previousMaterial
      : new StandardMaterial(`terrain-material:${terrainId}`, this.scene);
    const previousTexture = material.diffuseTexture;

    mesh.useVertexColors = false;
    material.disableLighting = false;
    material.specularColor = new Color3(0, 0, 0);
    material.ambientColor = new Color3(0.12, 0.12, 0.12);
    material.diffuseColor = new Color3(1, 1, 1);
    material.diffuseTexture = texture;
    mesh.material = material;

    if (previousTexture && previousTexture !== texture) {
      previousTexture.dispose();
    }
    if (previousMaterial && previousMaterial !== material) {
      previousMaterial.dispose();
    }
  }

  private createBakedTexturePreview(
    name: string,
    textureSource: EdisonTerrainTexturePaintPreviewSource
  ): Texture {
    if (typeof textureSource === "string") {
      return new Texture(textureSource, this.scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    }

    const texture = new DynamicTexture(
      name,
      {
        width: textureSource.width,
        height: textureSource.height
      },
      this.scene,
      false,
      Texture.TRILINEAR_SAMPLINGMODE
    );
    const context = texture.getContext();
    context.clearRect(0, 0, textureSource.width, textureSource.height);
    context.drawImage(textureSource, 0, 0);
    texture.update(false);
    return texture;
  }

  private rebuildContentWithTerrain(
    current: ImportedSceneContent,
    terrainContent: ImportedSceneTerrainContent | null,
    descriptor: SceneDescriptor
  ): ImportedSceneContent {
    const sceneObjectMeshes = current.sceneObjects.flatMap((object) => object.meshes);
    const sceneObjectRenderableMeshes = current.sceneObjects.flatMap((object) => object.renderableMeshes);
    const sceneObjectHelperMeshes = current.sceneObjects.flatMap((object) => object.helperMeshes);
    const sceneObjectTransformNodes = current.sceneObjects.flatMap((object) => object.transformNodes);
    const sceneObjectSkeletons = current.sceneObjects.flatMap((object) => object.skeletons);
    const sceneObjectAnimationGroups = current.sceneObjects.flatMap((object) => object.animationGroups);
    const sceneObjectParticleSystems = current.sceneObjects.flatMap((object) => object.particleSystems);

    return {
      ...current,
      terrainContent,
      terrainRoot: terrainContent?.root,
      terrainMeshes: terrainContent?.terrainSurfaceMeshes ?? [],
      terrainLodControllers: terrainContent?.terrainLodControllers ?? [],
      terrainDescriptor: descriptor.terrain,
      meshes: [...(terrainContent?.meshes ?? []), ...sceneObjectMeshes],
      renderableMeshes: [...(terrainContent?.renderableMeshes ?? []), ...sceneObjectRenderableMeshes],
      helperMeshes: [...(terrainContent?.helperMeshes ?? []), ...sceneObjectHelperMeshes],
      transformNodes: [...(terrainContent?.transformNodes ?? []), ...sceneObjectTransformNodes],
      skeletons: [...(terrainContent?.skeletons ?? []), ...sceneObjectSkeletons],
      animationGroups: [...(terrainContent?.animationGroups ?? []), ...sceneObjectAnimationGroups],
      particleSystems: [...(terrainContent?.particleSystems ?? []), ...sceneObjectParticleSystems],
      summary: {
        ...current.summary,
        terrainLabel: descriptor.terrain ? `${descriptor.terrain.kind}:${descriptor.terrain.id}` : "none"
      }
    };
  }

  private disposeTerrainContent(terrain: ImportedSceneTerrainContent | null): void {
    if (!terrain) {
      return;
    }

    this.disposeImportedNodes(terrain);
    if (!terrain.root.isDisposed()) {
      terrain.root.dispose(false);
    }
  }

  private disposeImportedNodes(nodes: ImportedSceneAssetNodes): void {
    const terrainLodControllers = "terrainLodControllers" in nodes
      ? (nodes.terrainLodControllers as ImportedSceneContent["terrainLodControllers"])
      : [];
    for (const controller of terrainLodControllers) {
      controller.dispose();
    }
    for (const animationGroup of nodes.animationGroups) {
      animationGroup.dispose();
    }
    for (const particleSystem of nodes.particleSystems) {
      particleSystem.dispose();
    }
    for (const skeleton of nodes.skeletons) {
      skeleton.dispose();
    }
    for (const transformNode of nodes.transformNodes) {
      if (!transformNode.isDisposed()) {
        transformNode.dispose(false);
      }
    }
    for (const mesh of nodes.meshes) {
      if (!mesh.isDisposed()) {
        mesh.dispose(false, true);
      }
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

  private async applyTerrainTexturePreview(terrain: ImportedSceneContent["terrainContent"]): Promise<void> {
    try {
      const applied = await this.terrainTexturePreviewAdapter.apply(terrain);
      if (applied) {
        this.events.emit("edison.message", { text: "Loaded terrain texture paint preview." });
      }
    } catch (error) {
      this.events.emit("edison.message", {
        text: `Unable to load terrain texture paint preview. ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
}
