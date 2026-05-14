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

interface ShadowMetadataDecision {
  readonly caster?: boolean;
  readonly receiver?: boolean;
  readonly role?: ShadowRole;
}

/**
 * Reader для shadow-метаданных Babylon mesh.
 *
 * Класс изолирует знание о двух форматах метаданных: нормализованном editor
 * формате (`shadowCaster`, `shadowReceiver`, `shadowRole`) и raw snake_case
 * формате, который может прийти из импортированных GLTF/scene assets.
 */
export class ShadowMetadataReader {
  /** Возвращает shadow overrides, объединяя editor metadata и raw imported metadata. */
  public read(mesh: AbstractMesh): ShadowMetadataDecision {
    const metadata = this.asRecord(mesh.metadata);
    const rawMetadata = this.asRecord(metadata.rawMetadata);

    return {
      caster: this.readOptionalBoolean(metadata.shadowCaster) ?? this.readOptionalBoolean(rawMetadata.shadow_caster),
      receiver: this.readOptionalBoolean(metadata.shadowReceiver) ?? this.readOptionalBoolean(rawMetadata.shadow_receiver),
      role: this.readShadowRole(metadata.shadowRole) ?? this.readShadowRole(rawMetadata.shadow_role)
    };
  }

  /** Определяет meshes, которые служат техническими helper/metadata carrier и не должны участвовать в тенях. */
  public isHelperOrMetadataMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.toLowerCase();
    const id = mesh.id.toLowerCase();
    const metadata = this.asRecord(mesh.metadata);
    const rawMetadata = this.asRecord(metadata.rawMetadata);

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

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private readOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
  }

  private readShadowRole(value: unknown): ShadowRole | undefined {
    if (value !== "caster" && value !== "receiver" && value !== "both" && value !== "none") {
      return undefined;
    }

    return value;
  }
}

/**
 * Strategy-класс, который решает, какие meshes участвуют в тенях.
 *
 * Policy учитывает глобальный lighting descriptor, тип источника mesh-батча и
 * локальные metadata overrides. Это позволяет держать shadow-правила отдельно
 * от registry/controller и менять стратегию без переписывания синхронизации.
 */
export class ShadowMeshPolicy {
  public constructor(private readonly metadataReader: ShadowMetadataReader = new ShadowMetadataReader()) {}

  /** Проверяет, должен ли mesh попасть в render list shadow generator'а. */
  public canCast(mesh: AbstractMesh, context: ShadowMeshClassificationContext): boolean {
    if (!this.isEligibleMesh(mesh)) {
      return false;
    }

    const metadata = this.metadataReader.read(mesh);
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

  /** Проверяет, должен ли mesh принимать тени через `receiveShadows`. */
  public canReceive(mesh: AbstractMesh, context: ShadowMeshClassificationContext): boolean {
    if (!this.isEligibleMesh(mesh)) {
      return false;
    }

    const metadata = this.metadataReader.read(mesh);
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

  /**
   * Общий guard для renderable mesh.
   *
   * Здесь отсекаются disposed/disabled/invisible meshes, пустые контейнеры и
   * служебные metadata/helper meshes, чтобы policy не регистрировала объекты,
   * которые не должны участвовать в runtime-освещении.
   */
  private isEligibleMesh(mesh: AbstractMesh): boolean {
    if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.getTotalVertices() <= 0) {
      return false;
    }

    if (this.metadataReader.isHelperOrMetadataMesh(mesh)) {
      return false;
    }

    return true;
  }
}
