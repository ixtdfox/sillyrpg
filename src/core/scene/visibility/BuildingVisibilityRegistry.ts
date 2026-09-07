import { AbstractMesh, TransformNode, Vector3, type Node } from "@babylonjs/core";
import {
  parseBuildingVisibilityMesh,
  parseBuildingVisibilityVolumeMetadata,
  type BuildingVisibilityMeshRecord,
  type BuildingVisibilityVolumeMetadata
} from "./BuildingVisibilityMetadata";

export interface BuildingVisibilityBounds {
  readonly min: Vector3;
  readonly max: Vector3;
}

export interface BuildingVisibilityVolumeRecord {
  readonly node: TransformNode;
  readonly storyIndex: number;
  readonly bounds: BuildingVisibilityBounds;
  readonly rawMetadata: Record<string, unknown>;
}

export interface BuildingVisibilityBuildingRecord {
  readonly buildingId: string;
  readonly meshes: BuildingVisibilityMeshRecord[];
  readonly haloMeshes: BuildingVisibilityMeshRecord[];
  readonly hideAboveMeshes: BuildingVisibilityMeshRecord[];
  readonly insideVolumes: BuildingVisibilityVolumeRecord[];
  readonly interiorMeshes: BuildingVisibilityMeshRecord[];
  readonly lodMeshes: BuildingVisibilityMeshRecord[];
  readonly hasRenderableLodPair: boolean;
  readonly storyBoundsByStory: Map<number, BuildingVisibilityBounds>;
  readonly footprintBounds: BuildingVisibilityBounds | null;
}

export class BuildingVisibilityRegistry {
  private readonly buildingsById: Map<string, BuildingVisibilityBuildingRecord>;
  private meshSignature: string;

  public constructor() {
    this.buildingsById = new Map();
    this.meshSignature = "";
  }

  public rebuild(meshes: readonly AbstractMesh[], nodes: readonly Node[] = []): void {
    this.buildingsById.clear();
    this.meshSignature = BuildingVisibilityRegistry.createMeshSignature(meshes);

    const mutableBuildings = new Map<
      string,
      {
        meshes: BuildingVisibilityMeshRecord[];
        haloMeshes: BuildingVisibilityMeshRecord[];
        hideAboveMeshes: BuildingVisibilityMeshRecord[];
        insideVolumes: BuildingVisibilityVolumeRecord[];
        interiorMeshes: BuildingVisibilityMeshRecord[];
        lodMeshes: BuildingVisibilityMeshRecord[];
      }
    >();

    for (const mesh of meshes) {
      if (mesh.isDisposed()) {
        continue;
      }

      const record = parseBuildingVisibilityMesh(mesh);
      if (!record) {
        continue;
      }

      const building = getOrCreateMutableBuilding(mutableBuildings, record.buildingId);
      building.meshes.push(record);

      if (record.isWallHalo) {
        building.haloMeshes.push(record);
      }

      if (record.hideWhenAbovePlayer) {
        building.hideAboveMeshes.push(record);
      }

      if (record.isInterior) {
        building.interiorMeshes.push(record);
      }

      if (record.lodGroup !== null && record.lodLevel !== null) {
        building.lodMeshes.push(record);
      }
    }

    for (const node of nodes) {
      if (!(node instanceof TransformNode) || node instanceof AbstractMesh || node.isDisposed()) {
        continue;
      }

      const volume = parseBuildingVisibilityVolumeMetadata(node);
      if (!volume) {
        continue;
      }

      const building = getOrCreateMutableBuilding(mutableBuildings, volume.buildingId);
      building.insideVolumes.push({
        node,
        storyIndex: volume.storyIndex,
        bounds: computeVolumeBounds(volume),
        rawMetadata: volume.rawMetadata
      });
    }

    mergeAnonymousBuildingsIntoSingleNamedBuilding(mutableBuildings);

    for (const [buildingId, mutableBuilding] of mutableBuildings) {
      const storyBoundsByStory = computeStoryBounds(mutableBuilding.meshes);
      this.buildingsById.set(buildingId, {
        buildingId,
        meshes: mutableBuilding.meshes,
        haloMeshes: mutableBuilding.haloMeshes,
        hideAboveMeshes: mutableBuilding.hideAboveMeshes,
        insideVolumes: mutableBuilding.insideVolumes,
        interiorMeshes: mutableBuilding.interiorMeshes,
        lodMeshes: mutableBuilding.lodMeshes,
        hasRenderableLodPair: hasRenderableLodPair(mutableBuilding.lodMeshes),
        storyBoundsByStory,
        footprintBounds:
          mutableBuilding.insideVolumes.find((volume) => volume.storyIndex === 0)?.bounds ??
          computeFootprintBounds(mutableBuilding.meshes, storyBoundsByStory)
      });
    }
  }

  public getBuildings(): BuildingVisibilityBuildingRecord[] {
    return [...this.buildingsById.values()];
  }

  public getMeshSignature(): string {
    return this.meshSignature;
  }

  public getStats(): { buildingCount: number; haloMeshCount: number; hideAboveMeshCount: number; insideVolumeCount: number } {
    let haloMeshCount = 0;
    let hideAboveMeshCount = 0;
    let insideVolumeCount = 0;

    for (const building of this.buildingsById.values()) {
      haloMeshCount += building.haloMeshes.length;
      hideAboveMeshCount += building.hideAboveMeshes.length;
      insideVolumeCount += building.insideVolumes.length;
    }

    return {
      buildingCount: this.buildingsById.size,
      haloMeshCount,
      hideAboveMeshCount,
      insideVolumeCount
    };
  }

  public static createMeshSignature(meshes: readonly AbstractMesh[]): string {
    return meshes
      .filter((mesh) => !mesh.isDisposed())
      .map((mesh) => `${mesh.uniqueId}:${mesh.id}`)
      .join("|");
  }
}

function getOrCreateMutableBuilding(
  buildings: Map<
    string,
    {
      meshes: BuildingVisibilityMeshRecord[];
      haloMeshes: BuildingVisibilityMeshRecord[];
      hideAboveMeshes: BuildingVisibilityMeshRecord[];
      insideVolumes: BuildingVisibilityVolumeRecord[];
      interiorMeshes: BuildingVisibilityMeshRecord[];
      lodMeshes: BuildingVisibilityMeshRecord[];
    }
  >,
  buildingId: string
): {
  meshes: BuildingVisibilityMeshRecord[];
  haloMeshes: BuildingVisibilityMeshRecord[];
  hideAboveMeshes: BuildingVisibilityMeshRecord[];
  insideVolumes: BuildingVisibilityVolumeRecord[];
  interiorMeshes: BuildingVisibilityMeshRecord[];
  lodMeshes: BuildingVisibilityMeshRecord[];
} {
  const existing = buildings.get(buildingId);
  if (existing) {
    return existing;
  }

  const created = {
    meshes: [],
    haloMeshes: [],
    hideAboveMeshes: [],
    insideVolumes: [],
    interiorMeshes: [],
    lodMeshes: []
  };
  buildings.set(buildingId, created);
  return created;
}

function mergeAnonymousBuildingsIntoSingleNamedBuilding(
  buildings: Map<
    string,
    {
      meshes: BuildingVisibilityMeshRecord[];
      haloMeshes: BuildingVisibilityMeshRecord[];
      hideAboveMeshes: BuildingVisibilityMeshRecord[];
      insideVolumes: BuildingVisibilityVolumeRecord[];
      interiorMeshes: BuildingVisibilityMeshRecord[];
      lodMeshes: BuildingVisibilityMeshRecord[];
    }
  >
): void {
  const anonymousBuildingIds = new Set(["fallback-building", "metadata-building"]);
  const namedBuildingIds = [...buildings.keys()].filter((buildingId) => !anonymousBuildingIds.has(buildingId));

  if (namedBuildingIds.length !== 1) {
    return;
  }

  const targetBuilding = buildings.get(namedBuildingIds[0]);
  if (!targetBuilding) {
    return;
  }

  for (const anonymousBuildingId of anonymousBuildingIds) {
    const anonymousBuilding = buildings.get(anonymousBuildingId);
    if (!anonymousBuilding) {
      continue;
    }

    targetBuilding.meshes.push(...anonymousBuilding.meshes);
    targetBuilding.haloMeshes.push(...anonymousBuilding.haloMeshes);
    targetBuilding.hideAboveMeshes.push(...anonymousBuilding.hideAboveMeshes);
    targetBuilding.insideVolumes.push(...anonymousBuilding.insideVolumes);
    targetBuilding.interiorMeshes.push(...anonymousBuilding.interiorMeshes);
    targetBuilding.lodMeshes.push(...anonymousBuilding.lodMeshes);
    buildings.delete(anonymousBuildingId);
  }
}

function computeStoryBounds(records: readonly BuildingVisibilityMeshRecord[]): Map<number, BuildingVisibilityBounds> {
  const boundsByStory = new Map<number, MutableBounds>();

  for (const record of records) {
    if (record.mesh.isDisposed() || record.isInsideVolume) {
      continue;
    }

    expandMutableBounds(getOrCreateMutableBounds(boundsByStory, record.storyIndex), record.mesh);
  }

  const result = new Map<number, BuildingVisibilityBounds>();
  for (const [storyIndex, bounds] of boundsByStory) {
    result.set(storyIndex, {
      min: new Vector3(bounds.minX, bounds.minY, bounds.minZ),
      max: new Vector3(bounds.maxX, bounds.maxY, bounds.maxZ)
    });
  }

  return result;
}

function computeFootprintBounds(
  records: readonly BuildingVisibilityMeshRecord[],
  storyBoundsByStory: ReadonlyMap<number, BuildingVisibilityBounds>
): BuildingVisibilityBounds | null {
  const storyZeroBounds = storyBoundsByStory.get(0);
  if (storyZeroBounds) {
    return storyZeroBounds;
  }

  const fallbackBounds = new Map<number, MutableBounds>();
  const mutableBounds = getOrCreateMutableBounds(fallbackBounds, 0);

  for (const record of records) {
    if (record.mesh.isDisposed() || record.isInsideVolume) {
      continue;
    }

    expandMutableBounds(mutableBounds, record.mesh);
  }

  if (!Number.isFinite(mutableBounds.minX)) {
    return null;
  }

  return {
    min: new Vector3(mutableBounds.minX, mutableBounds.minY, mutableBounds.minZ),
    max: new Vector3(mutableBounds.maxX, mutableBounds.maxY, mutableBounds.maxZ)
  };
}

interface MutableBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function getOrCreateMutableBounds(boundsByStory: Map<number, MutableBounds>, storyIndex: number): MutableBounds {
  const existing = boundsByStory.get(storyIndex);
  if (existing) {
    return existing;
  }

  const created = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };
  boundsByStory.set(storyIndex, created);
  return created;
}

function expandMutableBounds(bounds: MutableBounds, mesh: AbstractMesh): void {
  mesh.computeWorldMatrix(true);
  const boundingBox = mesh.getBoundingInfo().boundingBox;
  const min = boundingBox.minimumWorld;
  const max = boundingBox.maximumWorld;

  bounds.minX = Math.min(bounds.minX, min.x);
  bounds.minY = Math.min(bounds.minY, min.y);
  bounds.minZ = Math.min(bounds.minZ, min.z);
  bounds.maxX = Math.max(bounds.maxX, max.x);
  bounds.maxY = Math.max(bounds.maxY, max.y);
  bounds.maxZ = Math.max(bounds.maxZ, max.z);
}

function hasRenderableLodPair(records: readonly BuildingVisibilityMeshRecord[]): boolean {
  let hasFullLod = false;
  let hasExteriorLod = false;

  for (const record of records) {
    if (record.lodRole === "shadow_proxy") {
      continue;
    }

    hasFullLod ||= record.lodLevel === 0;
    hasExteriorLod ||= record.lodLevel === 1;
  }

  return hasFullLod && hasExteriorLod;
}

function computeVolumeBounds(
  volume: BuildingVisibilityVolumeMetadata
): BuildingVisibilityBounds {
  const [minX, minY, minZ] = volume.volumeMin;
  const [maxX, maxY, maxZ] = volume.volumeMax;
  const localMin = new Vector3(minX, minZ - volume.storyZOffset, -maxY);
  const localMax = new Vector3(maxX, maxZ - volume.storyZOffset, -minY);
  volume.node.computeWorldMatrix(true);
  const worldMatrix = volume.node.getWorldMatrix();
  const bounds = createMutableBounds();

  for (const x of [localMin.x, localMax.x]) {
    for (const y of [localMin.y, localMax.y]) {
      for (const z of [localMin.z, localMax.z]) {
        expandMutableBoundsWithPoint(
          bounds,
          Vector3.TransformCoordinates(new Vector3(x, y, z), worldMatrix)
        );
      }
    }
  }

  return {
    min: new Vector3(bounds.minX, bounds.minY, bounds.minZ),
    max: new Vector3(bounds.maxX, bounds.maxY, bounds.maxZ)
  };
}

function createMutableBounds(): MutableBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };
}

function expandMutableBoundsWithPoint(bounds: MutableBounds, point: Vector3): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.minZ = Math.min(bounds.minZ, point.z);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
  bounds.maxZ = Math.max(bounds.maxZ, point.z);
}
