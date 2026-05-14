import {
  Color3,
  MeshBuilder,
  Vector3,
  type AbstractMesh,
  type LinesMesh,
  type Scene
} from "@babylonjs/core";
import type { SceneGeneratedTerrainDescriptor } from "../../core/world/scene/SceneDescriptor";
import type { TerrainHeightField } from "../../core/world/terrain/TerrainHeightField";

interface GeneratedTerrainMeshMetadata {
  readonly generatedTerrainDescriptor?: SceneGeneratedTerrainDescriptor;
  readonly generatedTerrainHeightField?: TerrainHeightField;
  readonly terrainSurfaceCanonical?: boolean;
  readonly terrainVisualOnly?: boolean;
}

interface GeneratedTerrainSurface {
  readonly mesh: AbstractMesh;
  readonly heightField: TerrainHeightField;
}

const TERRAIN_GRID_Y_OFFSET = 0.08;

export class EditorTerrainGridOverlay {
  private readonly scene: Scene;
  private lineMesh: LinesMesh | null;
  private gridVisible: boolean;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.lineMesh = null;
    this.gridVisible = false;
  }

  public setGridVisible(isVisible: boolean, terrainMeshes: readonly AbstractMesh[]): boolean {
    this.gridVisible = isVisible;
    this.rebuildFromTerrainMeshes(terrainMeshes);
    return this.getGridVisible();
  }

  public getGridVisible(): boolean {
    return this.gridVisible && this.lineMesh !== null && !this.lineMesh.isDisposed() && this.lineMesh.isEnabled();
  }

  public getCanShowTerrainGrid(terrainMeshes: readonly AbstractMesh[]): boolean {
    return resolveGeneratedTerrainSurface(terrainMeshes) !== null;
  }

  public refreshFromTerrainMeshes(terrainMeshes: readonly AbstractMesh[]): void {
    this.rebuildFromTerrainMeshes(terrainMeshes);
  }

  public clear(): void {
    this.disposeLineMesh();
  }

  public dispose(): void {
    this.disposeLineMesh();
  }

  private rebuildFromTerrainMeshes(terrainMeshes: readonly AbstractMesh[]): void {
    this.disposeLineMesh();

    if (!this.gridVisible) {
      return;
    }

    const surface = resolveGeneratedTerrainSurface(terrainMeshes);
    if (!surface) {
      return;
    }

    const lines = buildTerrainGridLines(surface.mesh, surface.heightField);
    if (lines.length === 0) {
      return;
    }

    const lineMesh = MeshBuilder.CreateLineSystem("editor-generated-terrain-grid", { lines, updatable: false }, this.scene);
    lineMesh.color = Color3.FromHexString("#F7C948");
    lineMesh.isPickable = false;
    lineMesh.checkCollisions = false;
    lineMesh.metadata = {
      ...(lineMesh.metadata as Record<string, unknown> | undefined),
      editorHelper: true,
      editorSelectable: false,
      terrainDebugOnly: true,
      terrainVisualOnly: true,
      terrainSurfaceCanonical: false,
      terrainKind: "editor-generated-terrain-grid"
    };
    this.lineMesh = lineMesh;
  }

  private disposeLineMesh(): void {
    if (this.lineMesh && !this.lineMesh.isDisposed()) {
      this.lineMesh.dispose(false);
    }
    this.lineMesh = null;
  }
}

function resolveGeneratedTerrainSurface(terrainMeshes: readonly AbstractMesh[]): GeneratedTerrainSurface | null {
  for (const mesh of terrainMeshes) {
    if (mesh.isDisposed()) {
      continue;
    }

    const metadata = (mesh.metadata ?? null) as GeneratedTerrainMeshMetadata | null;
    if (
      metadata?.terrainVisualOnly === true ||
      metadata?.terrainSurfaceCanonical === false ||
      !metadata?.generatedTerrainDescriptor ||
      !metadata.generatedTerrainHeightField
    ) {
      continue;
    }

    return {
      mesh,
      heightField: metadata.generatedTerrainHeightField
    };
  }

  return null;
}

function buildTerrainGridLines(mesh: AbstractMesh, heightField: TerrainHeightField): Vector3[][] {
  const lines: Vector3[][] = [];

  for (let iz = 0; iz < heightField.resolutionZ; iz += 1) {
    const row: Vector3[] = [];
    for (let ix = 0; ix < heightField.resolutionX; ix += 1) {
      row.push(transformHeightFieldVertexToWorld(mesh, heightField, ix, iz));
    }
    lines.push(row);
  }

  for (let ix = 0; ix < heightField.resolutionX; ix += 1) {
    const column: Vector3[] = [];
    for (let iz = 0; iz < heightField.resolutionZ; iz += 1) {
      column.push(transformHeightFieldVertexToWorld(mesh, heightField, ix, iz));
    }
    lines.push(column);
  }

  return lines;
}

function transformHeightFieldVertexToWorld(
  mesh: AbstractMesh,
  heightField: TerrainHeightField,
  ix: number,
  iz: number
): Vector3 {
  const u = heightField.resolutionX <= 1 ? 0 : ix / (heightField.resolutionX - 1);
  const v = heightField.resolutionZ <= 1 ? 0 : iz / (heightField.resolutionZ - 1);
  const local = new Vector3(
    (u - 0.5) * heightField.width,
    heightField.getHeight(ix, iz) + TERRAIN_GRID_Y_OFFSET,
    (0.5 - v) * heightField.depth
  );
  return Vector3.TransformCoordinates(local, mesh.computeWorldMatrix(true));
}
