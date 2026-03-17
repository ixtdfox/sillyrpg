import { Relations } from "../entity/components/Relations";
import { ControlType } from "../entity/components/ControlComponent";
import { VitalsComponent } from "../entity/components/VitalsComponent";
import type { ModelDefinition } from "../model/ModelDefinition";

/**
 * Defines the public contract for character objects.
 */
export interface Character {
  getId(): string;
  getName(): string;
  getType(): ControlType;
  getRelationships(): Record<string, Relations>;

  /** Returns the visual model definition. */
  getModel(): ModelDefinition;

  getState(): VitalsComponent;
}
