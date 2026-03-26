import { AbstractMesh, type Node } from "@babylonjs/core";

/**
 * Raw trigger metadata authored in Blender and exported via glTF extras.
 */
export interface SceneTriggerMetadata {
  readonly kind: string;
  readonly triggerType: string;
  readonly locationId: string;
  readonly targetScene: string;
}

/**
 * Runtime trigger descriptor bound to a Babylon mesh used for overlap checks.
 */
export interface SceneTriggerDescriptor {
  readonly mesh: AbstractMesh;
  readonly metadata: SceneTriggerMetadata;
}

/**
 * Resolves trigger metadata from Babylon metadata and glTF extras payload.
 *
 * @param node - Scene node that may contain trigger metadata.
 * @returns Trigger metadata when payload is valid, otherwise null.
 */
export function extractSceneTriggerMetadata(node: Node): SceneTriggerMetadata | null {
  let currentNode: Node | null = node;

  while (currentNode) {
    const metadata = currentNode.metadata;

    if (metadata && typeof metadata === "object") {
      const record = metadata as Record<string, unknown>;
      const extras = resolveExtrasRecord(record);

      if (extras) {
        const kind = normalizeMetadataString(extras.kind);
        const triggerType = normalizeMetadataString(extras.triggerType);
        const locationId = normalizeMetadataString(extras.locationId);
        const targetScene = normalizeMetadataString(extras.targetScene);

        if (kind && triggerType && locationId && targetScene) {
          return { kind, triggerType, locationId, targetScene };
        }
      }
    }

    currentNode = currentNode.parent;
  }

  return null;
}

/**
 * Collects valid trigger descriptors from loaded district meshes.
 *
 * @param meshes - District meshes to inspect.
 * @returns Registered trigger descriptors.
 */
export function collectSceneTriggers(nodes: readonly Node[]): SceneTriggerDescriptor[] {
  const triggers: SceneTriggerDescriptor[] = [];
  const seenMeshIds = new Set<number>();

  for (const node of nodes) {
    const candidateMeshes = resolveTriggerMeshes(node);

    for (const mesh of candidateMeshes) {
      if (seenMeshIds.has(mesh.uniqueId)) {
        continue;
      }

      const triggerMetadata = extractSceneTriggerMetadata(mesh);
      if (!triggerMetadata) {
        continue;
      }

      seenMeshIds.add(mesh.uniqueId);
      triggers.push({ mesh, metadata: triggerMetadata });
    }
  }

  return triggers;
}

function resolveExtrasRecord(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const gltfPayload = metadata.gltf;

  if (gltfPayload && typeof gltfPayload === "object") {
    const gltfRecord = gltfPayload as Record<string, unknown>;
    const extrasPayload = gltfRecord.extras;

    if (extrasPayload && typeof extrasPayload === "object") {
      return extrasPayload as Record<string, unknown>;
    }
  }

  return metadata;
}

function normalizeMetadataString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const hasWrappedDoubleQuotes = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const hasWrappedSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (hasWrappedDoubleQuotes || hasWrappedSingleQuotes) {
    const unwrapped = trimmed.slice(1, -1).trim();
    return unwrapped.length > 0 ? unwrapped : null;
  }

  if (trimmed.endsWith("\"") || trimmed.endsWith("'")) {
    return trimmed.slice(0, -1).trim();
  }

  return trimmed;
}

function resolveTriggerMeshes(node: Node): AbstractMesh[] {
  if (node instanceof AbstractMesh) {
    return [node];
  }

  const meshCapableNode = node as { getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[] };
  if (typeof meshCapableNode.getChildMeshes !== "function") {
    return [];
  }

  return meshCapableNode.getChildMeshes(false);
}
