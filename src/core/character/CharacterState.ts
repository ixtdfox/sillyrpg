import { VitalsState } from "./VitalsState";

/**
 * Holds gameplay state values for a character instance.
 */
export class CharacterState {
  /** Health state of the character. */
  public hp: VitalsState;

  /** Energy or stamina state of the character. */
  public energy: VitalsState;

  /** Maximum carry weight for inventory systems. */
  public carryCapacityWeight: number;

  /**
   * Creates a default character state.
   *
   * @param hp - Optional health vitals.
   * @param energy - Optional energy vitals.
   * @param carryCapacityWeight - Optional carry weight capacity.
   */
  public constructor(
    hp: VitalsState = new VitalsState(),
    energy: VitalsState = new VitalsState(),
    carryCapacityWeight: number = 0
  ) {
    this.hp = hp;
    this.energy = energy;
    this.carryCapacityWeight = carryCapacityWeight;
  }
}
