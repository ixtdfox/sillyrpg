export type EdisonEventListener<TPayload> = (payload: TPayload) => void;

export class EdisonEventBus {
  private readonly listeners = new Map<string, Set<EdisonEventListener<unknown>>>();

  public on<TPayload>(eventName: string, listener: EdisonEventListener<TPayload>): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set<EdisonEventListener<unknown>>();
    listeners.add(listener as EdisonEventListener<unknown>);
    this.listeners.set(eventName, listeners);

    return () => {
      listeners.delete(listener as EdisonEventListener<unknown>);
      if (listeners.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  public emit<TPayload>(eventName: string, payload: TPayload): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(payload);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
