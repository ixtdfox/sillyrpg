import {
  AbstractMesh,
  BoundingBox,
  Color3,
  MeshBuilder,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  type AssetContainer,
  Vector3,
  type AnimationGroup,
  type IParticleSystem,
  type ISceneLoaderProgressEvent,
  type Node,
  type Scene,
  type Skeleton
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { normalizeAssetPath, resolveSceneAssetPath } from "../../model/SceneAssetPath";
import { LightingPresetCatalog } from "../../lighting/LightingPreset";
import type { SceneLightingDescriptor } from "../../lighting/LightingTypes";
import type { TerrainHeightField } from "../terrain/TerrainHeightField";
import { TerrainHeightFieldSerializer } from "../terrain/TerrainHeightFieldSerializer";
import { TerrainMaterialBuilder } from "../terrain/TerrainMaterialBuilder";
import { TerrainMeshBuilder } from "../terrain/TerrainMeshBuilder";
import { TerrainQuadtreeLodController } from "../terrain/lod/TerrainQuadtreeLodController";
import { TerrainQuadtreeLodDescriptorResolver } from "../terrain/lod/TerrainQuadtreeLodTypes";
import { BuildingAssetMaterialPool } from "./BuildingAssetMaterialPool";
import { RuntimeSceneObjectPreparer } from "./RuntimeSceneObjectPreparer";
import { ConnectedObjectInstanceBatcher } from "./ConnectedObjectInstanceBatcher";
import type { LoadingProgressReporter } from "../../game/LoadingProgress";
import { loadSceneDescriptor } from "./SceneDescriptorLoader";
import type {
  SceneDescriptor,
  SceneGeneratedTerrainDescriptor,
  SceneObjectDescriptor,
  SceneTerrainDescriptor,
  SceneVector3Tuple
} from "./SceneDescriptor";

export interface SceneContentImportOptions {
  readonly scene: Scene;
  readonly sceneId: string;
  readonly root: TransformNode;
  readonly rootNamePrefix: string;
  readonly descriptorPath?: string;
  readonly descriptor?: SceneDescriptor;
  readonly generatedTerrainLodEnabled?: boolean;
  readonly runtimeStaticPreparationEnabled?: boolean;
  readonly runtimeConnectedObjectBatchingEnabled?: boolean;
  readonly onProgress?: LoadingProgressReporter;
}

export interface ImportedSceneAssetNodes {
  readonly meshes: readonly AbstractMesh[];
  readonly renderableMeshes: readonly AbstractMesh[];
  readonly helperMeshes: readonly AbstractMesh[];
  readonly transformNodes: readonly TransformNode[];
  readonly skeletons: readonly Skeleton[];
  readonly animationGroups: readonly AnimationGroup[];
  readonly particleSystems: readonly IParticleSystem[];
}

export interface ImportedSceneObjectContent extends ImportedSceneAssetNodes {
  readonly objectId: string;
  readonly type: string;
  readonly root: TransformNode;
  readonly descriptor: SceneObjectDescriptor;
  readonly cullingBounds: BoundingBox | null;
}

export interface ImportedSceneTerrainContent extends ImportedSceneAssetNodes {
  readonly root: TransformNode;
  readonly descriptor: SceneTerrainDescriptor;
  readonly heightField?: TerrainHeightField;
  readonly terrainSurfaceMeshes: readonly AbstractMesh[];
  readonly terrainLodControllers: readonly TerrainQuadtreeLodController[];
}

export interface ImportedSceneContent extends ImportedSceneAssetNodes {
  readonly root: TransformNode;
  readonly sceneObjects: readonly ImportedSceneObjectContent[];
  readonly terrainContent?: ImportedSceneTerrainContent | null;
  readonly terrainRoot?: TransformNode;
  readonly terrainMeshes: readonly AbstractMesh[];
  readonly terrainLodControllers: readonly TerrainQuadtreeLodController[];
  readonly terrainDescriptor?: SceneTerrainDescriptor | null;
  readonly lightingDescriptor: SceneLightingDescriptor;
  readonly summary: SceneContentSummary;
}

export interface SceneContentSummary {
  readonly descriptorPath?: string;
  readonly descriptorUrl?: string;
  readonly terrainLabel: string;
  readonly objectCount: number;
}

interface ImportedAssetNodesInternal extends ImportedSceneAssetNodes {}
const DEBUG_SCENE_IMPORTS = false;
const RUNTIME_TERRAIN_HEIGHT_FIELD_SERIALIZER = new TerrainHeightFieldSerializer();
const RUNTIME_TERRAIN_MATERIAL_BUILDER = new TerrainMaterialBuilder();
const RUNTIME_TERRAIN_MESH_BUILDER = new TerrainMeshBuilder();
const RUNTIME_TERRAIN_LOD_DESCRIPTOR_RESOLVER = new TerrainQuadtreeLodDescriptorResolver();
const SCENE_ASSET_CONTAINER_CACHES = new WeakMap<Scene, SceneAssetContainerCache>();
const CACHED_SCENE_ASSET_INSTANCE_MESHES = new WeakSet<AbstractMesh>();

interface SceneAssetContainerCache {
  readonly containersByAssetPath: Map<string, Promise<AssetContainer | null>>;
  readonly buildingMaterialPool: BuildingAssetMaterialPool;
}

export async function importSceneContent(options: SceneContentImportOptions): Promise<ImportedSceneContent> {
  options.onProgress?.({ progress: 0, message: "Reading scene descriptor" });
  const descriptorPath = options.descriptorPath;
  const descriptorUrl = descriptorPath ? normalizeAssetPath(descriptorPath) : undefined;
  const descriptor =
    options.descriptor ?? (descriptorPath ? (await loadSceneDescriptor(descriptorPath)).descriptor : undefined);

  if (!descriptor) {
    throw new Error(`Scene '${options.sceneId}' is missing a descriptor.`);
  }
  options.onProgress?.({ progress: 0.08, message: "Scene descriptor ready" });

  const aggregate = createAggregate();
  let importedTerrain: ImportedSceneTerrainContent | null = null;

  if (descriptor.terrain) {
    options.onProgress?.({ progress: 0.1, message: "Preparing terrain" });
    importedTerrain = await importSceneTerrainContent(options.scene, descriptor.terrain, options.root, options.rootNamePrefix, {
      generatedTerrainLodEnabled: options.generatedTerrainLodEnabled ?? true,
      onAssetProgress: (progress) => {
        options.onProgress?.({ progress: 0.1 + progress * 0.1, message: "Loading terrain asset" });
      }
    });
    appendAggregate(aggregate, importedTerrain);
  }
  options.onProgress?.({ progress: 0.2, message: "Terrain ready" });

  const sceneObjects: ImportedSceneObjectContent[] = [];
  const runtimeSceneObjectPreparer = options.runtimeStaticPreparationEnabled
    ? new RuntimeSceneObjectPreparer()
    : null;
  const runtimeAssetCacheEnabled = options.runtimeStaticPreparationEnabled === true ||
    options.runtimeConnectedObjectBatchingEnabled === true;
  const objectProgressStart = 0.2;
  const objectProgressEnd = 0.9;
  const objectProgressSpan = descriptor.objects.length > 0
    ? (objectProgressEnd - objectProgressStart) / descriptor.objects.length
    : 0;
  for (const [objectIndex, objectDescriptor] of descriptor.objects.entries()) {
    const objectNumber = objectIndex + 1;
    const objectStart = objectProgressStart + objectProgressSpan * objectIndex;
    const objectMessage = `Loading scene object ${objectNumber} / ${descriptor.objects.length}`;
    options.onProgress?.({ progress: objectStart, message: objectMessage });
    const importedObject = await importSceneObjectContent(
      options.scene,
      objectDescriptor,
      options.root,
      options.rootNamePrefix,
      runtimeAssetCacheEnabled,
      (assetProgress) => {
        options.onProgress?.({
          progress: objectStart + objectProgressSpan * assetProgress,
          message: objectMessage
        });
      }
    );
    const preparation = runtimeSceneObjectPreparer?.prepare(importedObject);
    sceneObjects.push(preparation && preparation.frozenNodeCount === 0
      ? { ...importedObject, cullingBounds: null }
      : importedObject);
    options.onProgress?.({
      progress: objectStart + objectProgressSpan,
      message: `Scene object ${objectNumber} / ${descriptor.objects.length} ready`
    });
  }
  options.onProgress?.({ progress: objectProgressEnd, message: "Optimizing scene objects" });
  const preparedSceneObjects = options.runtimeConnectedObjectBatchingEnabled
    ? new ConnectedObjectInstanceBatcher({
        disposeImportedMesh: disposeImportedSceneMesh,
        markSharedResourceMesh: markImportedSceneMeshAsSharedResource
      }).batch(options.root, sceneObjects).sceneObjects
    : sceneObjects;
  for (const sceneObject of preparedSceneObjects) {
    appendAggregate(aggregate, sceneObject);
  }
  options.onProgress?.({ progress: 1, message: "Scene content ready" });

  return {
    root: options.root,
    meshes: aggregate.meshes,
    renderableMeshes: aggregate.renderableMeshes,
    helperMeshes: aggregate.helperMeshes,
    transformNodes: aggregate.transformNodes,
    skeletons: aggregate.skeletons,
    animationGroups: aggregate.animationGroups,
    particleSystems: aggregate.particleSystems,
    sceneObjects: preparedSceneObjects,
    terrainContent: importedTerrain,
    terrainRoot: importedTerrain?.root,
    terrainMeshes: importedTerrain?.terrainSurfaceMeshes ?? [],
    terrainLodControllers: importedTerrain?.terrainLodControllers ?? [],
    terrainDescriptor: descriptor.terrain,
    lightingDescriptor: descriptor.lighting ?? LightingPresetCatalog.getShared().createDefault(),
    summary: {
      descriptorPath,
      descriptorUrl,
      terrainLabel: describeTerrain(descriptor.terrain),
      objectCount: descriptor.objects.length
    }
  };
}

export async function importSceneTerrainContent(
  scene: Scene,
  descriptor: SceneTerrainDescriptor,
  parent: TransformNode,
  rootNamePrefix: string,
  options: {
    readonly generatedTerrainLodEnabled?: boolean;
    readonly onAssetProgress?: (progress: number) => void;
  } = {}
): Promise<ImportedSceneTerrainContent> {
  const terrainRoot = new TransformNode(`${rootNamePrefix}-terrain-root:${descriptor.id}`, scene);
  terrainRoot.setParent(parent, false);
  applyTransform(terrainRoot, descriptor);

  if (descriptor.kind === "plane") {
    const ground = MeshBuilder.CreateGround(
      `terrain:${descriptor.id}`,
      { width: descriptor.size[0], height: descriptor.size[1] },
      scene
    );
    ground.setParent(terrainRoot, false);
    ground.isPickable = true;

    const material = new StandardMaterial(`terrain-material:${descriptor.id}`, scene);
    material.diffuseColor = resolveColor3(descriptor.material?.color ?? "#8D9298");
    material.specularColor = new Color3(0, 0, 0);
    ground.material = material;

    return {
      root: terrainRoot,
      descriptor,
      heightField: undefined,
      meshes: [ground],
      renderableMeshes: [ground],
      terrainSurfaceMeshes: [ground],
      terrainLodControllers: [],
      helperMeshes: [],
      transformNodes: [],
      skeletons: [],
      animationGroups: [],
      particleSystems: []
    };
  }

  if (descriptor.kind === "generated") {
    return importGeneratedTerrainContent(
      scene,
      descriptor,
      terrainRoot,
      options.generatedTerrainLodEnabled ?? true
    );
  }

  const imported = await importSceneAsset(scene, descriptor.model, terrainRoot, false, false, options.onAssetProgress);
  for (const mesh of imported.renderableMeshes) {
    mesh.isPickable = true;
  }

  return {
    root: terrainRoot,
    descriptor,
    heightField: undefined,
    terrainSurfaceMeshes: imported.renderableMeshes,
    terrainLodControllers: [],
    ...imported
  };
}

function importGeneratedTerrainContent(
  scene: Scene,
  descriptor: SceneGeneratedTerrainDescriptor,
  terrainRoot: TransformNode,
  generatedTerrainLodEnabled: boolean
): ImportedSceneTerrainContent {
  const heightField = RUNTIME_TERRAIN_HEIGHT_FIELD_SERIALIZER.deserialize(descriptor);
  if (!heightField) {
    terrainRoot.dispose(false);
    throw new Error(
      `Generated terrain '${descriptor.id}' has no editedHeightMap. Runtime core can display baked generated terrain, but procedural generation belongs to the editor pipeline.`
    );
  }

  const lod = RUNTIME_TERRAIN_LOD_DESCRIPTOR_RESOLVER.resolve(descriptor.lod, heightField);
  if (generatedTerrainLodEnabled && lod.enabled) {
    const pickSurfaceMesh = createGeneratedTerrainRuntimePickSurface(scene, descriptor, heightField);
    pickSurfaceMesh.setParent(terrainRoot, false);
    const material = RUNTIME_TERRAIN_MATERIAL_BUILDER.build(
      scene,
      pickSurfaceMesh,
      descriptor,
      heightField,
      getGeneratedTerrainPickSurfaceVertexHeights(heightField)
    );
    const terrainLodControllers = [
      new TerrainQuadtreeLodController({
        scene,
        terrainRoot,
        descriptor,
        heightField,
        lod: descriptor.lod,
        material,
        canonicalPickMesh: pickSurfaceMesh
      })
    ];

    return {
      root: terrainRoot,
      descriptor,
      heightField,
      meshes: [pickSurfaceMesh],
      renderableMeshes: [],
      terrainSurfaceMeshes: [pickSurfaceMesh],
      terrainLodControllers,
      helperMeshes: [],
      transformNodes: [],
      skeletons: [],
      animationGroups: [],
      particleSystems: []
    };
  }

  const mesh = RUNTIME_TERRAIN_MESH_BUILDER.build(scene, descriptor, heightField);
  mesh.setParent(terrainRoot, false);
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | undefined),
    generatedTerrainDescriptor: descriptor,
    generatedTerrainHeightField: heightField,
    terrainSurfaceCanonical: true,
    terrainCanonicalMeshMode: "FULL_RENDER_FALLBACK"
  };

  return {
    root: terrainRoot,
    descriptor,
    heightField,
    meshes: [mesh],
    renderableMeshes: [mesh],
    terrainSurfaceMeshes: [mesh],
    terrainLodControllers: [],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };
}

function createGeneratedTerrainRuntimePickSurface(
  scene: Scene,
  descriptor: SceneGeneratedTerrainDescriptor,
  heightField: TerrainHeightField
) {
  const mesh = MeshBuilder.CreateGround(
    `terrain:${descriptor.id}:heightfield-surface`,
    { width: heightField.width, height: heightField.depth, subdivisions: 1 },
    scene
  );
  mesh.isPickable = true;
  mesh.checkCollisions = false;
  mesh.receiveShadows = false;
  mesh.visibility = 0;
  mesh.isVisible = true;
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | undefined),
    isGround: true,
    terrainKind: "generated",
    generatedTerrainDescriptor: descriptor,
    generatedTerrainHeightField: heightField,
    terrainSurfaceCanonical: true,
    terrainCanonicalMeshMode: "PICK_ONLY"
  };
  return mesh;
}

function getGeneratedTerrainPickSurfaceVertexHeights(heightField: TerrainHeightField): readonly number[] {
  const maxX = Math.max(0, heightField.resolutionX - 1);
  const maxZ = Math.max(0, heightField.resolutionZ - 1);
  return [
    heightField.getHeight(0, 0),
    heightField.getHeight(maxX, 0),
    heightField.getHeight(0, maxZ),
    heightField.getHeight(maxX, maxZ)
  ];
}

export async function importSceneObjectContent(
  scene: Scene,
  descriptor: SceneObjectDescriptor,
  parent: TransformNode,
  rootNamePrefix: string,
  useAssetContainerCache = false,
  onAssetProgress?: (progress: number) => void
): Promise<ImportedSceneObjectContent> {
  const runtimeObjectMetadata = {
    sceneObjectId: descriptor.id,
    sceneObjectType: descriptor.type,
    ...(descriptor.type === "building" ? { buildingVisibilityInstanceId: descriptor.id } : {})
  };
  const objectRoot = new TransformNode(`${rootNamePrefix}-scene-object-root:${descriptor.id}`, scene);
  objectRoot.setParent(parent, false);
  applyTransform(objectRoot, descriptor);
  objectRoot.metadata = {
    ...(objectRoot.metadata as Record<string, unknown> | undefined),
    ...runtimeObjectMetadata
  };

  const imported = await importSceneAsset(
    scene,
    descriptor.asset,
    objectRoot,
    useAssetContainerCache && (
      descriptor.type === "building" ||
      (descriptor.type === "connected-object" && descriptor.connected !== undefined)
    ),
    descriptor.type === "building",
    onAssetProgress
  );
  const cullingBounds = resolveRenderableBounds(imported.renderableMeshes);

  for (const transformNode of imported.transformNodes) {
    transformNode.metadata = {
      ...(transformNode.metadata as Record<string, unknown> | undefined),
      ...runtimeObjectMetadata
    };
  }

  for (const mesh of imported.renderableMeshes) {
    mesh.metadata = {
      ...(mesh.metadata as Record<string, unknown> | undefined),
      ...runtimeObjectMetadata
    };
    mesh.isPickable = true;
  }

  debugLogImportedObjectTransform(descriptor.id, descriptor, objectRoot, imported.renderableMeshes);

  return {
    objectId: descriptor.id,
    type: descriptor.type,
    root: objectRoot,
    descriptor,
    cullingBounds: cullingBounds
      ? new BoundingBox(cullingBounds.min, cullingBounds.max)
      : null,
    ...imported
  };
}

export function applyTransform(node: TransformNode, descriptor: {
  readonly position?: SceneVector3Tuple;
  readonly rotation?: SceneVector3Tuple;
  readonly scale?: SceneVector3Tuple;
}): void {
  node.position = toVector3(descriptor.position, [0, 0, 0]);
  node.rotation = toVector3(descriptor.rotation, [0, 0, 0]);
  node.scaling = toVector3(descriptor.scale, [1, 1, 1]);
}

function createAggregate(): {
  meshes: AbstractMesh[];
  renderableMeshes: AbstractMesh[];
  helperMeshes: AbstractMesh[];
  transformNodes: TransformNode[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
  particleSystems: IParticleSystem[];
} {
  return {
    meshes: [],
    renderableMeshes: [],
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };
}

function appendAggregate(
  aggregate: {
    meshes: AbstractMesh[];
    renderableMeshes: AbstractMesh[];
    helperMeshes: AbstractMesh[];
    transformNodes: TransformNode[];
    skeletons: Skeleton[];
    animationGroups: AnimationGroup[];
    particleSystems: IParticleSystem[];
  },
  imported: ImportedAssetNodesInternal
): void {
  aggregate.meshes.push(...imported.meshes);
  aggregate.renderableMeshes.push(...imported.renderableMeshes);
  aggregate.helperMeshes.push(...imported.helperMeshes);
  aggregate.transformNodes.push(...imported.transformNodes);
  aggregate.skeletons.push(...imported.skeletons);
  aggregate.animationGroups.push(...imported.animationGroups);
  aggregate.particleSystems.push(...imported.particleSystems);
}

async function importSceneAsset(
  scene: Scene,
  assetPath: string,
  parent: TransformNode,
  useAssetContainerCache = false,
  shareBuildingMaterials = false,
  onAssetProgress?: (progress: number) => void
): Promise<ImportedAssetNodesInternal> {
  if (useAssetContainerCache) {
    const container = await getCachedSceneAssetContainer(
      scene,
      assetPath,
      shareBuildingMaterials,
      onAssetProgress
    );
    if (container) {
      return instantiateCachedSceneAsset(container, parent);
    }
  }

  const { rootUrl, fileName } = resolveSceneAssetPath(assetPath);
  const importResult = await SceneLoader.ImportMeshAsync(
    undefined,
    rootUrl,
    fileName,
    scene,
    (event) => reportAssetProgress(onAssetProgress, event)
  );

  adoptImportedSceneNodes(parent, importResult.transformNodes, importResult.meshes);

  const helperMeshes: AbstractMesh[] = [];
  const renderableMeshes: AbstractMesh[] = [];

  for (const mesh of importResult.meshes) {
    if (isMetadataHelperMesh(mesh)) {
      mesh.metadata = {
        ...(mesh.metadata as Record<string, unknown> | undefined),
        gameHelper: true
      };
      mesh.isVisible = false;
      mesh.isPickable = false;
      helperMeshes.push(mesh);
      continue;
    }

    renderableMeshes.push(mesh);
  }

  return {
    meshes: importResult.meshes,
    renderableMeshes,
    helperMeshes,
    transformNodes: importResult.transformNodes,
    skeletons: importResult.skeletons,
    animationGroups: importResult.animationGroups,
    particleSystems: importResult.particleSystems
  };
}

async function getCachedSceneAssetContainer(
  scene: Scene,
  assetPath: string,
  shareBuildingMaterials: boolean,
  onAssetProgress?: (progress: number) => void
): Promise<AssetContainer | null> {
  let cache = SCENE_ASSET_CONTAINER_CACHES.get(scene);
  if (!cache) {
    cache = {
      containersByAssetPath: new Map(),
      buildingMaterialPool: new BuildingAssetMaterialPool()
    };
    SCENE_ASSET_CONTAINER_CACHES.set(scene, cache);
    scene.onDisposeObservable.addOnce(() => {
      for (const containerPromise of cache!.containersByAssetPath.values()) {
        void containerPromise.then(
          (container) => container?.dispose(),
          () => undefined
        );
      }
      cache!.containersByAssetPath.clear();
      SCENE_ASSET_CONTAINER_CACHES.delete(scene);
    });
  }

  const cacheKey = normalizeAssetPath(assetPath);
  const cachedContainer = cache.containersByAssetPath.get(cacheKey);
  if (cachedContainer) {
    const container = await cachedContainer;
    if (container && shareBuildingMaterials) {
      cache.buildingMaterialPool.canonicalize(container);
    }
    return container;
  }

  const { rootUrl, fileName } = resolveSceneAssetPath(assetPath);
  let containerPromise: Promise<AssetContainer | null>;
  containerPromise = SceneLoader.LoadAssetContainerAsync(
    rootUrl,
    fileName,
    scene,
    (event) => reportAssetProgress(onAssetProgress, event)
  )
    .then((container) => {
      if (!isStaticReusableAssetContainer(container)) {
        container.dispose();
        return null;
      }

      if (shareBuildingMaterials) {
        cache?.buildingMaterialPool.canonicalize(container);
      }

      return container;
    })
    .catch((error: unknown) => {
      if (cache?.containersByAssetPath.get(cacheKey) === containerPromise) {
        cache.containersByAssetPath.delete(cacheKey);
      }
      throw error;
    });
  cache.containersByAssetPath.set(cacheKey, containerPromise);
  return containerPromise;
}

function reportAssetProgress(
  reporter: ((progress: number) => void) | undefined,
  event: ISceneLoaderProgressEvent
): void {
  if (!reporter || !event.lengthComputable || event.total <= 0) {
    return;
  }

  reporter(Math.max(0, Math.min(1, event.loaded / event.total)));
}

function isStaticReusableAssetContainer(container: AssetContainer): boolean {
  return (
    container.meshes.length > 0 &&
    container.cameras.length === 0 &&
    container.lights.length === 0 &&
    container.skeletons.length === 0 &&
    container.animationGroups.length === 0 &&
    container.particleSystems.length === 0
  );
}

export function instantiateCachedSceneAsset(
  container: AssetContainer,
  parent: TransformNode
): ImportedAssetNodesInternal {
  const entries = container.instantiateModelsToScene(
    (sourceName) => `${parent.name}:${sourceName}`,
    false,
    { doNotInstantiate: false }
  );
  for (const rootNode of entries.rootNodes) {
    rootNode.parent = parent;
  }
  const sourceMetadataByName = new Map<string, Record<string, unknown>>();
  for (const sourceNode of [...container.transformNodes, ...container.meshes]) {
    const metadata = asRecord(sourceNode.metadata);
    if (Object.keys(metadata).length > 0) {
      sourceMetadataByName.set(sourceNode.name, metadata);
    }
  }
  const nodes: Node[] = [];
  const seenNodeIds = new Set<number>();

  for (const rootNode of entries.rootNodes) {
    for (const node of [rootNode, ...rootNode.getDescendants(false)]) {
      if (seenNodeIds.has(node.uniqueId)) {
        continue;
      }

      seenNodeIds.add(node.uniqueId);
      nodes.push(node);
    }
  }

  const meshes: AbstractMesh[] = [];
  const renderableMeshes: AbstractMesh[] = [];
  const helperMeshes: AbstractMesh[] = [];
  const transformNodes: TransformNode[] = [];

  for (const node of nodes) {
    copyCachedNodeMetadata(node, parent, sourceMetadataByName);

    if (node instanceof TransformNode && !(node instanceof AbstractMesh)) {
      transformNodes.push(node);
    }

    if (!(node instanceof AbstractMesh)) {
      continue;
    }

    CACHED_SCENE_ASSET_INSTANCE_MESHES.add(node);

    const sourceMesh = (node as AbstractMesh & { readonly sourceMesh?: AbstractMesh }).sourceMesh;
    if (sourceMesh) {
      node.metadata = {
        ...asRecord(sourceMesh.metadata),
        ...asRecord(node.metadata)
      };
    }

    meshes.push(node);
    if (isMetadataHelperMesh(node)) {
      node.metadata = {
        ...(node.metadata as Record<string, unknown> | undefined),
        gameHelper: true
      };
      node.isVisible = false;
      node.isPickable = false;
      helperMeshes.push(node);
    } else {
      renderableMeshes.push(node);
    }
  }

  return {
    meshes,
    renderableMeshes,
    helperMeshes,
    transformNodes,
    skeletons: entries.skeletons,
    animationGroups: entries.animationGroups,
    particleSystems: []
  };
}

/** Disposes an imported mesh without destroying resources owned by a cached asset container. */
export function disposeImportedSceneMesh(mesh: AbstractMesh): void {
  if (!mesh.isDisposed()) {
    mesh.dispose(false, !CACHED_SCENE_ASSET_INSTANCE_MESHES.has(mesh));
  }
}

/** Marks a derived mesh as sharing resources owned by an asset container. */
export function markImportedSceneMeshAsSharedResource(mesh: AbstractMesh): void {
  CACHED_SCENE_ASSET_INSTANCE_MESHES.add(mesh);
}

export function adoptImportedSceneNodes(
  parent: TransformNode,
  transformNodes: readonly TransformNode[],
  meshes: readonly AbstractMesh[]
): void {
  for (const transformNode of transformNodes) {
    if (transformNode === parent || transformNode.parent) {
      continue;
    }

    // Импортированный scene-object content должен наследовать transform,
    // заданный descriptor'ом на root-узле объекта.
    transformNode.parent = parent;
  }

  for (const mesh of meshes) {
    if (!mesh.parent) {
      mesh.parent = parent;
    }
  }
}

function isMetadataHelperMesh(mesh: AbstractMesh): boolean {
  const name = mesh.name.toLowerCase();
  const id = mesh.id.toLowerCase();
  const metadata = (mesh.metadata ?? {}) as Record<string, unknown>;
  const gltfMetadata = asRecord(metadata.gltf);
  const gltfExtras = asRecord(gltfMetadata.extras);
  const rawMetadata = (metadata.rawMetadata ?? {}) as Record<string, unknown>;
  const metadataSources = [metadata, gltfExtras, rawMetadata];

  if (name.includes("metadata") || id.includes("metadata")) {
    return true;
  }

  if (name.includes("navigationmetadata") || id.includes("navigationmetadata")) {
    return true;
  }

  if (metadata.gameHelper === true || metadata.isMetadata === true) {
    return true;
  }

  if (metadataSources.some((source) =>
    source.gameHelper === true ||
    source.game_helper === true ||
    source.isMetadata === true ||
    source.metadata_carrier === true ||
    source.navigation_metadata === true
  )) {
    return true;
  }

  if (metadataSources.some((source) =>
    source.hide_in_game === true ||
    source.game_hidden_at_runtime === true ||
    String(source.nav_kind ?? "").startsWith("stair_") ||
    source.nav_debug_kind === "stair_path_preview"
  )) {
    return true;
  }

  return mesh.getTotalVertices() <= 0;
}

function copyCachedNodeMetadata(
  node: Node,
  parent: TransformNode,
  sourceMetadataByName: ReadonlyMap<string, Record<string, unknown>>
): void {
  const prefix = `${parent.name}:`;
  const sourceName = node.name.startsWith(prefix) ? node.name.slice(prefix.length) : node.name;
  const sourceMetadata = sourceMetadataByName.get(sourceName);
  if (!sourceMetadata) {
    return;
  }

  node.metadata = {
    ...sourceMetadata,
    ...asRecord(node.metadata)
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toVector3(value: SceneVector3Tuple | undefined, fallback: SceneVector3Tuple): Vector3 {
  const source = value ?? fallback;
  return new Vector3(source[0], source[1], source[2]);
}

function describeTerrain(terrain: SceneTerrainDescriptor | null | undefined): string {
  if (!terrain) {
    return "none";
  }

  if (terrain.kind === "plane") {
    return `plane ${terrain.size[0]}x${terrain.size[1]}`;
  }

  if (terrain.kind === "generated") {
    return `generated ${terrain.generator.preset} ${terrain.resolution[0]}x${terrain.resolution[1]}${terrain.editedHeightMap ? " edited" : ""}`;
  }

  return terrain.model;
}

function resolveColor3(hexColor: string): Color3 {
  try {
    return Color3.FromHexString(hexColor);
  } catch {
    return Color3.FromHexString("#8D9298");
  }
}

export function debugLogImportedObjectTransform(
  objectId: string,
  descriptor: SceneObjectDescriptor,
  root: TransformNode,
  renderableMeshes: readonly AbstractMesh[]
): void {
  if (!DEBUG_SCENE_IMPORTS) {
    return;
  }

  root.computeWorldMatrix(true);
  const bounds = resolveRenderableBounds(renderableMeshes);
  const boundsText = bounds
    ? `bounds=(${bounds.min.x.toFixed(2)},${bounds.min.y.toFixed(2)},${bounds.min.z.toFixed(2)}) -> (${bounds.max.x.toFixed(2)},${bounds.max.y.toFixed(2)},${bounds.max.z.toFixed(2)})`
    : "bounds=n/a";
  console.debug(
    `[SceneImport] object=${objectId} descriptorPos=${descriptor.position.join(",")} descriptorRot=${descriptor.rotation.join(",")} rootWorld=${root.getAbsolutePosition().toString()} ${boundsText}`
  );
}

function resolveRenderableBounds(meshes: readonly AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
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
    mesh.computeWorldMatrix(true);
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
