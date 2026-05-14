import type { TerrainBrushShape } from "./TerrainBrushTypes";
import { TerrainScalarMath } from "../TerrainMath";

/**
 * Калькулятор веса terrain brush.
 *
 * Поддерживает circle/square формы и общий radial falloff. Это Strategy object,
 * который используют height editor и texture painter.
 */
export class TerrainBrushWeightCalculator {
  private readonly scalarMath: TerrainScalarMath;

  public constructor(scalarMath = new TerrainScalarMath()) {
    this.scalarMath = scalarMath;
  }

  /**
   * Считает вес круглой кисти по расстоянию от центра.
   */
  public getCircleWeight(dx: number, dz: number, radius: number, falloff: number): number {
    const distance = Math.sqrt(dx * dx + dz * dz);
    return this.getRadialWeight(distance, radius, falloff);
  }

  /**
   * Считает вес квадратной кисти через Chebyshev distance.
   */
  public getSquareWeight(dx: number, dz: number, radius: number, falloff: number): number {
    const distance = Math.max(Math.abs(dx), Math.abs(dz));
    return this.getRadialWeight(distance, radius, falloff);
  }

  /**
   * Делегирует расчет веса стратегии формы brush.
   */
  public getWeight(
    shape: TerrainBrushShape,
    dx: number,
    dz: number,
    radius: number,
    falloff: number
  ): number {
    return shape === "square"
      ? this.getSquareWeight(dx, dz, radius, falloff)
      : this.getCircleWeight(dx, dz, radius, falloff);
  }

  private getRadialWeight(distance: number, radius: number, falloff: number): number {
    const safeRadius = Math.max(0.0001, radius);
    if (distance > safeRadius) {
      return 0;
    }

    const clampedFalloff = this.scalarMath.clamp01(falloff);
    if (clampedFalloff <= 0.0001) {
      return 1;
    }

    const innerRadius = safeRadius * (1 - clampedFalloff);
    if (distance <= innerRadius) {
      return 1;
    }

    const t = this.scalarMath.clamp01((distance - innerRadius) / Math.max(0.0001, safeRadius - innerRadius));
    return 1 - this.smoothstep01(t);
  }

  private smoothstep01(value: number): number {
    const t = this.scalarMath.clamp01(value);
    return t * t * (3 - 2 * t);
  }
}
