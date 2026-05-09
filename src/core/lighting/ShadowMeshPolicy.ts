import type { AbstractMesh } from "@babylonjs/core";
import type {
  SceneLightingDescriptor,
  ShadowCasterMode,
  ShadowReceiverMode
} from "./LightingTypes";

export type ShadowMeshSource = "terrain" | "sceneObject" | "character" | "unknown";

export interface ShadowMeshClassificationContext {
  readonly lighting: SceneLightingDescriptor;
  readonly source: ShadowMeshSource;
}

type ShadowRole = "caster" | "receiver" | "both" | "none";

export class ShadowMeshPolicy {
  public canCast(mesh: AbstractMesh, context: ShadowMeshClassificationContext): boolean {
    if (!this.isEligibleMesh(mesh)) {
      return false;
    }

    const metadata = this.readShadowMetadata(mesh);
    if (metadata.role === "none" || metadata.caster === false) {
      return false;
    }

    if (metadata.caster === true || metadata.role === "caster" || metadata.role === "both") {
      return true;
    }

    const shadows = context.lighting.shadows;
    const casterMode: ShadowCasterMode = shadows?.casterMode ?? "all";
    if (casterMode === "none" || casterMode === "metadata") {
      return false;
    }

    if (context.source === "terrain") {
      return shadows?.includeTerrain === true;
    }

    if (context.source === "sceneObject") {
      return shadows?.includeSceneObjects !== false;
    }

    if (context.source === "character") {
      return shadows?.includeCharacters !== false;
    }

    return true;
  }

  public canReceive(mesh: AbstractMesh, context: ShadowMeshClassificationContext): boolean {
    if (!this.isEligibleMesh(mesh)) {
      return false;
    }

    const metadata = this.readShadowMetadata(mesh);
    if (metadata.role === "none" || metadata.receiver === false) {
      return false;
    }

    if (metadata.receiver === true || metadata.role === "receiver" || metadata.role === "both") {
      return true;
    }

    const receiverMode: ShadowReceiverMode = context.lighting.shadows?.receiverMode ?? "terrainOnly";
    if (receiverMode === "none" || receiverMode === "metadata") {
      return false;
    }

    if (receiverMode === "all") {
      return true;
    }

    return context.source === "terrain";
  }

  private isEligibleMesh(mesh: AbstractMesh): boolean {
    if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.getTotalVertices() <= 0) {
      return false;
    }

    if (this.isHelperOrMetadataMesh(mesh)) {
      return false;
    }

    return true;
  }

  private isHelperOrMetadataMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.toLowerCase();
    const id = mesh.id.toLowerCase();
    const metadata = asRecord(mesh.metadata);
    const rawMetadata = asRecord(metadata.rawMetadata);

    if (name.includes("metadata") || id.includes("metadata")) {
      return true;
    }

    if (name.includes("navigationmetadata") || id.includes("navigationmetadata")) {
      return true;
    }

    return (
      metadata.editorHelper === true ||
      metadata.gameHelper === true ||
      metadata.isMetadata === true ||
      metadata.editorTerrainBrushPreview === true ||
      rawMetadata.editor_helper === true ||
      rawMetadata.game_helper === true ||
      rawMetadata.metadata_carrier === true ||
      rawMetadata.navigation_metadata === true
    );
  }

  private readShadowMetadata(mesh: AbstractMesh): {
    readonly caster?: boolean;
    readonly receiver?: boolean;
    readonly role?: ShadowRole;
  } {
    const metadata = asRecord(mesh.metadata);
    const rawMetadata = asRecord(metadata.rawMetadata);

    return {
      caster: readOptionalBoolean(metadata.shadowCaster) ?? readOptionalBoolean(rawMetadata.shadow_caster),
      receiver: readOptionalBoolean(metadata.shadowReceiver) ?? readOptionalBoolean(rawMetadata.shadow_receiver),
      role: readShadowRole(metadata.shadowRole) ?? readShadowRole(rawMetadata.shadow_role)
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readShadowRole(value: unknown): ShadowRole | undefined {
  if (value !== "caster" && value !== "receiver" && value !== "both" && value !== "none") {
    return undefined;
  }

  return value;
}
