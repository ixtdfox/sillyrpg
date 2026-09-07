import type {
  AbstractMesh,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator
} from "@babylonjs/core";
import { CascadedShadowGenerator } from "@babylonjs/core";
import type { ShadowGeneratorKind } from "./LightingTypes";

export type SceneShadowGenerator = ShadowGenerator | CascadedShadowGenerator;

/**
 * Runtime-агрегат всех Babylon-ресурсов освещения одной сцены.
 *
 * Rig владеет ambient light, sun light и shadow generator как единым жизненным
 * циклом: factory создает эти ресурсы, controller применяет rig к сцене, а сам
 * rig отвечает за регистрацию shadow casters и корректный dispose.
 */
export class LightingRig {
  private readonly shadowCasterIds: Set<number>;

  public constructor(
    private readonly ambientLight: HemisphericLight | null,
    private readonly sunLight: DirectionalLight | null,
    private readonly shadowGenerator: SceneShadowGenerator | null
  ) {
    this.shadowCasterIds = new Set();
  }

  /** Возвращает hemispheric light или `null`, если ambient-свет отключен descriptor'ом. */
  public getAmbientLight(): HemisphericLight | null {
    return this.ambientLight;
  }

  /** Возвращает directional sun light или `null`, если солнце отключено descriptor'ом. */
  public getSunLight(): DirectionalLight | null {
    return this.sunLight;
  }

  /** Возвращает активный Babylon shadow generator, если тени реально созданы. */
  public getShadowGenerator(): SceneShadowGenerator | null {
    return this.shadowGenerator;
  }

  /** Быстрый доменный флаг для controller/registry: есть ли у текущего rig рабочие тени. */
  public hasShadows(): boolean {
    return this.shadowGenerator !== null;
  }

  /** Нормализует runtime-класс Babylon generator'а в доменный enum для диагностики UI. */
  public getShadowGeneratorKind(): ShadowGeneratorKind | "none" {
    if (!this.shadowGenerator) {
      return "none";
    }

    return this.shadowGenerator instanceof CascadedShadowGenerator ? "cascaded" : "standard";
  }

  /** Возвращает количество уникальных meshes, зарегистрированных как shadow casters. */
  public getShadowCasterCount(): number {
    return this.shadowCasterIds.size;
  }

  /**
   * Очищает render list shadow generator'а и локальный индекс uniqueId.
   *
   * Индекс нужен, чтобы повторная синхронизация registry не добавляла один и тот
   * же mesh несколько раз в Babylon render list.
   */
  public clearShadowCasters(): void {
    if (!this.shadowGenerator) {
      return;
    }

    const shadowCasterMeshes = [...(this.shadowGenerator.getShadowMap()?.renderList ?? [])];
    for (const mesh of shadowCasterMeshes) {
      this.shadowGenerator.removeShadowCaster(mesh, false);
    }

    this.shadowCasterIds.clear();
  }

  /** Регистрирует один mesh как caster, если shadow generator существует и mesh еще не был добавлен. */
  public registerShadowCaster(mesh: AbstractMesh): void {
    if (!this.shadowGenerator || this.shadowCasterIds.has(mesh.uniqueId)) {
      return;
    }

    this.shadowGenerator.addShadowCaster(mesh, false);
    this.shadowCasterIds.add(mesh.uniqueId);
  }

  /** Batch-обертка над `registerShadowCaster`, чтобы registry не знал о деталях индексации rig. */
  public registerShadowCasters(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      this.registerShadowCaster(mesh);
    }
  }

  /** Recomputes frozen CSM bounds after the registry changes the caster render list. */
  public refreshShadowCasterBounds(): void {
    if (
      !(this.shadowGenerator instanceof CascadedShadowGenerator) ||
      !this.shadowGenerator.freezeShadowCastersBoundingInfo
    ) {
      return;
    }

    this.shadowGenerator.freezeShadowCastersBoundingInfo = false;
    this.shadowGenerator.freezeShadowCastersBoundingInfo = true;
  }

  /** Освобождает все Babylon-ресурсы, которыми владеет rig. */
  public dispose(): void {
    this.clearShadowCasters();
    this.shadowGenerator?.dispose();
    this.ambientLight?.dispose();
    this.sunLight?.dispose();
  }
}
