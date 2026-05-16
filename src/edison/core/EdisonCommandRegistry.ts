export interface EdisonCommand {
  readonly id: string;
  readonly title: string;
  readonly execute: () => void | Promise<void>;
  readonly isEnabled?: () => boolean;
}

export class EdisonCommandRegistry {
  private readonly commands = new Map<string, EdisonCommand>();
  private readonly listeners = new Set<() => void>();

  public register(command: EdisonCommand): () => void {
    if (this.commands.has(command.id)) {
      throw new Error(`Edison command '${command.id}' is already registered.`);
    }

    this.commands.set(command.id, command);
    this.notifyChanged();

    return () => {
      this.commands.delete(command.id);
      this.notifyChanged();
    };
  }

  public getCommand(commandId: string): EdisonCommand | null {
    return this.commands.get(commandId) ?? null;
  }

  public getCommands(): readonly EdisonCommand[] {
    return [...this.commands.values()].sort((left, right) => left.title.localeCompare(right.title));
  }

  public canExecute(commandId: string): boolean {
    const command = this.commands.get(commandId);
    return command ? (command.isEnabled?.() ?? true) : false;
  }

  public async execute(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) {
      throw new Error(`Edison command '${commandId}' is not registered.`);
    }

    if (command.isEnabled && !command.isEnabled()) {
      return;
    }

    await command.execute();
    this.notifyChanged();
  }

  public onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.commands.clear();
    this.listeners.clear();
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
