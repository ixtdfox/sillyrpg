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
  type Node as BabylonNode,
  type TransformNode,
  type Scene
} from "@babylonjs/core";
import {
  applyTransform,
  importSceneTerrainContent,
  type ImportedSceneAssetNodes,
  type ImportedSceneContent,
  type ImportedSceneObjectContent,
  type ImportedSceneTerrainContent
} from "../../core/world/scene/SceneContentLoader";
import type { SceneDescriptor, SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";
import { TerrainHeightFieldSerializer } from "../../core/world/terrain/TerrainHeightFieldSerializer";
import { TerrainMaterialBuilder } from "../../core/world/terrain/TerrainMaterialBuilder";
import { TerrainMeshBuilder } from "../../core/world/terrain/TerrainMeshBuilder";
import type { TerrainLodAnchor } from "../../core/world/terrain/lod/TerrainQuadtreeLodTypes";
import { parseBuildingVisibilityMesh } from "../../core/scene/visibility/BuildingVisibilityMetadata";
import { EdisonTerrainTexturePreviewAdapter } from "../adapters/EdisonTerrainTexturePreviewAdapter";
import { LightingCoreAdapter } from "../adapters/LightingCoreAdapter";
import { ModelInstantiationAdapter } from "../adapters/ModelInstantiationAdapter";
import type { EdisonSceneOption } from "../adapters/SceneDescriptorAdapter";
import type { EdisonInteriorEditFloor, EdisonInteriorEditState } from "./EdisonInteriorEditService";
import {
  resolveInteriorMagicFillRooms,
  type EdisonInteriorMagicFillRoom,
  type EdisonInteriorMagicFillStory
} from "./EdisonInteriorMagicFillPlanner";
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
const INTERIOR_GRID_Y_OFFSET = 0.035;
const INTERIOR_SNAP_MAX_DISTANCE_TILES = 1.75;
const FLOOR_SURFACE_PATTERN = /(floor|ground)/i;
const EDIT_HIDDEN_PART_PATTERN = /(ceiling|roof|slab|terrace)/i;

interface InteriorEditRootState {
  readonly root: TransformNode;
  readonly enabled: boolean;
}

interface InteriorEditMeshState {
  readonly mesh: AbstractMesh;
  readonly isVisible: boolean;
  readonly isPickable: boolean;
}

interface InteriorNavigationCell {
  readonly x: number;
  readonly z: number;
}

interface InteriorNavigationEdge {
  readonly a: InteriorNavigationCell;
  readonly b: InteriorNavigationCell;
}

interface InteriorNavigationStory {
  readonly storyIndex: number;
  readonly storyY: number;
  readonly walkableCells: readonly InteriorNavigationCell[];
  readonly blockedEdges: readonly InteriorNavigationEdge[];
  readonly doorEdges: readonly InteriorNavigationEdge[];
}

interface InteriorNavigationContract {
  readonly sourceNode: BabylonNode;
  readonly tileSize: number;
  readonly origin: { readonly x: number; readonly z: number };
  readonly stories: readonly InteriorNavigationStory[];
}

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
  private readonly interiorEditGridMeshes: LinesMesh[] = [];
  private readonly interiorEditRootStates = new Map<number, InteriorEditRootState>();
  private readonly interiorEditMeshStates = new Map<number, InteriorEditMeshState>();
  private interiorEditState: EdisonInteriorEditState | null = null;
  private placementPreview: ImportedSceneObjectContent | null = null;
  private placementPreviewRequest = 0;
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
    texture.anisotropicFilteringLevel = 16;
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

  public async addSceneObject(descriptor: SceneObjectDescriptor): Promise<void> {
    const current = this.objects.getContent();
    if (!current) {
      throw new Error("Load a scene before placing models.");
    }

    const importedObject = await this.modelAdapter.importObject(this.scene, descriptor, current.root);
    const nextContent: ImportedSceneContent = {
      ...current,
      meshes: [...current.meshes, ...importedObject.meshes],
      renderableMeshes: [...current.renderableMeshes, ...importedObject.renderableMeshes],
      helperMeshes: [...current.helperMeshes, ...importedObject.helperMeshes],
      transformNodes: [...current.transformNodes, ...importedObject.transformNodes],
      skeletons: [...current.skeletons, ...importedObject.skeletons],
      animationGroups: [...current.animationGroups, ...importedObject.animationGroups],
      particleSystems: [...current.particleSystems, ...importedObject.particleSystems],
      sceneObjects: [...current.sceneObjects, importedObject],
      summary: {
        ...current.summary,
        objectCount: current.summary.objectCount + 1
      }
    };

    this.objects.setContent(nextContent);
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
    if (this.interiorEditState) {
      this.applyInteriorEditState(this.interiorEditState);
    }
  }

  public async setPlacementPreview(descriptor: SceneObjectDescriptor): Promise<void> {
    const request = ++this.placementPreviewRequest;
    this.disposePlacementPreview();
    const current = this.objects.getContent();
    if (!current) {
      return;
    }

    const imported = await this.modelAdapter.importObject(this.scene, descriptor, current.root);
    if (request !== this.placementPreviewRequest || current !== this.objects.getContent()) {
      this.disposeImportedNodes(imported);
      if (!imported.root.isDisposed()) {
        imported.root.dispose(false);
      }
      return;
    }

    this.placementPreview = imported;
    this.placementPreview.root.setEnabled(false);
    for (const mesh of imported.meshes) {
      mesh.isPickable = false;
      mesh.visibility = 0.45;
      mesh.metadata = {
        ...(mesh.metadata as Record<string, unknown> | undefined),
        edisonPlacementPreview: true,
        gameHelper: true
      };
    }
  }

  public updatePlacementPreviewPosition(position: Vector3): void {
    if (!this.placementPreview) {
      return;
    }

    applyTransform(this.placementPreview.root, {
      position: [position.x, position.y, position.z]
    });
    this.placementPreview.root.computeWorldMatrix(true);
  }

  public setPlacementPreviewVisible(visible: boolean): void {
    this.placementPreview?.root.setEnabled(visible);
  }

  public clearPlacementPreview(): void {
    this.placementPreviewRequest += 1;
    this.disposePlacementPreview();
  }

  public async replaceSceneObject(descriptor: SceneObjectDescriptor): Promise<void> {
    const current = this.objects.getContent();
    if (!current) {
      throw new Error("Load a scene before replacing an object.");
    }

    const existing = current.sceneObjects.find((object) => object.objectId === descriptor.id);
    if (!existing) {
      throw new Error(`Scene object '${descriptor.id}' is not loaded.`);
    }

    const importedObject = await this.modelAdapter.importObject(this.scene, descriptor, current.root);
    this.objects.removeObject(existing.objectId);
    const nextContent: ImportedSceneContent = {
      ...current,
      meshes: replaceImportedNodes(current.meshes, existing.meshes, importedObject.meshes),
      renderableMeshes: replaceImportedNodes(current.renderableMeshes, existing.renderableMeshes, importedObject.renderableMeshes),
      helperMeshes: replaceImportedNodes(current.helperMeshes, existing.helperMeshes, importedObject.helperMeshes),
      transformNodes: replaceImportedNodes(current.transformNodes, existing.transformNodes, importedObject.transformNodes),
      skeletons: replaceImportedNodes(current.skeletons, existing.skeletons, importedObject.skeletons),
      animationGroups: replaceImportedNodes(current.animationGroups, existing.animationGroups, importedObject.animationGroups),
      particleSystems: replaceImportedNodes(current.particleSystems, existing.particleSystems, importedObject.particleSystems),
      sceneObjects: current.sceneObjects.map((object) => object.objectId === descriptor.id ? importedObject : object)
    };

    this.objects.setContent(nextContent);
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
  }

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

  public pickObjectId(clientX: number, clientY: number, objectFilter?: (objectId: string) => boolean): string | null {
    const coordinates = this.toRenderCoordinates(clientX, clientY);
    const pick = this.scene.pick(coordinates.x, coordinates.y, (mesh) => {
      const objectId = this.objects.resolveObjectIdFromMesh(mesh);
      return objectId !== null && (!objectFilter || objectFilter(objectId));
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

  /** Projects an X/Z position onto generated terrain after grid snapping. */
  public projectPointOntoTerrain(point: Vector3): Vector3 {
    const terrain = this.objects.getTerrain();
    if (terrain?.descriptor.kind !== "generated" || !terrain.heightField) {
      return point.clone();
    }

    const worldMatrix = terrain.root.computeWorldMatrix(true);
    const localPoint = Vector3.TransformCoordinates(point, worldMatrix.clone().invert());
    const localY = terrain.heightField.sampleBilinearLocal(localPoint.x, localPoint.z);
    return localY === null
      ? point.clone()
      : Vector3.TransformCoordinates(new Vector3(localPoint.x, localY, localPoint.z), worldMatrix);
  }

  public getInteriorEditFloors(buildingId: string): readonly EdisonInteriorEditFloor[] {
    const building = this.findSceneObjectContent(buildingId);
    if (!building || building.type !== "building") {
      return [];
    }

    const contract = this.resolveInteriorNavigationContract(building);
    if (contract) {
      return contract.stories
        .map((story, index) => ({
          storyIndex: story.storyIndex,
          label: `Floor ${index + 1}`,
          worldY: this.transformInteriorPoint(contract, 0, story.storyY, 0).y
        }))
        .sort((left, right) => left.storyIndex - right.storyIndex);
    }

    const storyYByIndex = new Map<number, number>();
    for (const mesh of building.renderableMeshes) {
      const record = parseBuildingVisibilityMesh(mesh);
      if (!record) {
        continue;
      }
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      const currentY = storyYByIndex.get(record.storyIndex);
      const storyY = bounds.minimumWorld.y;
      storyYByIndex.set(record.storyIndex, currentY === undefined ? storyY : Math.min(currentY, storyY));
    }

    return [...storyYByIndex.entries()]
      .sort(([left], [right]) => left - right)
      .map(([storyIndex, worldY], index) => ({
        storyIndex,
        label: `Floor ${index + 1}`,
        worldY
      }));
  }

  public applyInteriorEditState(state: EdisonInteriorEditState | null): void {
    this.restoreInteriorEditState();
    this.interiorEditState = state;

    if (!state) {
      this.applyGridVisibility();
      this.frameScene();
      return;
    }

    const building = this.findSceneObjectContent(state.activeBuildingId);
    if (!building) {
      return;
    }

    for (const grid of this.gridMeshes) {
      this.rememberRootState(grid);
      grid.setEnabled(false);
    }

    const content = this.objects.getContent();
    if (content?.terrainRoot) {
      this.rememberRootState(content.terrainRoot);
      content.terrainRoot.setEnabled(false);
    }

    for (const object of content?.sceneObjects ?? []) {
      const visible = this.shouldShowObjectInInteriorEdit(object, state);
      this.rememberRootState(object.root);
      object.root.setEnabled(visible);
    }

    this.applyBuildingStoryVisibility(building, state.activeStoryIndex);
    this.createInteriorEditGrid(building, state.activeStoryIndex);
    this.frameScene();
  }

  public pickInteriorFloorPoint(clientX: number, clientY: number, buildingId: string, storyIndex: number): Vector3 | null {
    const building = this.findSceneObjectContent(buildingId);
    if (!building) {
      return null;
    }

    const coordinates = this.toRenderCoordinates(clientX, clientY);
    const pick = this.scene.pick(coordinates.x, coordinates.y, (mesh) => {
      if (this.objects.resolveObjectIdFromMesh(mesh) !== buildingId) {
        return false;
      }

      const record = parseBuildingVisibilityMesh(mesh);
      return record?.storyIndex === storyIndex && FLOOR_SURFACE_PATTERN.test(record.part);
    });
    if (pick?.hit && pick.pickedPoint) {
      return pick.pickedPoint.clone();
    }

    const floor = this.getInteriorEditFloors(buildingId).find((candidate) => candidate.storyIndex === storyIndex);
    if (!floor || !this.scene.activeCamera) {
      return null;
    }

    const ray = this.scene.createPickingRay(coordinates.x, coordinates.y, Matrix.Identity(), this.scene.activeCamera);
    const distance = ray.intersectsPlane(Plane.FromPositionAndNormal(new Vector3(0, floor.worldY, 0), Vector3.Up()));
    return distance === null || distance < 0 ? null : ray.origin.add(ray.direction.scale(distance));
  }

  public snapInteriorFloorPoint(point: Vector3, buildingId: string, storyIndex: number): Vector3 | null {
    const building = this.findSceneObjectContent(buildingId);
    if (!building) {
      return null;
    }

    const contract = this.resolveInteriorNavigationContract(building);
    const story = contract?.stories.find((candidate) => candidate.storyIndex === storyIndex);
    if (!contract || !story) {
      return point.clone();
    }

    const localPoint = this.transformWorldToInteriorPoint(contract, point);
    const center = this.findNearestWalkableCellCenter(contract, story, localPoint);
    if (!center) {
      return null;
    }

    return this.transformInteriorPoint(contract, center.x, story.storyY, center.z);
  }

  public getInteriorMagicFillRooms(buildingId: string): readonly EdisonInteriorMagicFillRoom[] {
    const building = this.findSceneObjectContent(buildingId);
    if (!building) {
      return [];
    }

    const contract = this.resolveInteriorNavigationContract(building);
    if (!contract) {
      return [];
    }

    const stories: EdisonInteriorMagicFillStory[] = contract.stories.map((story) => {
      const worldY = this.transformInteriorPoint(contract, 0, story.storyY, 0).y;
      return {
        storyIndex: story.storyIndex,
        worldY,
        tileSize: contract.tileSize,
        cells: story.walkableCells.map((cell) => {
          const center = this.getInteriorCellCenter(contract, cell);
          const worldCenter = this.transformInteriorPoint(contract, center.x, story.storyY, center.z);
          return {
            x: cell.x,
            z: cell.z,
            worldCenter: [worldCenter.x, worldCenter.y, worldCenter.z]
          };
        }),
        blockedEdges: story.blockedEdges,
        doorEdges: story.doorEdges
      };
    });

    return resolveInteriorMagicFillRooms(stories);
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
    this.interiorEditState = null;
    this.restoreInteriorEditState();
    this.clearPlacementPreview();
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
      return new Texture(textureSource, this.scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    }

    const texture = new DynamicTexture(
      name,
      {
        width: textureSource.width,
        height: textureSource.height
      },
      this.scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE
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

  private disposePlacementPreview(): void {
    if (!this.placementPreview) {
      return;
    }

    this.disposeImportedNodes(this.placementPreview);
    if (!this.placementPreview.root.isDisposed()) {
      this.placementPreview.root.dispose(false);
    }
    this.placementPreview = null;
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

  private restoreInteriorEditState(): void {
    this.clearInteriorEditGrid();

    for (const state of this.interiorEditMeshStates.values()) {
      if (!state.mesh.isDisposed()) {
        state.mesh.isVisible = state.isVisible;
        state.mesh.isPickable = state.isPickable;
      }
    }
    this.interiorEditMeshStates.clear();

    for (const state of this.interiorEditRootStates.values()) {
      if (!state.root.isDisposed()) {
        state.root.setEnabled(state.enabled);
      }
    }
    this.interiorEditRootStates.clear();
  }

  private rememberRootState(root: TransformNode): void {
    if (!this.interiorEditRootStates.has(root.uniqueId)) {
      this.interiorEditRootStates.set(root.uniqueId, {
        root,
        enabled: root.isEnabled(false)
      });
    }
  }

  private rememberMeshState(mesh: AbstractMesh): void {
    if (!this.interiorEditMeshStates.has(mesh.uniqueId)) {
      this.interiorEditMeshStates.set(mesh.uniqueId, {
        mesh,
        isVisible: mesh.isVisible,
        isPickable: mesh.isPickable
      });
    }
  }

  private shouldShowObjectInInteriorEdit(
    object: ImportedSceneObjectContent,
    state: EdisonInteriorEditState
  ): boolean {
    if (object.objectId === state.activeBuildingId) {
      return true;
    }

    return object.type === "interior" &&
      object.descriptor.interiorBuildingId === state.activeBuildingId &&
      this.isInteriorObjectOnStory(object, state);
  }

  private isInteriorObjectOnStory(object: ImportedSceneObjectContent, state: EdisonInteriorEditState): boolean {
    const floors = [...state.floors].sort((left, right) => left.worldY - right.worldY);
    const floorIndex = floors.findIndex((floor) => floor.storyIndex === state.activeStoryIndex);
    const floor = floors[floorIndex];
    if (!floor) {
      return false;
    }

    const nextFloor = floors[floorIndex + 1];
    const y = object.descriptor.position[1];
    return y >= floor.worldY - 0.1 && (!nextFloor || y < nextFloor.worldY - 0.05);
  }

  private applyBuildingStoryVisibility(building: ImportedSceneObjectContent, storyIndex: number): void {
    for (const mesh of building.renderableMeshes) {
      this.rememberMeshState(mesh);
      const record = parseBuildingVisibilityMesh(mesh);
      const visible = !record || this.shouldShowBuildingMeshRecord(record, storyIndex);
      mesh.isVisible = visible;
      mesh.isPickable = visible && this.shouldKeepBuildingMeshPickable(record, storyIndex);
    }
  }

  private shouldShowBuildingMeshRecord(
    record: NonNullable<ReturnType<typeof parseBuildingVisibilityMesh>>,
    storyIndex: number
  ): boolean {
    if (record.lodRole && record.lodRole !== "full") {
      return false;
    }

    const connectsCurrentStory = record.fromStory === storyIndex || record.toStory === storyIndex;
    if (record.storyIndex !== storyIndex && !connectsCurrentStory) {
      return false;
    }

    return !EDIT_HIDDEN_PART_PATTERN.test(record.part);
  }

  private shouldKeepBuildingMeshPickable(
    record: ReturnType<typeof parseBuildingVisibilityMesh>,
    storyIndex: number
  ): boolean {
    return Boolean(record && record.storyIndex === storyIndex && FLOOR_SURFACE_PATTERN.test(record.part));
  }

  private createInteriorEditGrid(building: ImportedSceneObjectContent, storyIndex: number): void {
    const contract = this.resolveInteriorNavigationContract(building);
    const story = contract?.stories.find((candidate) => candidate.storyIndex === storyIndex);
    if (!contract || !story || story.walkableCells.length === 0) {
      return;
    }

    const lines: Vector3[][] = [];
    const tileSize = contract.tileSize;
    for (const cell of story.walkableCells) {
      const x0 = contract.origin.x + cell.x * tileSize;
      const x1 = x0 + tileSize;
      const z0 = contract.origin.z + cell.z * tileSize;
      const z1 = z0 + tileSize;
      const y = story.storyY + INTERIOR_GRID_Y_OFFSET;
      const a = this.transformInteriorPoint(contract, x0, y, z0);
      const b = this.transformInteriorPoint(contract, x1, y, z0);
      const c = this.transformInteriorPoint(contract, x1, y, z1);
      const d = this.transformInteriorPoint(contract, x0, y, z1);
      lines.push([a, b], [b, c], [c, d], [d, a]);
    }

    const grid = MeshBuilder.CreateLineSystem("edison-interior-edit-grid", { lines, updatable: false }, this.scene);
    grid.color = Color3.FromHexString("#F7B84B");
    grid.isPickable = false;
    grid.alwaysSelectAsActiveMesh = true;
    grid.metadata = { edisonInteriorEditGrid: true, gameHelper: true };
    this.interiorEditGridMeshes.push(grid);
  }

  private clearInteriorEditGrid(): void {
    for (const mesh of this.interiorEditGridMeshes.splice(0)) {
      mesh.dispose(false);
    }
  }

  private findSceneObjectContent(objectId: string): ImportedSceneObjectContent | null {
    return this.objects.getContent()?.sceneObjects.find((object) => object.objectId === objectId) ?? null;
  }

  private resolveInteriorNavigationContract(building: ImportedSceneObjectContent): InteriorNavigationContract | null {
    for (const node of this.collectObjectNodes(building)) {
      for (const metadata of this.resolveMetadataCandidates(node)) {
        const rawJson = typeof metadata.game_navigation_json === "string" ? metadata.game_navigation_json : null;
        if (!rawJson) {
          continue;
        }

        try {
          return this.parseInteriorNavigationContract(JSON.parse(rawJson), node);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  private collectObjectNodes(object: ImportedSceneObjectContent): BabylonNode[] {
    return [object.root, ...object.transformNodes, ...object.meshes];
  }

  private resolveMetadataCandidates(node: BabylonNode): Record<string, unknown>[] {
    const metadata = node.metadata;
    if (!metadata || typeof metadata !== "object") {
      return [];
    }

    const record = metadata as Record<string, unknown>;
    const candidates = [record];
    const gltf = record.gltf;
    if (gltf && typeof gltf === "object") {
      const extras = (gltf as Record<string, unknown>).extras;
      if (extras && typeof extras === "object") {
        candidates.push(extras as Record<string, unknown>);
      }
    }
    const extras = record.extras;
    if (extras && typeof extras === "object") {
      candidates.push(extras as Record<string, unknown>);
    }

    return candidates;
  }

  private parseInteriorNavigationContract(value: unknown, sourceNode: BabylonNode): InteriorNavigationContract | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const origin = record.origin && typeof record.origin === "object" && !Array.isArray(record.origin)
      ? record.origin as Record<string, unknown>
      : null;
    const stories = Array.isArray(record.stories) ? record.stories : [];
    const tileSize = typeof record.tile_size_m === "number" && Number.isFinite(record.tile_size_m)
      ? record.tile_size_m
      : 1;
    const parsedStories = stories
      .map((story) => this.parseInteriorNavigationStory(story))
      .filter((story): story is InteriorNavigationStory => story !== null);
    if (!origin || parsedStories.length === 0) {
      return null;
    }

    return {
      sourceNode,
      tileSize,
      origin: {
        x: typeof origin.x === "number" && Number.isFinite(origin.x) ? origin.x : 0,
        z: typeof origin.z === "number" && Number.isFinite(origin.z) ? origin.z : 0
      },
      stories: parsedStories
    };
  }

  private parseInteriorNavigationStory(value: unknown): InteriorNavigationStory | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const storyIndex = typeof record.story_index === "number" && Number.isInteger(record.story_index)
      ? record.story_index
      : null;
    const storyY = typeof record.story_y_m === "number" && Number.isFinite(record.story_y_m)
      ? record.story_y_m
      : null;
    const rawWalkableCells = Array.isArray(record.walkable_cells) ? record.walkable_cells : [];
    if (storyIndex === null || storyY === null) {
      return null;
    }

    return {
      storyIndex,
      storyY,
      walkableCells: rawWalkableCells
        .map((cell) => this.parseInteriorNavigationCell(cell))
        .filter((cell): cell is InteriorNavigationCell => cell !== null),
      blockedEdges: this.parseInteriorNavigationEdges(record.blocked_edges),
      doorEdges: this.parseInteriorNavigationEdges(record.door_edges)
    };
  }

  private parseInteriorNavigationEdges(value: unknown): InteriorNavigationEdge[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((edge) => this.parseInteriorNavigationEdge(edge))
      .filter((edge): edge is InteriorNavigationEdge => edge !== null);
  }

  private parseInteriorNavigationEdge(value: unknown): InteriorNavigationEdge | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const a = this.parseInteriorNavigationCell(record.a);
    const b = this.parseInteriorNavigationCell(record.b);
    return a && b ? { a, b } : null;
  }

  private parseInteriorNavigationCell(value: unknown): InteriorNavigationCell | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return typeof record.x === "number" && Number.isInteger(record.x) &&
      typeof record.z === "number" && Number.isInteger(record.z)
      ? { x: record.x, z: record.z }
      : null;
  }

  private transformInteriorPoint(contract: InteriorNavigationContract, x: number, y: number, z: number): Vector3 {
    contract.sourceNode.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(new Vector3(x, y, z), contract.sourceNode.getWorldMatrix());
  }

  private transformWorldToInteriorPoint(contract: InteriorNavigationContract, point: Vector3): Vector3 {
    contract.sourceNode.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(point, contract.sourceNode.getWorldMatrix().clone().invert());
  }

  private findNearestWalkableCellCenter(
    contract: InteriorNavigationContract,
    story: InteriorNavigationStory,
    point: Vector3
  ): { readonly x: number; readonly z: number } | null {
    const cellSet = new Set(story.walkableCells.map((cell) => this.getInteriorCellKey(cell)));
    const containingCell = this.getInteriorCellAtPoint(contract, point);
    if (cellSet.has(this.getInteriorCellKey(containingCell))) {
      return this.getInteriorCellCenter(contract, containingCell);
    }

    const blockedWallEdges = this.getInteriorBlockedWallEdgeKeys(story);
    const wallAdjacentCenters = this.getInteriorCardinalNeighbors(containingCell)
      .filter((neighbor) => {
        return cellSet.has(this.getInteriorCellKey(neighbor)) &&
          blockedWallEdges.has(this.getInteriorEdgeKey(containingCell, neighbor));
      })
      .map((neighbor) => this.getInteriorCellCenter(contract, neighbor));
    if (wallAdjacentCenters.length > 0) {
      return this.getNearestInteriorCenter(point, wallAdjacentCenters);
    }

    const maxDistance = contract.tileSize * INTERIOR_SNAP_MAX_DISTANCE_TILES;
    const maxDistanceSq = maxDistance * maxDistance;
    let bestCenter: { readonly x: number; readonly z: number } | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const cell of story.walkableCells) {
      const center = this.getInteriorCellCenter(contract, cell);
      const distanceSq = (center.x - point.x) ** 2 + (center.z - point.z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestCenter = center;
        bestDistanceSq = distanceSq;
      }
    }

    return bestCenter && bestDistanceSq <= maxDistanceSq ? bestCenter : null;
  }

  private getNearestInteriorCenter(
    point: Vector3,
    centers: readonly { readonly x: number; readonly z: number }[]
  ): { readonly x: number; readonly z: number } | null {
    let bestCenter: { readonly x: number; readonly z: number } | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const center of centers) {
      const distanceSq = (center.x - point.x) ** 2 + (center.z - point.z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestCenter = center;
        bestDistanceSq = distanceSq;
      }
    }
    return bestCenter;
  }

  private getInteriorCellAtPoint(contract: InteriorNavigationContract, point: Vector3): InteriorNavigationCell {
    return {
      x: Math.floor((point.x - contract.origin.x) / contract.tileSize),
      z: Math.floor((point.z - contract.origin.z) / contract.tileSize)
    };
  }

  private getInteriorCellCenter(
    contract: InteriorNavigationContract,
    cell: InteriorNavigationCell
  ): { readonly x: number; readonly z: number } {
    return {
      x: contract.origin.x + (cell.x + 0.5) * contract.tileSize,
      z: contract.origin.z + (cell.z + 0.5) * contract.tileSize
    };
  }

  private getInteriorBlockedWallEdgeKeys(story: InteriorNavigationStory): Set<string> {
    const doorEdges = new Set(story.doorEdges.map((edge) => this.getInteriorEdgeKey(edge.a, edge.b)));
    return new Set(story.blockedEdges
      .map((edge) => this.getInteriorEdgeKey(edge.a, edge.b))
      .filter((edge) => !doorEdges.has(edge)));
  }

  private getInteriorCardinalNeighbors(cell: InteriorNavigationCell): readonly InteriorNavigationCell[] {
    return [
      { x: cell.x + 1, z: cell.z },
      { x: cell.x - 1, z: cell.z },
      { x: cell.x, z: cell.z + 1 },
      { x: cell.x, z: cell.z - 1 }
    ];
  }

  private getInteriorCellKey(cell: InteriorNavigationCell): string {
    return `${cell.x}:${cell.z}`;
  }

  private getInteriorEdgeKey(left: InteriorNavigationCell, right: InteriorNavigationCell): string {
    const leftKey = this.getInteriorCellKey(left);
    const rightKey = this.getInteriorCellKey(right);
    return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
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

function replaceImportedNodes<T>(
  allNodes: readonly T[],
  removedNodes: readonly T[],
  addedNodes: readonly T[]
): readonly T[] {
  const removed = new Set(removedNodes);
  return [...allNodes.filter((node) => !removed.has(node)), ...addedNodes];
}
