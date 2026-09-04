import type { SceneObjectDescriptor } from "../../core/world/scene/SceneDescriptor";

export type ConnectedTopology = "isolated" | "end" | "straight" | "corner" | "t-junction" | "cross";

export interface ConnectedObjectVariant {
  readonly topology: ConnectedTopology;
  readonly asset: string;
  /** Orientation of this asset before applying the resolved quarter turns. */
  readonly canonicalMask?: number;
}

export interface ConnectedObjectDefinition {
  readonly id: string;
  readonly label: string;
  readonly groupId: string;
  readonly tileSize: number;
  /** World-space Y used by the connected object root. */
  readonly placementY?: number;
  /** World-space height to which generated terrain is flattened under the object. */
  readonly terrainFitHeight?: number;
  readonly variants: readonly ConnectedObjectVariant[];
  readonly fallbackTopology?: ConnectedTopology;
}

export interface ResolvedConnectedObjectVariant {
  readonly mask: number;
  readonly topology: ConnectedTopology;
  readonly asset: string;
  readonly quarterTurns: number;
  readonly rotationY: number;
  readonly exact: boolean;
}

const DIRECTION_BITS = [1, 2, 4, 8] as const;
const DIRECTION_OFFSETS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0]
] as const;

const DEFAULT_CANONICAL_MASKS: Readonly<Record<ConnectedTopology, number>> = {
  isolated: 0,
  end: 1,
  straight: 5,
  corner: 3,
  "t-junction": 7,
  cross: 15
};

export function getConnectedConnectionMask(
  object: SceneObjectDescriptor,
  objects: readonly SceneObjectDescriptor[],
  definition: ConnectedObjectDefinition
): number {
  const connected = object.connected;
  if (!connected || connected.groupId !== definition.groupId) {
    return 0;
  }

  const [x, z] = getConnectedGridPosition(object, definition.tileSize);
  let mask = 0;

  for (let index = 0; index < DIRECTION_BITS.length; index += 1) {
    const [offsetX, offsetZ] = DIRECTION_OFFSETS[index]!;
    const hasNeighbor = objects.some((candidate) => {
      if (candidate.id === object.id) {
        return false;
      }

      const candidateConnected = candidate.connected;
      if (
        !candidateConnected ||
        candidateConnected.groupId !== definition.groupId
      ) {
        return false;
      }

      const [candidateX, candidateZ] = getConnectedGridPosition(candidate, definition.tileSize);
      return candidateX === x + offsetX && candidateZ === z + offsetZ;
    });

    if (hasNeighbor) {
      mask |= DIRECTION_BITS[index]!;
    }
  }

  return mask;
}

export function getConnectedGridPosition(
  object: Pick<SceneObjectDescriptor, "position">,
  tileSize: number
): readonly [number, number] {
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new Error("Connected object tileSize must be a positive finite number.");
  }

  return [
    Math.round(object.position[0] / tileSize),
    Math.round(object.position[2] / tileSize)
  ];
}

export function resolveConnectedObjectVariant(
  definition: ConnectedObjectDefinition,
  mask: number
): ResolvedConnectedObjectVariant {
  const normalizedMask = mask & 0b1111;
  const topology = topologyForMask(normalizedMask);

  for (const variant of definition.variants) {
    if (variant.topology !== topology) {
      continue;
    }

    const quarterTurns = findQuarterTurns(getCanonicalMask(variant), normalizedMask);
    if (quarterTurns === null) {
      continue;
    }

    return createResolvedVariant(normalizedMask, topology, variant, quarterTurns, true);
  }

  const fallbackTopology = definition.fallbackTopology ?? definition.variants[0]?.topology;
  const fallback = definition.variants.find((variant) => variant.topology === fallbackTopology) ?? definition.variants[0];
  if (!fallback) {
    throw new Error(`Connected object definition '${definition.id}' has no variants.`);
  }

  return createResolvedVariant(
    normalizedMask,
    topology,
    fallback,
    findFallbackQuarterTurns(getCanonicalMask(fallback), normalizedMask),
    false
  );
}

export function topologyForMask(mask: number): ConnectedTopology {
  const normalizedMask = mask & 0b1111;
  const connectionCount = countBits(normalizedMask);
  if (connectionCount === 0) {
    return "isolated";
  }
  if (connectionCount === 1) {
    return "end";
  }
  if (connectionCount === 2) {
    return normalizedMask === 5 || normalizedMask === 10 ? "straight" : "corner";
  }
  if (connectionCount === 3) {
    return "t-junction";
  }
  return "cross";
}

export function rotateConnectionMask(mask: number, quarterTurns: number): number {
  let normalizedTurns = quarterTurns % 4;
  if (normalizedTurns < 0) {
    normalizedTurns += 4;
  }

  let result = 0;
  for (let index = 0; index < DIRECTION_BITS.length; index += 1) {
    if ((mask & DIRECTION_BITS[index]!) === 0) {
      continue;
    }

    result |= DIRECTION_BITS[(index + normalizedTurns) % 4]!;
  }
  return result;
}

function getCanonicalMask(variant: ConnectedObjectVariant): number {
  return (variant.canonicalMask ?? DEFAULT_CANONICAL_MASKS[variant.topology]) & 0b1111;
}

function findQuarterTurns(canonicalMask: number, targetMask: number): number | null {
  for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
    if (rotateConnectionMask(canonicalMask, quarterTurns) === targetMask) {
      return quarterTurns;
    }
  }
  return null;
}

function findFallbackQuarterTurns(canonicalMask: number, targetMask: number): number {
  if (targetMask === 0) {
    return 0;
  }

  let bestQuarterTurns = 0;
  let bestOverlap = -1;
  for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
    const rotatedMask = rotateConnectionMask(canonicalMask, quarterTurns);
    const overlap = countBits(rotatedMask & targetMask);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestQuarterTurns = quarterTurns;
    }
  }

  return bestQuarterTurns;
}

function createResolvedVariant(
  mask: number,
  topology: ConnectedTopology,
  variant: ConnectedObjectVariant,
  quarterTurns: number,
  exact: boolean
): ResolvedConnectedObjectVariant {
  return {
    mask,
    topology,
    asset: variant.asset,
    quarterTurns,
    rotationY: quarterTurns * (Math.PI / 2),
    exact
  };
}

function countBits(mask: number): number {
  let count = 0;
  let value = mask;
  while (value !== 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}
