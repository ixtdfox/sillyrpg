import { Archetype } from "./Archetype";
import type { Character } from "./Character";
import { CharacterRelations } from "./CharacterRelations";
import { CharacterState } from "./CharacterState";
import { ControlType } from "./ControlType";

/**
 * Concrete implementation of the character domain entity.
 */
export class GameCharacter implements Character {
  /** Unique character identifier in UUID format. */
  private readonly id: string;

  /** Display name for UI and dialogs. */
  private readonly name: string;

  /** Path to the model asset used for rendering. */
  private readonly model: string;

  /** Indicates whether this character is player or NPC controlled. */
  private readonly controlType: ControlType;

  /** Archetype used by gameplay and template systems. */
  private readonly archetype: Archetype;

  /** Relations to other characters keyed by their id. */
  private readonly relationships: Record<string, CharacterRelations>;

  /** Mutable gameplay state for vitals and capacities. */
  private readonly playerState: CharacterState;

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
    relationships: Record<string, CharacterRelations> = {},
    playerState: CharacterState = new CharacterState()
  ) {
    this.id = GameCharacter.generateUuid();
    this.name = name;
    this.model = model;
    this.controlType = controlType;
    this.archetype = archetype;
    this.relationships = relationships;
    this.playerState = playerState;
  }

  /**
   * Returns the UUID identifier.
   *
   * @returns Character id.
   */
  public getId(): string {
    return this.id;
  }

  /**
   * Returns the display name.
   *
   * @returns Character name.
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Returns who controls this character.
   *
   * @returns Control type.
   */
  public getType(): ControlType {
    return this.controlType;
  }

  /**
   * Returns relationships map.
   *
   * @returns Relationship object map.
   */
  public getRelationships(): Record<string, CharacterRelations> {
    return this.relationships;
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
  public getPlayerState(): CharacterState {
    return this.playerState;
  }

  /**
   * Returns the configured archetype.
   *
   * @returns Character archetype.
   */
  public getArchetype(): Archetype {
    return this.archetype;
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
