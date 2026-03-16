import type { Component } from "../Component";
import type { Vitals } from "./Vitals";

/**
 * Stores character vitals and carry capacity.
 */
export class VitalsComponent implements Component {
  /** Health state values. */
  public hp: Vitals;

  /** Energy or stamina state values. */
  public energy: Vitals;

  /** Maximum carry weight. */
  public carryCapacityWeight: number;

  /**
   * Creates a vitals component.
   *
   * @param hp - Health state values.
   * @param energy - Energy state values.
   * @param carryCapacityWeight - Max carry capacity by weight.
   */
  public constructor(hp: Vitals, energy: Vitals, carryCapacityWeight: number) {
    this.hp = hp;
    this.energy = energy;
    this.carryCapacityWeight = carryCapacityWeight;
  }
}
