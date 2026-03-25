import type { AbstractMesh, Node } from "@babylonjs/core";

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
        const kind = extras.kind;
        const triggerType = extras.triggerType;
        const locationId = extras.locationId;
        const targetScene = extras.targetScene;

        if (
          typeof kind === "string" &&
          typeof triggerType === "string" &&
          typeof locationId === "string" &&
          typeof targetScene === "string"
        ) {
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
export function collectSceneTriggers(meshes: readonly AbstractMesh[]): SceneTriggerDescriptor[] {
  const triggers: SceneTriggerDescriptor[] = [];

  for (const mesh of meshes) {
    const triggerMetadata = extractSceneTriggerMetadata(mesh);

    if (!triggerMetadata) {
      continue;
    }

    triggers.push({ mesh, metadata: triggerMetadata });
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
