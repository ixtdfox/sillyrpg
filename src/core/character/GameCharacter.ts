import { Archetype } from "./Archetype";
import type { Character } from "./Character";
import { ControlComponent, ControlType } from "../entity/components/ControlComponent";
import { IdentityComponent } from "../entity/components/IdentityComponent";
import { Relations } from "../entity/components/Relations";
import { RelationsComponent } from "../entity/components/RelationsComponent";
import { VitalsComponent } from "../entity/components/VitalsComponent";
import { Entity } from "../entity/Entity";
import { TransformComponent } from "../entity/components/TransformComponent";
import { ModelComponent } from "../entity/components/ModelComponent";
import { SpawnComponent } from "../entity/components/SpawnComponent";
import type { ModelDefinition } from "../model/ModelDefinition";

export class GameCharacter extends Entity implements Character {
  private readonly model: ModelDefinition;
  private readonly archetype: Archetype;

  public constructor(
    name: string,
    model: ModelDefinition,
    controlType: ControlType,
    archetype: Archetype,
    vitals: VitalsComponent,
    transform: TransformComponent,
    spawn: SpawnComponent,
    relationships: Record<string, Relations> = {}
  ) {
    const id = GameCharacter.generateUuid();
    super(id);

    this.model = model;
    this.archetype = archetype;

    this.addComponent(IdentityComponent, new IdentityComponent(id, name));
    this.addComponent(ControlComponent, new ControlComponent(controlType));
    this.addComponent(RelationsComponent, new RelationsComponent(relationships));
    this.addComponent(VitalsComponent, vitals);
    this.addComponent(TransformComponent, transform);
    this.addComponent(ModelComponent, new ModelComponent(model));
    this.addComponent(SpawnComponent, spawn);
  }

  public getId(): string {
    return this.getIdentityComponent().id;
  }

  public getName(): string {
    return this.getIdentityComponent().name;
  }

  public getType(): ControlType {
    return this.getControlComponent().type;
  }

  public getRelationships(): Record<string, Relations> {
    return this.getRelationsComponent().relationships;
  }

  public getModel(): ModelDefinition {
    return this.model;
  }

  public getState(): VitalsComponent {
    return this.getVitalsComponent();
  }

  public getArchetype(): Archetype {
    return this.archetype;
  }

  private getIdentityComponent(): IdentityComponent {
    return this.getComponent(IdentityComponent);
  }

  private getControlComponent(): ControlComponent {
    return this.getComponent(ControlComponent);
  }

  private getRelationsComponent(): RelationsComponent {
    return this.getComponent(RelationsComponent);
  }

  private getVitalsComponent(): VitalsComponent {
    return this.getComponent(VitalsComponent);
  }

  private static generateUuid(): string {
    if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character: string) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;

      return value.toString(16);
    });
  }
}
