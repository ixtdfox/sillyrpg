import { Vector3 } from "@babylonjs/core";
import {
  RECT_TILE_SIZE,
  WORLD_GRID_ORIGIN_X,
  WORLD_GRID_ORIGIN_Y,
  WORLD_GRID_ORIGIN_Z,
  WORLD_VERTICAL_TILE_SIZE
} from "../core/grid/WorldGridConstants";
import type { EditorMoveAxisMode } from "./state/EditorMoveAxisMode";

export function snapWorldXToGrid(x: number): number {
  return WORLD_GRID_ORIGIN_X + Math.round((x - WORLD_GRID_ORIGIN_X) / RECT_TILE_SIZE) * RECT_TILE_SIZE;
}

export function snapWorldZToGrid(z: number): number {
  return WORLD_GRID_ORIGIN_Z + Math.round((z - WORLD_GRID_ORIGIN_Z) / RECT_TILE_SIZE) * RECT_TILE_SIZE;
}

export function snapWorldYToGrid(y: number): number {
  return WORLD_GRID_ORIGIN_Y + Math.round((y - WORLD_GRID_ORIGIN_Y) / WORLD_VERTICAL_TILE_SIZE) * WORLD_VERTICAL_TILE_SIZE;
}

export function snapWorldVectorToGrid(position: Vector3): Vector3 {
  return new Vector3(snapWorldXToGrid(position.x), snapWorldYToGrid(position.y), snapWorldZToGrid(position.z));
}

export function snapEditorPlacement(position: Vector3, y: number): Vector3 {
  return new Vector3(snapWorldXToGrid(position.x), snapWorldYToGrid(y), snapWorldZToGrid(position.z));
}

export function snapEditorMovePosition(
  rawPosition: Vector3,
  previousPosition: Vector3,
  axisMode: EditorMoveAxisMode
): Vector3 {
  if (axisMode === "y") {
    return new Vector3(previousPosition.x, snapWorldYToGrid(rawPosition.y), previousPosition.z);
  }

  if (axisMode === "x") {
    return new Vector3(snapWorldXToGrid(rawPosition.x), previousPosition.y, previousPosition.z);
  }

  if (axisMode === "z") {
    return new Vector3(previousPosition.x, previousPosition.y, snapWorldZToGrid(rawPosition.z));
  }

  return new Vector3(snapWorldXToGrid(rawPosition.x), previousPosition.y, snapWorldZToGrid(rawPosition.z));
}
