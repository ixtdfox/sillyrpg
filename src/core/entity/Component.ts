/**
 * Marker interface for ECS components.
 */
export interface Component {}

/**
 * Constructor signature used to identify component types at runtime.
 */
export type ComponentCtor<T extends Component> = new (...args: never[]) => T;
