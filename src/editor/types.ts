import type {
  AbstractMesh,
  AnimationGroup,
  IParticleSystem,
  Skeleton,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type {
  SceneDescriptor,
  SceneObjectDescriptor,
  SceneTerrainDescriptor
} from "../core/world/scene/SceneDescriptor";

export type EditorBrowserTab = "scenes" | "terrain" | "buildings" | "inspector";

export interface EditorSceneOption {
  readonly id: string;
  readonly label: string;
  readonly locationId?: string;
  readonly locationLabel?: string;
  readonly districtId?: string;
  readonly districtLabel?: string;
  readonly sceneId?: string;
  readonly descriptorUrl?: string;
  readonly rawDescriptorPath: string;
  readonly chunkCoord?: readonly [number, number];
}

export interface EditorBuildingAssetOption {
  readonly id: string;
  readonly title: string;
  readonly label: string;
  readonly modelUrl: string;
  readonly rawModelPath: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly filename: string;
  readonly tags: readonly string[];
}

export interface EditorSceneLoadSummary {
  readonly descriptorUrl?: string;
  readonly rawDescriptorPath: string;
  readonly terrainLabel: string;
  readonly objectCount: number;
}

export interface EditorObjectInstance {
  readonly objectId: string;
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  readonly renderableMeshes: readonly AbstractMesh[];
  readonly helperMeshes: readonly AbstractMesh[];
  readonly transformNodes: readonly TransformNode[];
  readonly skeletons: readonly Skeleton[];
  readonly animationGroups: readonly AnimationGroup[];
  readonly particleSystems: readonly IParticleSystem[];
  readonly descriptor: SceneObjectDescriptor;
}

export interface EditorTerrainInstance {
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  readonly renderableMeshes: readonly AbstractMesh[];
  readonly helperMeshes: readonly AbstractMesh[];
  readonly transformNodes: readonly TransformNode[];
  readonly skeletons: readonly Skeleton[];
  readonly animationGroups: readonly AnimationGroup[];
  readonly particleSystems: readonly IParticleSystem[];
  readonly descriptor: SceneTerrainDescriptor;
}

export interface EditorLoadedSceneContent {
  readonly option: EditorSceneOption;
  readonly descriptor: SceneDescriptor;
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  readonly renderableMeshes: readonly AbstractMesh[];
  readonly helperMeshes: readonly AbstractMesh[];
  readonly transformNodes: readonly TransformNode[];
  readonly skeletons: readonly Skeleton[];
  readonly animationGroups: readonly AnimationGroup[];
  readonly particleSystems: readonly IParticleSystem[];
  readonly sceneObjects: readonly EditorObjectInstance[];
  readonly terrain: EditorTerrainInstance | null;
  readonly summary: EditorSceneLoadSummary;
}

export interface EditorBounds {
  readonly min: Vector3;
  readonly max: Vector3;
}
