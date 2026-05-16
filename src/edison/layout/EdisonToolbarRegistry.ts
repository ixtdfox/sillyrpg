export interface EdisonToolbarButton {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly order: number;
  readonly commandId: string;
}

export class EdisonToolbarRegistry {
  private readonly buttons = new Map<string, EdisonToolbarButton>();
  private readonly listeners = new Set<() => void>();

  public registerButton(button: EdisonToolbarButton): () => void {
    if (this.buttons.has(button.id)) {
      throw new Error(`Edison toolbar button '${button.id}' is already registered.`);
    }

    this.buttons.set(button.id, button);
    this.notifyChanged();
    return () => {
      this.buttons.delete(button.id);
      this.notifyChanged();
    };
  }

  public getButtons(): readonly EdisonToolbarButton[] {
    return [...this.buttons.values()].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  public onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.buttons.clear();
    this.listeners.clear();
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
