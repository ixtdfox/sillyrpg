import { Vector3 } from "@babylonjs/core";
import type { GridCell } from "../../grid/GridCell";
import type { RectGridRuntime } from "../../grid/RectGridRuntime";
import type { TerrainSurfaceRegistry } from "../terrain/TerrainSurfaceRegistry";

export type SurfaceHeightSource =
  | "terrain-heightfield"
  | "navigation-story"
  | "raycast"
  | "fallback";

export interface SurfaceHeightRequest {
  readonly position: Vector3;
  readonly cell?: GridCell;
  readonly storyIndex: number;
  readonly fallbackY?: number;
}

export interface SurfaceHeightResult {
  readonly y: number;
  readonly source: SurfaceHeightSource;
  readonly storyIndex: number;
}

export class SurfaceHeightResolver {
  private readonly gridRuntime: Pick<RectGridRuntime, "getMergedStoryYByStory" | "getGrid">;
  private readonly terrainSurfaceRegistry: Pick<TerrainSurfaceRegistry, "sampleWorldHeight">;
  private lastDebugKey: string | null;

  public constructor(
    gridRuntime: Pick<RectGridRuntime, "getMergedStoryYByStory" | "getGrid">,
    terrainSurfaceRegistry: Pick<TerrainSurfaceRegistry, "sampleWorldHeight">
  ) {
    this.gridRuntime = gridRuntime;
    this.terrainSurfaceRegistry = terrainSurfaceRegistry;
    this.lastDebugKey = null;
  }

  public resolveY(input: SurfaceHeightRequest): SurfaceHeightResult {
    const storyY = this.gridRuntime.getMergedStoryYByStory().get(input.storyIndex) ?? this.gridRuntime.getGrid().getOrigin().y;
    const terrainY = input.storyIndex === 0
      ? this.terrainSurfaceRegistry.sampleWorldHeight(input.position.x, input.position.z)
      : null;

    const result = terrainY !== null
      ? { y: terrainY, source: "terrain-heightfield" as const, storyIndex: input.storyIndex }
      : Number.isFinite(storyY)
        ? { y: storyY, source: "navigation-story" as const, storyIndex: input.storyIndex }
        : { y: input.fallbackY ?? input.position.y, source: "fallback" as const, storyIndex: input.storyIndex };

    this.debugLog(result, input);
    return result;
  }

  public resolveGroundedPosition(input: SurfaceHeightRequest & { footOffset?: number }): Vector3 {
    const resolved = this.resolveY(input);
    return new Vector3(
      input.position.x,
      resolved.y + (input.footOffset ?? 0),
      input.position.z
    );
  }

  private debugLog(result: SurfaceHeightResult, input: SurfaceHeightRequest): void {
    if (!isSurfaceHeightDebugEnabled()) {
      return;
    }

    const cellKey = input.cell ? `${input.cell.x}:${input.cell.z}` : "n/a";
    const debugKey = `${result.source}:${result.storyIndex}:${cellKey}:${result.y.toFixed(2)}`;
    if (debugKey === this.lastDebugKey) {
      return;
    }

    this.lastDebugKey = debugKey;
    console.debug(
      `[SurfaceHeight] source=${result.source} story=${result.storyIndex} cell=${cellKey} y=${result.y.toFixed(2)}`
    );
  }
}

function isSurfaceHeightDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("sillyrpg.debug.surfaceHeight") === "1";
  } catch {
    return false;
  }
}
