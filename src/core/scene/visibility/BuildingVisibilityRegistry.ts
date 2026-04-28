import { AbstractMesh, Vector3 } from "@babylonjs/core";
import {
  parseBuildingVisibilityMesh,
  type BuildingVisibilityMeshRecord
} from "./BuildingVisibilityMetadata";

export interface BuildingVisibilityBounds {
  readonly min: Vector3;
  readonly max: Vector3;
}

export interface BuildingVisibilityBuildingRecord {
  readonly buildingId: string;
  readonly meshes: BuildingVisibilityMeshRecord[];
  readonly haloMeshes: BuildingVisibilityMeshRecord[];
  readonly hideAboveMeshes: BuildingVisibilityMeshRecord[];
  readonly insideVolumes: BuildingVisibilityMeshRecord[];
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

  public rebuild(meshes: readonly AbstractMesh[]): void {
    this.buildingsById.clear();
    this.meshSignature = BuildingVisibilityRegistry.createMeshSignature(meshes);

    const mutableBuildings = new Map<
      string,
      {
        meshes: BuildingVisibilityMeshRecord[];
        haloMeshes: BuildingVisibilityMeshRecord[];
        hideAboveMeshes: BuildingVisibilityMeshRecord[];
        insideVolumes: BuildingVisibilityMeshRecord[];
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

      if (record.isInsideVolume) {
        building.insideVolumes.push(record);
      }
    }

    for (const [buildingId, mutableBuilding] of mutableBuildings) {
      const storyBoundsByStory = computeStoryBounds(mutableBuilding.meshes);
      this.buildingsById.set(buildingId, {
        buildingId,
        meshes: mutableBuilding.meshes,
        haloMeshes: mutableBuilding.haloMeshes,
        hideAboveMeshes: mutableBuilding.hideAboveMeshes,
        insideVolumes: mutableBuilding.insideVolumes,
        storyBoundsByStory,
        footprintBounds: computeFootprintBounds(mutableBuilding.meshes, storyBoundsByStory)
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
      insideVolumes: BuildingVisibilityMeshRecord[];
    }
  >,
  buildingId: string
): {
  meshes: BuildingVisibilityMeshRecord[];
  haloMeshes: BuildingVisibilityMeshRecord[];
  hideAboveMeshes: BuildingVisibilityMeshRecord[];
  insideVolumes: BuildingVisibilityMeshRecord[];
} {
  const existing = buildings.get(buildingId);
  if (existing) {
    return existing;
  }

  const created = {
    meshes: [],
    haloMeshes: [],
    hideAboveMeshes: [],
    insideVolumes: []
  };
  buildings.set(buildingId, created);
  return created;
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
