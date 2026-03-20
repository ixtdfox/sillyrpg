import { Color3, HighlightLayer, Scene as BabylonScene, AbstractMesh, Mesh } from "@babylonjs/core";
import type { EntityManager } from "../../EntityManager";
import type { System } from "../../System";
import { RenderableComponent } from "../../components/RenderableComponent";
import { TurnBasedCombatState } from "../../../game/TurnBasedCombatState";
import { WorldModeController } from "../../../game/WorldModeController";

/**
 * Applies red highlight to currently hovered hostile combat target mesh.
 */
export class CombatHoverHighlightSystem implements System {
  private static readonly HOVER_HOSTILE_COLOR = new Color3(0.95, 0.18, 0.16);

  private readonly entityManager: EntityManager;
  private readonly worldModeController: WorldModeController;
  private readonly combatState: TurnBasedCombatState;
  private scene: BabylonScene | null;
  private highlightLayer: HighlightLayer | null;
  private highlightedEntityId: string | null;
  private highlightedMeshes: Mesh[];

  public constructor(
    entityManager: EntityManager,
    worldModeController: WorldModeController,
    combatState: TurnBasedCombatState
  ) {
    this.entityManager = entityManager;
    this.worldModeController = worldModeController;
    this.combatState = combatState;
    this.scene = null;
    this.highlightLayer = null;
    this.highlightedEntityId = null;
    this.highlightedMeshes = [];
  }

  public setScene(scene: BabylonScene | null): void {
    this.clearHighlight();
    this.highlightLayer?.dispose();

    this.scene = scene;
    this.highlightLayer = scene ? new HighlightLayer("combat-hover-highlight-layer", scene) : null;
  }

  public update(_deltaSeconds: number): void {
    if (!this.worldModeController.isTurnBased() || !this.combatState.isActive()) {
      this.clearHighlight();
      return;
    }

    const hoveredEntityId = this.combatState.getHoveredHostileEntityId();
    if (!hoveredEntityId) {
      this.clearHighlight();
      return;
    }

    if (this.highlightedEntityId === hoveredEntityId && this.isCurrentHighlightValid()) {
      return;
    }

    this.clearHighlight();
    this.applyHighlightForEntity(hoveredEntityId);
  }

  private applyHighlightForEntity(entityId: string): void {
    const highlightLayer = this.highlightLayer;
    if (!highlightLayer) {
      return;
    }

    const entity = this.entityManager.getEntity(entityId);
    const renderable = entity?.tryGetComponent(RenderableComponent);
    if (!renderable) {
      return;
    }

    const meshes = this.resolveEntityMeshes(renderable);
    if (meshes.length === 0) {
      return;
    }

    for (const mesh of meshes) {
      highlightLayer.addMesh(mesh, CombatHoverHighlightSystem.HOVER_HOSTILE_COLOR);
    }

    this.highlightedEntityId = entityId;
    this.highlightedMeshes = meshes;
  }

  private resolveEntityMeshes(renderable: RenderableComponent): Mesh[] {
    const binding = renderable.binding as unknown as {
      getChildMeshes?: () => AbstractMesh[];
    };

    const childMeshes = binding.getChildMeshes?.() ?? [];
    const uniqueMeshes = new Set<Mesh>(childMeshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh));

    if (renderable.binding instanceof Mesh) {
      uniqueMeshes.add(renderable.binding);
    }

    return Array.from(uniqueMeshes);
  }

  private clearHighlight(): void {
    if (!this.highlightLayer || this.highlightedMeshes.length === 0) {
      this.highlightedEntityId = null;
      this.highlightedMeshes = [];
      return;
    }

    for (const mesh of this.highlightedMeshes) {
      if (!mesh.isDisposed()) {
        this.highlightLayer.removeMesh(mesh);
      }
    }

    this.highlightedEntityId = null;
    this.highlightedMeshes = [];
  }

  private isCurrentHighlightValid(): boolean {
    if (!this.highlightedEntityId || this.highlightedMeshes.length === 0) {
      return false;
    }

    const entity = this.entityManager.getEntity(this.highlightedEntityId);
    const renderable = entity?.tryGetComponent(RenderableComponent);
    if (!renderable) {
      return false;
    }

    const currentMeshes = this.resolveEntityMeshes(renderable);
    if (currentMeshes.length === 0) {
      return false;
    }

    if (currentMeshes.length !== this.highlightedMeshes.length) {
      return false;
    }

    const currentSet = new Set(currentMeshes);
    for (const mesh of this.highlightedMeshes) {
      if (mesh.isDisposed() || !currentSet.has(mesh)) {
        return false;
      }
    }

    return true;
  }
}
