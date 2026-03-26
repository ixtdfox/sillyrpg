import { AbstractMesh, type Scene as BabylonScene, type Vector3 } from "@babylonjs/core";
import type { Entity } from "../../entity/Entity";
import type { EntityManager } from "../../entity/EntityManager";
import { LocalPlayerComponent } from "../../entity/components/LocalPlayerComponent";
import { RenderableComponent } from "../../entity/components/RenderableComponent";
import { TransformComponent } from "../../entity/components/TransformComponent";
import type { LocationManager } from "../../world/location/LocationManager";
import { TriggerDispatcher } from "./TriggerDispatcher";
import { TriggerRegistry } from "./TriggerRegistry";

/**
 * Runtime gameplay system for trigger discovery, overlap checks and dispatch.
 */
export class LocationTriggerSystem {
  private readonly scene: BabylonScene;
  private readonly entityManager: EntityManager;
  private readonly locationManager: LocationManager;
  private readonly triggerRegistry: TriggerRegistry;
  private readonly triggerDispatcher: TriggerDispatcher;
  private isTransitioning: boolean;

  public constructor(scene: BabylonScene, entityManager: EntityManager, locationManager: LocationManager) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.locationManager = locationManager;
    this.triggerRegistry = new TriggerRegistry();
    this.triggerDispatcher = new TriggerDispatcher();
    this.isTransitioning = false;
  }

  public initialize(): void {
    this.refreshTriggers();
  }

  public update(): void {
    if (this.isTransitioning) {
      return;
    }

    const localPlayer = this.resolveLocalPlayerEntity();
    if (!localPlayer) {
      return;
    }

    const playerPosition = localPlayer.getComponent(TransformComponent).value;
    const playerMeshes = this.resolvePlayerMeshes(localPlayer);
    const positionText = `(${playerPosition.x.toFixed(2)}, ${playerPosition.y.toFixed(2)}, ${playerPosition.z.toFixed(2)})`;
    console.debug(
      `[LocationTriggerSystem] Trigger check playerPosition=${positionText} playerMeshes=${playerMeshes.length}.`
    );

    for (const trigger of this.triggerRegistry.getTriggers()) {
      const overlap = this.testTriggerOverlap(trigger.mesh, playerPosition, playerMeshes);
      console.debug(
        `[LocationTriggerSystem] Overlap trigger='${trigger.mesh.name}' id='${trigger.mesh.id}' success=${overlap}.`
      );

      if (!overlap) {
        continue;
      }

      this.isTransitioning = true;
      console.debug(
        `[LocationTriggerSystem] Dispatch start kind='${trigger.metadata.kind}' type='${trigger.metadata.triggerType}'.`
      );
      void this.triggerDispatcher
        .dispatch(trigger, {
          scene: this.scene,
          localPlayer,
          locationManager: this.locationManager,
          refreshTriggers: () => this.refreshTriggers()
        })
        .catch((error: unknown) => {
          console.error("[LocationTriggerSystem] Scene transition failed.", error);
        })
        .finally(() => {
          this.isTransitioning = false;
        });
      break;
    }
  }

  public dispose(): void {
    this.triggerRegistry.clear();
  }

  private refreshTriggers(): void {
    this.triggerRegistry.registerFromNodes(this.locationManager.getActiveDistrictNodes());
  }

  private resolveLocalPlayerEntity(): Entity | null {
    const candidates = this.entityManager.query(LocalPlayerComponent, TransformComponent);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      throw new Error(`LocationTriggerSystem requires exactly one local player, found ${candidates.length}.`);
    }

    return candidates[0];
  }

  private resolvePlayerMeshes(localPlayer: Entity): AbstractMesh[] {
    if (!localPlayer.hasComponent(RenderableComponent)) {
      return [];
    }

    const renderable = localPlayer.getComponent(RenderableComponent);
    const renderBinding = renderable.binding as unknown;
    const meshes: AbstractMesh[] = [];
    const seenIds = new Set<number>();
    const bindingAsMesh = renderBinding as AbstractMesh;

    if (bindingAsMesh instanceof AbstractMesh) {
      meshes.push(bindingAsMesh);
      seenIds.add(bindingAsMesh.uniqueId);
    }

    const meshCapableNode = renderBinding as { getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[] };
    if (typeof meshCapableNode.getChildMeshes === "function") {
      for (const childMesh of meshCapableNode.getChildMeshes(false)) {
        if (seenIds.has(childMesh.uniqueId)) {
          continue;
        }

        meshes.push(childMesh);
        seenIds.add(childMesh.uniqueId);
      }
    }

    return meshes.filter((mesh) => !mesh.isDisposed());
  }

  private testTriggerOverlap(triggerMesh: AbstractMesh, playerPosition: Vector3, playerMeshes: readonly AbstractMesh[]): boolean {
    triggerMesh.computeWorldMatrix(true);

    for (const playerMesh of playerMeshes) {
      playerMesh.computeWorldMatrix(true);
      if (playerMesh.intersectsMesh(triggerMesh, false)) {
        return true;
      }
    }

    const bounds = triggerMesh.getBoundingInfo().boundingBox;
    const min = bounds.minimumWorld;
    const max = bounds.maximumWorld;
    const containsPosition =
      playerPosition.x >= min.x &&
      playerPosition.x <= max.x &&
      playerPosition.y >= min.y &&
      playerPosition.y <= max.y &&
      playerPosition.z >= min.z &&
      playerPosition.z <= max.z;

    if (containsPosition) {
      return true;
    }

    return triggerMesh.intersectsPoint(playerPosition);
  }
}
