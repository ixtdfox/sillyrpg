import { Color3, Color4 } from "@babylonjs/core";
import type { SceneTerrainMaterialBandDescriptor } from "../scene/SceneDescriptor";

/**
 * Единая политика чтения цветов terrain-материалов.
 *
 * Импортированные descriptors могут содержать неверный hex. Вместо падения
 * renderer использует стабильный fallback-цвет, а материалы/LOD patches получают
 * одинаковую интерпретацию height bands.
 */
export class TerrainColorResolver {
  private readonly fallbackColor: string;

  public constructor(fallbackColor = "#8D9298") {
    this.fallbackColor = fallbackColor;
  }

  /**
   * Безопасно преобразует hex-строку в Babylon Color3.
   */
  public resolveColor3(hexColor: string | undefined): Color3 {
    try {
      return Color3.FromHexString(hexColor ?? this.fallbackColor);
    } catch {
      return Color3.FromHexString(this.fallbackColor);
    }
  }

  /**
   * Строит vertex color buffer по диапазонам высот.
   */
  public buildHeightBandColors(
    vertexHeights: readonly number[],
    bands: readonly SceneTerrainMaterialBandDescriptor[]
  ): number[] {
    const colors: number[] = [];
    for (const height of vertexHeights) {
      const band =
        bands.find((candidate) => height >= candidate.minHeight && height <= candidate.maxHeight) ??
        (height < bands[0]!.minHeight ? bands[0]! : bands[bands.length - 1]!);
      const color = Color4.FromColor3(this.resolveColor3(band?.color), 1);
      colors.push(color.r, color.g, color.b, color.a);
    }
    return colors;
  }
}
