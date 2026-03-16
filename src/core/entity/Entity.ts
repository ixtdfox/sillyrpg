import type { Component, ComponentCtor } from "./Component";
import { ComponentStore } from "./ComponentStore";

/**
 * Base entity class with id and component storage.
 */
export class Entity {
  protected readonly id: string;
  protected readonly components: ComponentStore;

  public constructor(id: string) {
    this.id = id;
    this.components = new ComponentStore();
  }

  public getId(): string {
    return this.id;
  }

  public getComponent<T extends Component>(ctor: ComponentCtor<T>): T {
    return this.components.get(ctor);
  }

  public tryGetComponent<T extends Component>(ctor: ComponentCtor<T>): T | null {
    return this.components.tryGet(ctor);
  }

  public hasComponent<T extends Component>(ctor: ComponentCtor<T>): boolean {
    return this.components.has(ctor);
  }

  public addComponent<T extends Component>(ctor: ComponentCtor<T>, component: T): void {
    this.components.add(ctor, component);
  }

  public removeComponent<T extends Component>(ctor: ComponentCtor<T>): void {
    this.components.remove(ctor);
  }
}
