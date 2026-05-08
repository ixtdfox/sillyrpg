import type { TerrainBrushShape } from "./TerrainBrushTypes";

export function getBrushWeightCircle(dx: number, dz: number, radius: number, falloff: number): number {
  const distance = Math.sqrt(dx * dx + dz * dz);
  return getRadialBrushWeight(distance, radius, falloff);
}

export function getBrushWeightSquare(dx: number, dz: number, radius: number, falloff: number): number {
  const distance = Math.max(Math.abs(dx), Math.abs(dz));
  return getRadialBrushWeight(distance, radius, falloff);
}

export function getBrushWeight(
  shape: TerrainBrushShape,
  dx: number,
  dz: number,
  radius: number,
  falloff: number
): number {
  return shape === "square"
    ? getBrushWeightSquare(dx, dz, radius, falloff)
    : getBrushWeightCircle(dx, dz, radius, falloff);
}

function getRadialBrushWeight(distance: number, radius: number, falloff: number): number {
  const safeRadius = Math.max(0.0001, radius);
  if (distance > safeRadius) {
    return 0;
  }

  const clampedFalloff = clamp01(falloff);
  if (clampedFalloff <= 0.0001) {
    return 1;
  }

  const innerRadius = safeRadius * (1 - clampedFalloff);
  if (distance <= innerRadius) {
    return 1;
  }

  const t = clamp01((distance - innerRadius) / Math.max(0.0001, safeRadius - innerRadius));
  return 1 - smoothstep(t);
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
