import type { Component, ComponentCtor } from "./Component";

/**
 * Stores components keyed by their constructor type.
 */
export class ComponentStore {
  private readonly components: Map<ComponentCtor<Component>, Component>;

  public constructor() {
    this.components = new Map<ComponentCtor<Component>, Component>();
  }

  public add<T extends Component>(ctor: ComponentCtor<T>, component: T): void {
    this.components.set(ctor, component);
  }

  public get<T extends Component>(ctor: ComponentCtor<T>): T {
    const component = this.tryGet(ctor);

    if (component === null) {
      throw new Error(`Missing component: ${ctor.name}`);
    }

    return component;
  }

  public tryGet<T extends Component>(ctor: ComponentCtor<T>): T | null {
    const component = this.components.get(ctor);
    return (component as T | undefined) ?? null;
  }

  public has<T extends Component>(ctor: ComponentCtor<T>): boolean {
    return this.components.has(ctor);
  }

  public remove<T extends Component>(ctor: ComponentCtor<T>): void {
    this.components.delete(ctor);
  }
}
