import type { AbstractMesh } from "@babylonjs/core";
import type { SceneLightingController } from "./SceneLightingController";
import { ShadowMeshPolicy, type ShadowMeshSource } from "./ShadowMeshPolicy";
import type { SceneLightingDescriptor } from "./LightingTypes";

export type { ShadowMeshSource } from "./ShadowMeshPolicy";

export interface ShadowMeshBatch {
  readonly ownerId: string;
  readonly source: ShadowMeshSource;
  readonly meshes: readonly AbstractMesh[];
}

export interface ShadowDiagnostics {
  readonly enabled: boolean;
  readonly hasGenerator: boolean;
  readonly generatorKind: "standard" | "cascaded" | "none";
  readonly casterCount: number;
  readonly receiverCount: number;
  readonly batches: readonly {
    readonly ownerId: string;
    readonly source: ShadowMeshSource;
    readonly totalMeshes: number;
    readonly casterMeshes: number;
    readonly receiverMeshes: number;
    readonly skippedMeshes: number;
  }[];
}

export class SceneShadowRegistry {
  private lighting: SceneLightingDescriptor | null = null;
  private readonly batchesByOwnerId = new Map<string, ShadowMeshBatch>();
  private readonly receiverMeshIds = new Set<number>();

  public constructor(
    private readonly lightingController: SceneLightingController,
    private readonly policy: ShadowMeshPolicy = new ShadowMeshPolicy()
  ) {}

  public setLighting(descriptor: SceneLightingDescriptor): void {
    this.lighting = descriptor;
    this.lightingController.apply(descriptor);
    this.synchronize();
  }

  public registerBatch(batch: ShadowMeshBatch): void {
    this.batchesByOwnerId.set(batch.ownerId, {
      ownerId: batch.ownerId,
      source: batch.source,
      meshes: [...batch.meshes]
    });
    this.synchronize();
  }

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

  public getDiagnostics(): ShadowDiagnostics {
    const lighting = this.lighting;
    const enabled = lighting?.shadows?.enabled === true;
    const hasGenerator = this.lightingController.hasShadows();
    let casterCount = 0;
    let receiverCount = 0;
    const batches: Array<ShadowDiagnostics["batches"][number]> = [];

    for (const batch of this.batchesByOwnerId.values()) {
      const context = lighting && enabled ? { lighting, source: batch.source } : null;
      let casterMeshes = 0;
      let receiverMeshes = 0;
      let skippedMeshes = 0;

      for (const mesh of batch.meshes) {
        const canCast = context ? this.policy.canCast(mesh, context) : false;
        const canReceive = context ? this.policy.canReceive(mesh, context) : false;
        if (canCast) {
          casterMeshes += 1;
        }
        if (canReceive) {
          receiverMeshes += 1;
        }
        if (!canCast && !canReceive) {
          skippedMeshes += 1;
        }
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
      batches
    };
  }

  public synchronize(): void {
    this.lightingController.clearShadowCasters();
    this.clearKnownReceivers();

    const lighting = this.lighting;
    if (!lighting || lighting.shadows?.enabled !== true || !this.lightingController.hasShadows()) {
      return;
    }

    for (const batch of this.batchesByOwnerId.values()) {
      const context = { lighting, source: batch.source };
      for (const mesh of batch.meshes) {
        if (this.policy.canCast(mesh, context)) {
          this.lightingController.addShadowCaster(mesh);
        }

        if (this.policy.canReceive(mesh, context)) {
          this.lightingController.setShadowReceiver(mesh, true);
          this.receiverMeshIds.add(mesh.uniqueId);
        } else if (!mesh.isDisposed()) {
          this.lightingController.setShadowReceiver(mesh, false);
        }
      }
    }
  }

  public dispose(): void {
    this.lightingController.clearShadowCasters();
    this.clearKnownReceivers();
    this.batchesByOwnerId.clear();
    this.lighting = null;
  }

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
}
