import { InstancedMesh, type AbstractMesh } from "@babylonjs/core";
import type { SceneLightingController } from "./SceneLightingController";
import { ShadowMeshPolicy, type ShadowMeshSource } from "./ShadowMeshPolicy";
import type { SceneLightingDescriptor } from "./LightingTypes";
import { parseBuildingVisibilityMesh } from "../scene/visibility/BuildingVisibilityMetadata";

export type { ShadowMeshSource } from "./ShadowMeshPolicy";

/** Batch meshes от одного владельца сцены, например terrain, object или character entity. */
export interface ShadowMeshBatch {
  readonly ownerId: string;
  readonly source: ShadowMeshSource;
  readonly meshes: readonly AbstractMesh[];
}

/** Snapshot состояния shadow-системы для diagnostics UI, логов и тестов. */
export interface ShadowDiagnostics {
  readonly enabled: boolean;
  readonly hasGenerator: boolean;
  readonly generatorKind: "standard" | "cascaded" | "none";
  readonly casterCount: number;
  readonly receiverCount: number;
  readonly buildingRoles: readonly {
    readonly buildingId: string;
    readonly visibilityRole: string;
    readonly lodRole: string;
    readonly totalMeshes: number;
    readonly casterMeshes: number;
    readonly receiverMeshes: number;
  }[];
  readonly batches: readonly {
    readonly ownerId: string;
    readonly source: ShadowMeshSource;
    readonly totalMeshes: number;
    readonly casterMeshes: number;
    readonly receiverMeshes: number;
    readonly skippedMeshes: number;
  }[];
}

/**
 * Registry/Coordinator для синхронизации shadow casters и receivers.
 *
 * Registry хранит batches meshes по владельцам, применяет `ShadowMeshPolicy` и
 * через `SceneLightingController` приводит Babylon-сцену к текущему lighting
 * descriptor'у. Это отделяет правила выбора meshes от lifecycle освещения.
 */
export class SceneShadowRegistry {
  private lighting: SceneLightingDescriptor | null = null;
  private readonly batchesByOwnerId = new Map<string, ShadowMeshBatch>();
  private readonly casterMeshIds = new Set<number>();
  private readonly receiverMeshIds = new Set<number>();

  public constructor(
    private readonly lightingController: SceneLightingController,
    private readonly policy: ShadowMeshPolicy = new ShadowMeshPolicy()
  ) {}

  /** Применяет новый lighting descriptor и сразу пересинхронизирует все известные batches. */
  public setLighting(descriptor: SceneLightingDescriptor): void {
    this.lighting = descriptor;
    this.lightingController.apply(descriptor);
    this.synchronize();
  }

  /** Регистрирует или заменяет batch одного владельца и пересобирает shadow state. */
  public registerBatch(batch: ShadowMeshBatch): void {
    this.batchesByOwnerId.set(batch.ownerId, {
      ownerId: batch.ownerId,
      source: batch.source,
      meshes: [...batch.meshes]
    });
    this.synchronize();
  }

  /** Регистрирует несколько batches одной операцией, чтобы синхронизация прошла один раз. */
  public registerBatches(batches: readonly ShadowMeshBatch[]): void {
    for (const batch of batches) {
      this.batchesByOwnerId.set(batch.ownerId, {
        ownerId: batch.ownerId,
        source: batch.source,
        meshes: [...batch.meshes]
      });
    }

    this.synchronize();
  }

  /**
   * Полностью заменяет набор batches.
   *
   * Перед заменой registry снимает receiver-флаги с прежних meshes, чтобы удаленные
   * из сцены объекты не оставались в визуально устаревшем состоянии.
   */
  public replaceBatches(batches: readonly ShadowMeshBatch[]): void {
    this.clearKnownReceivers();
    this.batchesByOwnerId.clear();
    for (const batch of batches) {
      this.batchesByOwnerId.set(batch.ownerId, {
        ownerId: batch.ownerId,
        source: batch.source,
        meshes: [...batch.meshes]
      });
    }

    this.synchronize();
  }

  /** Удаляет владельца из registry и очищает receiver-флаги на его meshes. */
  public unregisterOwner(ownerId: string): void {
    const batch = this.batchesByOwnerId.get(ownerId);
    if (batch) {
      for (const mesh of batch.meshes) {
        if (!mesh.isDisposed()) {
          this.lightingController.setShadowReceiver(mesh, false);
        }
        this.receiverMeshIds.delete(mesh.uniqueId);
      }
    }

    this.batchesByOwnerId.delete(ownerId);
    this.synchronize();
  }

  /** Собирает диагностический отчет по текущим batches без изменения состояния сцены. */
  public getDiagnostics(): ShadowDiagnostics {
    const lighting = this.lighting;
    const enabled = lighting?.shadows?.enabled === true;
    const hasGenerator = this.lightingController.hasShadows();
    let casterCount = 0;
    let receiverCount = 0;
    const batches: Array<ShadowDiagnostics["batches"][number]> = [];
    const buildingRoles = new Map<string, ShadowBuildingRoleAccumulator>();

    for (const batch of this.batchesByOwnerId.values()) {
      const context = lighting && enabled ? { lighting, source: batch.source } : null;
      let casterMeshes = 0;
      let receiverMeshes = 0;
      let skippedMeshes = 0;

      for (const mesh of batch.meshes) {
        const canCast = context ? this.casterMeshIds.has(mesh.uniqueId) : false;
        const canReceive = context ? this.receiverMeshIds.has(mesh.uniqueId) : false;
        if (canCast) {
          casterMeshes += 1;
        }
        if (canReceive) {
          receiverMeshes += 1;
        }
        if (!canCast && !canReceive) {
          skippedMeshes += 1;
        }
        this.addBuildingRoleDiagnostics(buildingRoles, mesh, canCast, canReceive);
      }

      casterCount += casterMeshes;
      receiverCount += receiverMeshes;
      batches.push({
        ownerId: batch.ownerId,
        source: batch.source,
        totalMeshes: batch.meshes.length,
        casterMeshes,
        receiverMeshes,
        skippedMeshes
      });
    }

    return {
      enabled,
      hasGenerator,
      generatorKind: this.lightingController.getShadowGeneratorKind(),
      casterCount,
      receiverCount,
      buildingRoles: [...buildingRoles.values()].sort((left, right) => {
        const buildingOrder = left.buildingId.localeCompare(right.buildingId);
        return buildingOrder !== 0 ? buildingOrder : left.lodRole.localeCompare(right.lodRole);
      }),
      batches
    };
  }

  /**
   * Пересобирает caster render list и receiver-флаги по текущей policy.
   *
   * Метод всегда начинается с очистки старого состояния, потому что lighting
   * descriptor, batches и metadata meshes могут меняться независимо друг от друга.
   */
  public synchronize(): void {
    this.lightingController.clearShadowCasters();
    this.casterMeshIds.clear();
    this.clearKnownReceivers();

    const lighting = this.lighting;
    if (!lighting || lighting.shadows?.enabled !== true || !this.lightingController.hasShadows()) {
      return;
    }

    const sharedReceiverStates = new Map<AbstractMesh, boolean>();
    for (const batch of this.batchesByOwnerId.values()) {
      const context = { lighting, source: batch.source };
      for (const mesh of batch.meshes) {
        if (this.policy.canCast(mesh, context)) {
          this.lightingController.addShadowCaster(mesh);
          this.casterMeshIds.add(mesh.uniqueId);
        }

        const canReceive = this.policy.canReceive(mesh, context);
        if (canReceive) {
          this.receiverMeshIds.add(mesh.uniqueId);
        }

        if (mesh instanceof InstancedMesh) {
          sharedReceiverStates.set(
            mesh.sourceMesh,
            (sharedReceiverStates.get(mesh.sourceMesh) ?? false) || canReceive
          );
        } else if (!mesh.isDisposed()) {
          this.lightingController.setShadowReceiver(mesh, canReceive);
        }
      }
    }
    for (const [sourceMesh, receive] of sharedReceiverStates) {
      this.lightingController.setShadowReceiver(sourceMesh, receive);
    }

    this.lightingController.refreshShadowCasterBounds();
  }

  /** Очищает runtime shadow state и забывает все batches, не уничтожая сам controller. */
  public dispose(): void {
    this.lightingController.clearShadowCasters();
    this.casterMeshIds.clear();
    this.clearKnownReceivers();
    this.batchesByOwnerId.clear();
    this.lighting = null;
  }

  /** Снимает `receiveShadows` только с meshes, которые registry ранее пометил receiver'ами. */
  private clearKnownReceivers(): void {
    for (const batch of this.batchesByOwnerId.values()) {
      for (const mesh of batch.meshes) {
        if (this.receiverMeshIds.has(mesh.uniqueId) && !mesh.isDisposed()) {
          this.lightingController.setShadowReceiver(mesh, false);
        }
      }
    }

    this.receiverMeshIds.clear();
  }

  private addBuildingRoleDiagnostics(
    groups: Map<string, ShadowBuildingRoleAccumulator>,
    mesh: AbstractMesh,
    isCaster: boolean,
    isReceiver: boolean
  ): void {
    const building = parseBuildingVisibilityMesh(mesh);
    if (!building) {
      return;
    }

    const rawMetadata = building.rawMetadata;
    if (rawMetadata?.sceneObjectType !== "building" && rawMetadata?.buildingVisibilityInstanceId === undefined) {
      return;
    }

    const visibilityRole = building.role;
    const lodRole = building.lodRole ?? "none";
    const key = `${building.buildingId}|${visibilityRole}|${lodRole}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        buildingId: building.buildingId,
        visibilityRole,
        lodRole,
        totalMeshes: 0,
        casterMeshes: 0,
        receiverMeshes: 0
      };
      groups.set(key, group);
    }

    group.totalMeshes += 1;
    group.casterMeshes += isCaster ? 1 : 0;
    group.receiverMeshes += isReceiver ? 1 : 0;
  }
}

interface ShadowBuildingRoleAccumulator {
  buildingId: string;
  visibilityRole: string;
  lodRole: string;
  totalMeshes: number;
  casterMeshes: number;
  receiverMeshes: number;
}
