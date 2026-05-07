import type { AbstractMesh, Skeleton, TransformNode, AnimationGroup, IParticleSystem, Vector3 } from "@babylonjs/core";

export interface EditorSceneOption {
  readonly id: string;
  readonly label: string;
  readonly locationId?: string;
  readonly locationLabel?: string;
  readonly districtId?: string;
  readonly districtLabel?: string;
  readonly sceneId?: string;
  readonly assetUrl: string;
  readonly rawAssetPath: string;
  readonly chunkCoord?: readonly [number, number];
}

export interface EditorLoadedSceneContent {
  readonly option: EditorSceneOption;
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  readonly renderableMeshes: readonly AbstractMesh[];
  readonly helperMeshes: readonly AbstractMesh[];
  readonly transformNodes: readonly TransformNode[];
  readonly skeletons: readonly Skeleton[];
  readonly animationGroups: readonly AnimationGroup[];
  readonly particleSystems: readonly IParticleSystem[];
}

export interface EditorBounds {
  readonly min: Vector3;
  readonly max: Vector3;
}
