import { Vitals } from "../entity/components/Vitals";

/**
 * Holds gameplay state values for a character instance.
 */
export class CharacterState {
  /** Health state of the character. */
  public hp: Vitals;

  /** Energy or stamina state of the character. */
  public energy: Vitals;

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
    hp: Vitals = new Vitals(),
    energy: Vitals = new Vitals(),
    carryCapacityWeight: number = 0
  ) {
    this.hp = hp;
    this.energy = energy;
    this.carryCapacityWeight = carryCapacityWeight;
  }
}
