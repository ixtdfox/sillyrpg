import { Vector3 } from "@babylonjs/core";
import { GridCell } from "../../../src/core/grid/GridCell";
import { RectGrid } from "../../../src/core/grid/RectGrid";
import {
  SurfaceHeightDebugLogger,
  SurfaceHeightDebugPolicy,
  SurfaceHeightResolver,
  type SurfaceHeightResult,
  type SurfaceHeightStrategy
} from "../../../src/core/world/surface/SurfaceHeightResolver";

interface ResolverFixtureOptions {
  readonly terrainY?: number | null;
  readonly storyYByStory?: ReadonlyMap<number, number>;
  readonly originY?: number;
  readonly strategies?: readonly SurfaceHeightStrategy[];
  readonly debugLogger?: SurfaceHeightDebugLogger;
}

class EnabledSurfaceHeightDebugPolicy extends SurfaceHeightDebugPolicy {
  public override isEnabled(): boolean {
    return true;
  }
}

function makeResolver(options: ResolverFixtureOptions = {}): SurfaceHeightResolver {
  const storyYByStory = new Map(options.storyYByStory ?? [[0, 0]]);
  const grid = new RectGrid(new Vector3(0, options.originY ?? 0, 0), 1, {
    minX: 0,
    maxX: 1,
    minZ: 0,
    maxZ: 1
  });
  const gridRuntime = {
    getMergedStoryYByStory: () => storyYByStory,
    getGrid: () => grid
  };
  const terrainSurfaceSampler = {
    sampleWorldHeight: () => options.terrainY ?? null
  };

  return new SurfaceHeightResolver(
    gridRuntime,
    terrainSurfaceSampler,
    options.strategies,
    options.debugLogger
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertResult(
  result: SurfaceHeightResult,
  y: number,
  source: SurfaceHeightResult["source"],
  message: string
): void {
  assert(result.y === y, `${message}: expected y=${y}, received ${result.y}.`);
  assert(result.source === source, `${message}: expected source=${source}, received ${result.source}.`);
}

function testTerrainHeightWinsOnGroundStory(): void {
  const resolver = makeResolver({
    terrainY: 7,
    storyYByStory: new Map([[0, 3]])
  });

  const result = resolver.resolveY({
    position: new Vector3(10, 100, 20),
    storyIndex: 0
  });

  assertResult(result, 7, "terrain-heightfield", "Ground story should prefer terrain heightfield");
}

function testUpperStoryIgnoresTerrainHeight(): void {
  const resolver = makeResolver({
    terrainY: 7,
    storyYByStory: new Map([[1, 12]])
  });

  const result = resolver.resolveY({
    position: new Vector3(10, 100, 20),
    storyIndex: 1
  });

  assertResult(result, 12, "navigation-story", "Upper story should use navigation story height");
}

function testFallbackUsedWhenStoryHeightIsNotFinite(): void {
  const resolver = makeResolver({
    terrainY: null,
    storyYByStory: new Map(),
    originY: Number.NaN
  });

  const result = resolver.resolveY({
    position: new Vector3(1, 2, 3),
    storyIndex: 0,
    fallbackY: 11
  });

  assertResult(result, 11, "fallback", "Resolver should use fallback height when no source resolves");
}

function testGroundedPositionAddsFootOffset(): void {
  const resolver = makeResolver({
    terrainY: 4
  });

  const position = resolver.resolveGroundedPosition({
    position: new Vector3(1, 100, 3),
    storyIndex: 0,
    footOffset: 0.25
  });

  assert(position.x === 1, "Grounded position should preserve X.");
  assert(position.y === 4.25, "Grounded position should add foot offset to resolved Y.");
  assert(position.z === 3, "Grounded position should preserve Z.");
}

function testDebugLoggerDeduplicatesRepeatedState(): void {
  const originalDebug = console.debug;
  const messages: string[] = [];
  console.debug = (message?: unknown) => {
    messages.push(String(message));
  };

  try {
    const logger = new SurfaceHeightDebugLogger(new EnabledSurfaceHeightDebugPolicy());
    const result: SurfaceHeightResult = {
      y: 3,
      source: "navigation-story",
      storyIndex: 1
    };
    const request = {
      position: Vector3.Zero(),
      cell: new GridCell(2, -1),
      storyIndex: 1
    };

    logger.log(result, request);
    logger.log(result, request);

    assert(messages.length === 1, "Debug logger should suppress duplicate messages.");
    assert(messages[0]?.includes("source=navigation-story") === true, "Debug logger should include source.");
  } finally {
    console.debug = originalDebug;
  }
}

function testEmptyStrategyChainStillFallsBack(): void {
  const resolver = makeResolver({
    strategies: [],
    originY: Number.NaN
  });

  const result = resolver.resolveY({
    position: new Vector3(1, 9, 3),
    storyIndex: 5
  });

  assertResult(result, 9, "fallback", "Empty strategy chain should still use fallback strategy");
}

function run(): void {
  testTerrainHeightWinsOnGroundStory();
  testUpperStoryIgnoresTerrainHeight();
  testFallbackUsedWhenStoryHeightIsNotFinite();
  testGroundedPositionAddsFootOffset();
  testDebugLoggerDeduplicatesRepeatedState();
  testEmptyStrategyChainStillFallsBack();
}

run();
console.log("SurfaceHeightResolver tests passed");
