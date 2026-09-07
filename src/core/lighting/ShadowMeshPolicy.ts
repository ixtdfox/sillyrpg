import type { AbstractMesh, Node } from "@babylonjs/core";
import type {
  SceneLightingDescriptor,
  ShadowCasterMode,
  ShadowReceiverMode
} from "./LightingTypes";
import { RUNTIME_FRUSTUM_CULLED_METADATA_KEY } from "../scene/visibility/SceneObjectVisibilityController";

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
 * Класс изолирует знание о двух форматах метаданных: нормализованном runtime
 * формате (`shadowCaster`, `shadowReceiver`, `shadowRole`) и raw snake_case
 * формате, который может прийти из импортированных GLTF/scene assets.
 */
export class ShadowMetadataReader {
  /** Возвращает shadow overrides, объединяя runtime metadata и raw imported metadata. */
  public read(mesh: AbstractMesh): ShadowMetadataDecision {
    let caster: boolean | undefined;
    let receiver: boolean | undefined;
    let node: Node | null = mesh;

    while (node) {
      const nodeDecision = this.readNodeMetadata(node);
      caster ??= nodeDecision.caster ?? this.roleAllowsCasting(nodeDecision.role);
      receiver ??= nodeDecision.receiver ?? this.roleAllowsReceiving(nodeDecision.role);
      node = node.parent;
    }

    return { caster, receiver };
  }

  private readNodeMetadata(node: Node): ShadowMetadataDecision {
    const metadata = this.asRecord(node.metadata);
    const gltfMetadata = this.asRecord(metadata.gltf);
    const gltfExtras = this.asRecord(gltfMetadata.extras);
    const rawMetadata = this.asRecord(metadata.rawMetadata);

    return {
      caster:
        this.readOptionalBoolean(metadata.shadowCaster) ??
        this.readOptionalBoolean(metadata.gameShadowCaster) ??
        this.readOptionalBoolean(metadata.game_shadow_caster) ??
        this.readOptionalBoolean(gltfExtras.game_shadow_caster) ??
        this.readOptionalBoolean(gltfExtras.shadow_caster) ??
        this.readOptionalBoolean(rawMetadata.shadow_caster) ??
        this.readOptionalBoolean(rawMetadata.game_shadow_caster),
      receiver:
        this.readOptionalBoolean(metadata.shadowReceiver) ??
        this.readOptionalBoolean(metadata.gameShadowReceiver) ??
        this.readOptionalBoolean(metadata.game_shadow_receiver) ??
        this.readOptionalBoolean(gltfExtras.game_shadow_receiver) ??
        this.readOptionalBoolean(gltfExtras.shadow_receiver) ??
        this.readOptionalBoolean(rawMetadata.shadow_receiver) ??
        this.readOptionalBoolean(rawMetadata.game_shadow_receiver),
      role:
        this.readShadowRole(metadata.shadowRole) ??
        this.readShadowRole(metadata.gameShadowRole) ??
        this.readShadowRole(metadata.game_shadow_role) ??
        this.readShadowRole(gltfExtras.game_shadow_role) ??
        this.readShadowRole(gltfExtras.shadow_role) ??
        this.readShadowRole(rawMetadata.shadow_role) ??
        this.readShadowRole(rawMetadata.game_shadow_role)
    };
  }

  /** Определяет meshes, которые служат техническими helper/metadata carrier и не должны участвовать в тенях. */
  public isHelperOrMetadataMesh(mesh: AbstractMesh): boolean {
    const name = mesh.name.toLowerCase();
    const id = mesh.id.toLowerCase();
    const metadata = this.asRecord(mesh.metadata);
    const gltfMetadata = this.asRecord(metadata.gltf);
    const gltfExtras = this.asRecord(gltfMetadata.extras);
    const rawMetadata = this.asRecord(metadata.rawMetadata);
    const metadataSources = [metadata, gltfExtras, rawMetadata];

    if (name.includes("metadata") || id.includes("metadata")) {
      return true;
    }

    return metadataSources.some((source) =>
      source.gameHelper === true ||
      source.game_helper === true ||
      source.isMetadata === true ||
      source.metadata_carrier === true ||
      source.navigation_metadata === true ||
      source.hide_in_game === true ||
      source.game_hidden_at_runtime === true ||
      String(source.nav_kind ?? "").startsWith("stair_") ||
      source.nav_debug_kind === "stair_path_preview"
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

  private roleAllowsCasting(role: ShadowRole | undefined): boolean | undefined {
    return role === undefined ? undefined : role === "caster" || role === "both";
  }

  private roleAllowsReceiving(role: ShadowRole | undefined): boolean | undefined {
    return role === undefined ? undefined : role === "receiver" || role === "both";
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

    if (metadata.role === "receiver") {
      return false;
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

    if (metadata.role === "caster") {
      return false;
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
    if (
      mesh.isDisposed() ||
      (!mesh.isEnabled() && !this.isRuntimeFrustumCulled(mesh)) ||
      !mesh.isVisible ||
      mesh.getTotalVertices() <= 0
    ) {
      return false;
    }

    if (this.metadataReader.isHelperOrMetadataMesh(mesh)) {
      return false;
    }

    return true;
  }

  private isRuntimeFrustumCulled(mesh: AbstractMesh): boolean {
    let node: Node | null = mesh.parent;
    while (node) {
      const metadata = node.metadata as Record<string, unknown> | null | undefined;
      if (metadata?.[RUNTIME_FRUSTUM_CULLED_METADATA_KEY] === true) {
        return true;
      }
      node = node.parent;
    }

    return false;
  }
}
