import type {
  SceneGeneratedTerrainDescriptor,
  SceneGeneratedTerrainMaterialDescriptor,
  SceneTerrainGeneratorDescriptor,
  SceneTerrainMaterialBandDescriptor,
  SceneVector2Tuple,
  SceneVector3Tuple
} from "../scene/SceneDescriptor";
import {
  DEFAULT_TERRAIN_ID,
  DEFAULT_TERRAIN_POSITION,
  DEFAULT_TERRAIN_PRESET,
  DEFAULT_TERRAIN_RESOLUTION,
  DEFAULT_TERRAIN_ROTATION,
  DEFAULT_TERRAIN_SCALE,
  DEFAULT_TERRAIN_SIZE,
  cloneGeneratedTerrainMaterialDescriptor,
  cloneTerrainGeneratorDescriptor
} from "./TerrainTypes";

export interface TerrainGeneratorPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly generator: SceneTerrainGeneratorDescriptor;
  readonly material?: SceneGeneratedTerrainMaterialDescriptor;
}

const DEFAULT_HEIGHT_BANDS = [
  { id: "low", label: "Low", minHeight: -160, maxHeight: -8, color: "#475D52" },
  { id: "mid", label: "Mid", minHeight: -8, maxHeight: 24, color: "#6E7B57" },
  { id: "high", label: "High", minHeight: 24, maxHeight: 72, color: "#7A746D" },
  { id: "peak", label: "Peak", minHeight: 72, maxHeight: 220, color: "#C8CBCB" }
] as const satisfies readonly SceneTerrainMaterialBandDescriptor[];

const ISLAND_HEIGHT_BANDS = [
  { id: "shore", label: "Shore", minHeight: -160, maxHeight: 0, color: "#4D6970" },
  { id: "low", label: "Low", minHeight: 0, maxHeight: 14, color: "#73805A" },
  { id: "high", label: "High", minHeight: 14, maxHeight: 40, color: "#8A846F" },
  { id: "peak", label: "Peak", minHeight: 40, maxHeight: 180, color: "#D0D2D0" }
] as const satisfies readonly SceneTerrainMaterialBandDescriptor[];

const PRESETS: readonly TerrainGeneratorPreset[] = [
  {
    id: "flat-gray",
    label: "Flat Gray",
    description: "Very small variation for placement-heavy scenes.",
    generator: {
      preset: "flat-gray",
      strategy: "flat",
      seed: 101,
      height: {
        base: 0,
        amplitude: 0.18,
        frequency: 0.14,
        octaves: 2,
        persistence: 0.35,
        lacunarity: 2
      },
      falloff: {
        enabled: false,
        mode: "none",
        radius: 0.8,
        strength: 0
      },
      shaping: {
        flattenCenter: false,
        centerRadius: 0.4,
        terraceSteps: 0,
        smoothPasses: 1
      }
    },
    material: {
      kind: "flat",
      color: "#8D9298"
    }
  },
  {
    id: "soft-hills",
    label: "Soft Hills",
    description: "Gentle rolling hills with smooth slopes.",
    generator: {
      preset: "soft-hills",
      strategy: "noise",
      seed: 204,
      height: {
        base: 0,
        amplitude: 14,
        frequency: 0.034,
        octaves: 4,
        persistence: 0.48,
        lacunarity: 2.1
      },
      falloff: {
        enabled: false,
        mode: "none",
        radius: 0.75,
        strength: 0
      },
      shaping: {
        flattenCenter: false,
        centerRadius: 0.42,
        terraceSteps: 0,
        smoothPasses: 1
      }
    },
    material: {
      kind: "heightBands",
      color: "#7E8770",
      bands: DEFAULT_HEIGHT_BANDS
    }
  },
  {
    id: "island-plateau",
    label: "Island Plateau",
    description: "Usable center with falling edges around the perimeter.",
    generator: {
      preset: "island-plateau",
      strategy: "islandPlateau",
      seed: 307,
      height: {
        base: 0.15,
        amplitude: 24,
        frequency: 0.028,
        octaves: 5,
        persistence: 0.52,
        lacunarity: 2.2
      },
      falloff: {
        enabled: true,
        mode: "island",
        radius: 0.62,
        strength: 0.92
      },
      shaping: {
        flattenCenter: true,
        centerRadius: 0.3,
        terraceSteps: 0,
        smoothPasses: 1
      }
    },
    material: {
      kind: "heightBands",
      color: "#7E8770",
      bands: ISLAND_HEIGHT_BANDS
    }
  },
  {
    id: "rocky-ridges",
    label: "Rocky Ridges",
    description: "Sharper height changes and more dramatic ridges.",
    generator: {
      preset: "rocky-ridges",
      strategy: "rockyRidges",
      seed: 409,
      height: {
        base: 0,
        amplitude: 52,
        frequency: 0.042,
        octaves: 6,
        persistence: 0.54,
        lacunarity: 2.55
      },
      falloff: {
        enabled: false,
        mode: "none",
        radius: 0.72,
        strength: 0
      },
      shaping: {
        flattenCenter: false,
        centerRadius: 0.2,
        terraceSteps: 2,
        smoothPasses: 0
      }
    },
    material: {
      kind: "heightBands",
      color: "#8F8A82",
      bands: DEFAULT_HEIGHT_BANDS
    }
  },
  {
    id: "urban-pad",
    label: "Urban Pad",
    description: "Mostly flat center with mild edge breakup for city blocks.",
    generator: {
      preset: "urban-pad",
      strategy: "urbanPad",
      seed: 503,
      height: {
        base: 0,
        amplitude: 4,
        frequency: 0.026,
        octaves: 3,
        persistence: 0.4,
        lacunarity: 2
      },
      falloff: {
        enabled: true,
        mode: "edgeFade",
        radius: 0.8,
        strength: 0.45
      },
      shaping: {
        flattenCenter: true,
        centerRadius: 0.48,
        terraceSteps: 0,
        smoothPasses: 2
      }
    },
    material: {
      kind: "flat",
      color: "#8D9298"
    }
  },
  {
    id: "mountains",
    label: "Mountains",
    description: "Large mountain chains with deep valleys and sharp peaks.",
    generator: {
      preset: "mountains",
      strategy: "mountains",
      seed: 611,
      height: {
        base: 4,
        amplitude: 108,
        frequency: 0.022,
        octaves: 7,
        persistence: 0.5,
        lacunarity: 2.4
      },
      falloff: {
        enabled: false,
        mode: "none",
        radius: 0.72,
        strength: 0
      },
      shaping: {
        flattenCenter: false,
        centerRadius: 0.18,
        terraceSteps: 0,
        smoothPasses: 0
      }
    },
    material: {
      kind: "heightBands",
      color: "#7D7A76",
      bands: DEFAULT_HEIGHT_BANDS
    }
  }
] as const;

export function getTerrainGeneratorPresets(): readonly TerrainGeneratorPreset[] {
  return PRESETS;
}

export function getTerrainGeneratorPreset(presetId: string): TerrainGeneratorPreset {
  return PRESETS.find((preset) => preset.id === presetId) ?? PRESETS.find((preset) => preset.id === DEFAULT_TERRAIN_PRESET)!;
}

export function createGeneratedTerrainDescriptorFromPreset(options?: {
  readonly presetId?: string;
  readonly id?: string;
  readonly size?: SceneVector2Tuple;
  readonly resolution?: SceneVector2Tuple;
  readonly position?: SceneVector3Tuple;
  readonly rotation?: SceneVector3Tuple;
  readonly scale?: SceneVector3Tuple;
  readonly seed?: number;
}): SceneGeneratedTerrainDescriptor {
  const preset = getTerrainGeneratorPreset(options?.presetId ?? DEFAULT_TERRAIN_PRESET);
  const generator = {
    ...cloneTerrainGeneratorDescriptor(preset.generator),
    seed: options?.seed ?? preset.generator.seed
  };

  return {
    id: options?.id ?? DEFAULT_TERRAIN_ID,
    kind: "generated",
    size: options?.size ?? DEFAULT_TERRAIN_SIZE,
    resolution: options?.resolution ?? DEFAULT_TERRAIN_RESOLUTION,
    position: options?.position ?? DEFAULT_TERRAIN_POSITION,
    rotation: options?.rotation ?? DEFAULT_TERRAIN_ROTATION,
    scale: options?.scale ?? DEFAULT_TERRAIN_SCALE,
    generator,
    material: cloneGeneratedTerrainMaterialDescriptor(preset.material)
  };
}
