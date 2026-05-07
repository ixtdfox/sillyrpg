import { Vector3 } from "@babylonjs/core";
import { RECT_TILE_SIZE, WORLD_GRID_ORIGIN_X, WORLD_GRID_ORIGIN_Z } from "../core/grid/WorldGridConstants";

export function snapWorldXToGrid(x: number): number {
  return WORLD_GRID_ORIGIN_X + Math.round((x - WORLD_GRID_ORIGIN_X) / RECT_TILE_SIZE) * RECT_TILE_SIZE;
}

export function snapWorldZToGrid(z: number): number {
  return WORLD_GRID_ORIGIN_Z + Math.round((z - WORLD_GRID_ORIGIN_Z) / RECT_TILE_SIZE) * RECT_TILE_SIZE;
}

export function snapEditorPlacement(position: Vector3, y: number): Vector3 {
  return new Vector3(snapWorldXToGrid(position.x), y, snapWorldZToGrid(position.z));
}
