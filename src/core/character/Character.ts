import { Relations } from "../entity/components/Relations";
import { CharacterState } from "./CharacterState";
import { ControlType } from "./ControlType";

/**
 * Defines the public contract for character objects.
 */
export interface Character {
  /**
   * Returns the character identifier.
   *
   * @returns Unique character identifier.
   */
  getId(): string;

  /**
   * Returns the character display name.
   *
   * @returns Character name.
   */
  getName(): string;

  /**
   * Returns the control ownership type.
   *
   * @returns Control type value.
   */
  getType(): ControlType;

  /**
   * Returns relationships keyed by target character id.
   *
   * @returns Relationship map.
   */
  getRelationships(): Record<string, Relations>;

  /**
   * Returns the 3D model path.
   *
   * @returns Asset path for character model.
   */
  getModel(): string;

  /**
   * Returns gameplay state for this character.
   *
   * @returns Character gameplay state.
   */
  getState(): CharacterState;
}
