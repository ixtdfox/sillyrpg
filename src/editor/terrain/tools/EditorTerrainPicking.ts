import { Vector3, type Scene } from "@babylonjs/core";
import type { EditorTerrainInstance } from "../../types";
import type { SceneGeneratedTerrainDescriptor } from "../../../core/world/scene/SceneDescriptor";

export interface EditorTerrainPickResult {
  readonly descriptor: SceneGeneratedTerrainDescriptor;
  readonly pointWorld: Vector3;
  readonly pointLocal: Vector3;
  readonly localBrushRadius: number;
}

export class EditorTerrainPicking {
  public pick(
    scene: Scene,
    canvas: HTMLCanvasElement,
    terrain: EditorTerrainInstance | null,
    clientX: number,
    clientY: number
  ): EditorTerrainPickResult | null {
    if (!terrain || terrain.descriptor.kind !== "generated") {
      return null;
    }

    const engine = scene.getEngine();
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * engine.getRenderWidth();
    const y = ((clientY - rect.top) / rect.height) * engine.getRenderHeight();
    const terrainMeshes = new Set(terrain.renderableMeshes);
    const pick = scene.pick(x, y, (mesh) => terrainMeshes.has(mesh));
    if (!pick?.hit || !pick.pickedPoint) {
      return null;
    }

    const inverseWorld = terrain.root.computeWorldMatrix(true).clone().invert();
    const localPoint = Vector3.TransformCoordinates(pick.pickedPoint, inverseWorld);
    const absoluteScaling = terrain.root.absoluteScaling ?? new Vector3(1, 1, 1);
    const horizontalScale = Math.max(0.0001, (Math.abs(absoluteScaling.x) + Math.abs(absoluteScaling.z)) * 0.5);

    return {
      descriptor: terrain.descriptor,
      pointWorld: pick.pickedPoint.clone(),
      pointLocal: localPoint,
      // Brush math operates in terrain-local coordinates. For non-uniform terrain scaling
      // this uses the average horizontal scale, which keeps editing stable for current scenes.
      localBrushRadius: 1 / horizontalScale
    };
  }
}
