import {
  Color3,
  MeshBuilder,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type AnimationGroup,
  type IParticleSystem,
  type Scene,
  type Skeleton
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { normalizeAssetPath, resolveSceneAssetPath } from "../../model/SceneAssetPath";
import { LightingPresetCatalog } from "../../lighting/LightingPreset";
import type { SceneLightingDescriptor } from "../../lighting/LightingTypes";
import type { TerrainHeightField } from "../terrain/TerrainHeightField";
import { TerrainHeightFieldSerializer } from "../terrain/TerrainHeightFieldSerializer";
import { TerrainMeshBuilder } from "../terrain/TerrainMeshBuilder";
import { TerrainQuadtreeLodController } from "../terrain/lod/TerrainQuadtreeLodController";
import { TerrainQuadtreeLodDescriptorResolver } from "../terrain/lod/TerrainQuadtreeLodTypes";
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
const RUNTIME_TERRAIN_MESH_BUILDER = new TerrainMeshBuilder();
const RUNTIME_TERRAIN_LOD_DESCRIPTOR_RESOLVER = new TerrainQuadtreeLodDescriptorResolver();

export async function importSceneContent(options: SceneContentImportOptions): Promise<ImportedSceneContent> {
  const descriptorPath = options.descriptorPath;
  const descriptorUrl = descriptorPath ? normalizeAssetPath(descriptorPath) : undefined;
  const descriptor =
    options.descriptor ?? (descriptorPath ? (await loadSceneDescriptor(descriptorPath)).descriptor : undefined);

  if (!descriptor) {
    throw new Error(`Scene '${options.sceneId}' is missing a descriptor.`);
  }

  const aggregate = createAggregate();
  let importedTerrain: ImportedSceneTerrainContent | null = null;

  if (descriptor.terrain) {
    importedTerrain = await importSceneTerrainContent(options.scene, descriptor.terrain, options.root, options.rootNamePrefix, {
      generatedTerrainLodEnabled: options.generatedTerrainLodEnabled ?? true
    });
    appendAggregate(aggregate, importedTerrain);
  }

  const sceneObjects: ImportedSceneObjectContent[] = [];
  for (const objectDescriptor of descriptor.objects) {
    const importedObject = await importSceneObjectContent(
      options.scene,
      objectDescriptor,
      options.root,
      options.rootNamePrefix
    );
    sceneObjects.push(importedObject);
    appendAggregate(aggregate, importedObject);
  }

  return {
    root: options.root,
    meshes: aggregate.meshes,
    renderableMeshes: aggregate.renderableMeshes,
    helperMeshes: aggregate.helperMeshes,
    transformNodes: aggregate.transformNodes,
    skeletons: aggregate.skeletons,
    animationGroups: aggregate.animationGroups,
    particleSystems: aggregate.particleSystems,
    sceneObjects,
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
  options: { readonly generatedTerrainLodEnabled?: boolean } = {}
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

  const imported = await importSceneAsset(scene, descriptor.model, terrainRoot);
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

  const mesh = RUNTIME_TERRAIN_MESH_BUILDER.build(scene, descriptor, heightField);
  mesh.setParent(terrainRoot, false);
  mesh.metadata = {
    ...(mesh.metadata as Record<string, unknown> | undefined),
    generatedTerrainDescriptor: descriptor,
    generatedTerrainHeightField: heightField,
    terrainSurfaceCanonical: true
  };

  const lod = RUNTIME_TERRAIN_LOD_DESCRIPTOR_RESOLVER.resolve(descriptor.lod, heightField);
  const terrainLodControllers = generatedTerrainLodEnabled && lod.enabled
    ? [
        new TerrainQuadtreeLodController({
          scene,
          terrainRoot,
          canonicalMesh: mesh,
          descriptor,
          heightField,
          lod: descriptor.lod
        })
      ]
    : [];

  return {
    root: terrainRoot,
    descriptor,
    heightField,
    meshes: [mesh],
    renderableMeshes: [mesh],
    terrainSurfaceMeshes: [mesh],
    terrainLodControllers,
    helperMeshes: [],
    transformNodes: [],
    skeletons: [],
    animationGroups: [],
    particleSystems: []
  };
}

export async function importSceneObjectContent(
  scene: Scene,
  descriptor: SceneObjectDescriptor,
  parent: TransformNode,
  rootNamePrefix: string
): Promise<ImportedSceneObjectContent> {
  const runtimeObjectMetadata = {
    sceneObjectId: descriptor.id,
    sceneObjectType: descriptor.type,
    buildingVisibilityInstanceId: descriptor.id
  };
  const objectRoot = new TransformNode(`${rootNamePrefix}-scene-object-root:${descriptor.id}`, scene);
  objectRoot.setParent(parent, false);
  applyTransform(objectRoot, descriptor);
  objectRoot.metadata = {
    ...(objectRoot.metadata as Record<string, unknown> | undefined),
    ...runtimeObjectMetadata
  };

  const imported = await importSceneAsset(scene, descriptor.asset, objectRoot);

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

async function importSceneAsset(scene: Scene, assetPath: string, parent: TransformNode): Promise<ImportedAssetNodesInternal> {
  const { rootUrl, fileName } = resolveSceneAssetPath(assetPath);
  const importResult = await SceneLoader.ImportMeshAsync(undefined, rootUrl, fileName, scene);

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
  const rawMetadata = (metadata.rawMetadata ?? {}) as Record<string, unknown>;

  if (name.includes("metadata") || id.includes("metadata")) {
    return true;
  }

  if (name.includes("navigationmetadata") || id.includes("navigationmetadata")) {
    return true;
  }

  if (metadata.gameHelper === true || metadata.isMetadata === true) {
    return true;
  }

  if (
    rawMetadata.game_helper === true ||
    rawMetadata.metadata_carrier === true
  ) {
    return true;
  }

  return mesh.getTotalVertices() <= 0;
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
