import { TerrainHeightField } from "../../../src/core/world/terrain/TerrainHeightField";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: number | null, expected: number | null, message: string): void {
  if (actual === null || expected === null) {
    assert(actual === expected, `${message} expected ${expected} got ${actual}`);
    return;
  }

  const epsilon = 1e-6;
  assert(Math.abs(actual - expected) <= epsilon, `${message} expected ${expected} got ${actual}`);
}

function makeField(): TerrainHeightField {
  return new TerrainHeightField(
    2,
    2,
    2,
    2,
    new Float32Array([
      0, 10,
      20, 30
    ])
  );
}

function testCorners(): void {
  const field = makeField();
  assertClose(field.sampleBilinearLocal(-1, 1), 0, "Expected top-left corner sample");
  assertClose(field.sampleBilinearLocal(1, 1), 10, "Expected top-right corner sample");
  assertClose(field.sampleBilinearLocal(-1, -1), 20, "Expected bottom-left corner sample");
  assertClose(field.sampleBilinearLocal(1, -1), 30, "Expected bottom-right corner sample");
}

function testCenterInterpolation(): void {
  const field = makeField();
  assertClose(field.sampleBilinearLocal(0, 0), 15, "Expected center sample to average all corners");
}

function testInterpolationBetweenFourPoints(): void {
  const field = new TerrainHeightField(
    4,
    4,
    3,
    3,
    new Float32Array([
      0, 10, 20,
      30, 40, 50,
      60, 70, 80
    ])
  );

  assertClose(field.sampleBilinearLocal(0, 1), 25, "Expected bilinear interpolation inside center-top quad");
}

function testOutsideReturnsNull(): void {
  const field = makeField();
  assertClose(field.sampleBilinearLocal(1.1, 0), null, "Expected outside sample to return null");
}

function run(): void {
  testCorners();
  testCenterInterpolation();
  testInterpolationBetweenFourPoints();
  testOutsideReturnsNull();
}

run();
console.log("TerrainHeightField tests passed");
