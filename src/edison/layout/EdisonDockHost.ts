import type { EdisonPanelSlot } from "./EdisonWindowTypes";

export class EdisonDockHost {
  private readonly hosts = new Map<EdisonPanelSlot, HTMLElement>();

  public setHost(slot: EdisonPanelSlot, host: HTMLElement): void {
    this.hosts.set(slot, host);
  }

  public getHost(slot: EdisonPanelSlot): HTMLElement {
    const host = this.hosts.get(slot);
    if (!host) {
      throw new Error(`Edison slot '${slot}' does not have a host.`);
    }

    return host;
  }
}
