import { Archetype } from "./Archetype";
import type { Character } from "./Character";
import { ControlComponent } from "../entity/components/ControlComponent";
import { IdentityComponent } from "../entity/components/IdentityComponent";
import { Relations } from "../entity/components/Relations";
import { RelationsComponent } from "../entity/components/RelationsComponent";
import { VitalsComponent } from "../entity/components/VitalsComponent";
import { Entity } from "../entity/Entity";
import { CharacterState } from "./CharacterState";
import { ControlType } from "./ControlType";

/**
 * Concrete implementation of the character domain entity.
 */
export class GameCharacter extends Entity implements Character {

  /** Path to the model asset used for rendering. */
  private readonly model: string;

  /** Archetype used by gameplay and template systems. */
  private readonly archetype: Archetype;

  /** Mutable gameplay state view backed by vitals component. */
  private readonly state: CharacterState;

  /**
   * Creates a character with explicit dependencies and defaults.
   *
   * @param name - Character display name.
   * @param model - Model path for rendering.
   * @param controlType - Controller type for this character.
   * @param archetype - Character archetype.
   * @param relationships - Optional initial relationship map.
   * @param playerState - Optional initial gameplay state.
   */
  public constructor(
    name: string,
    model: string,
    controlType: ControlType,
    archetype: Archetype,
    relationships: Record<string, Relations> = {},
    state: CharacterState = new CharacterState()
  ) {
    const id = GameCharacter.generateUuid();

    super(id);

    this.model = model;
    this.archetype = archetype;

    this.addComponent(IdentityComponent, new IdentityComponent(id, name));
    this.addComponent(ControlComponent, new ControlComponent(controlType));
    this.addComponent(RelationsComponent, new RelationsComponent(relationships));

    const vitalsComponent = new VitalsComponent(state.hp, state.energy, state.carryCapacityWeight);
    this.addComponent(VitalsComponent, vitalsComponent);

    this.state = new CharacterState(vitalsComponent.hp, vitalsComponent.energy, vitalsComponent.carryCapacityWeight);
    Object.defineProperties(this.state, {
      hp: {
        configurable: true,
        enumerable: true,
        get: () => vitalsComponent.hp,
        set: (value) => {
          vitalsComponent.hp = value;
        }
      },
      energy: {
        configurable: true,
        enumerable: true,
        get: () => vitalsComponent.energy,
        set: (value) => {
          vitalsComponent.energy = value;
        }
      },
      carryCapacityWeight: {
        configurable: true,
        enumerable: true,
        get: () => vitalsComponent.carryCapacityWeight,
        set: (value) => {
          vitalsComponent.carryCapacityWeight = value;
        }
      }
    });
  }

  /**
   * Returns the UUID identifier.
   *
   * @returns Character id.
   */
  public getId(): string {
    return this.getIdentityComponent().id;
  }

  /**
   * Returns the display name.
   *
   * @returns Character name.
   */
  public getName(): string {
    return this.getIdentityComponent().name;
  }

  /**
   * Returns who controls this character.
   *
   * @returns Control type.
   */
  public getType(): ControlType {
    return this.getControlComponent().type;
  }

  /**
   * Returns relationships map.
   *
   * @returns Relationship object map.
   */
  public getRelationships(): Record<string, Relations> {
    return this.getRelationsComponent().relationships;
  }

  /**
   * Returns the model path.
   *
   * @returns Model asset path.
   */
  public getModel(): string {
    return this.model;
  }

  /**
   * Returns gameplay state.
   *
   * @returns Player state data.
   */
  public getState(): CharacterState {
    return this.state;
  }

  /**
   * Returns the configured archetype.
   *
   * @returns Character archetype.
   */
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

  /**
   * Creates a UUID for each character instance.
   *
   * @returns RFC4122-like UUID string.
   */
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
