import type { EdisonSelection } from "../core/EdisonSelectionService";
import type { EdisonPluginContext } from "../plugins/EdisonPlugin";
import type { EdisonPanelSlot } from "./EdisonWindowTypes";

export interface EdisonPanelDescriptor {
  readonly id: string;
  readonly title: string;
  readonly slot: EdisonPanelSlot;
  readonly order: number;
  readonly render: (host: HTMLElement, context: EdisonPluginContext) => void;
}

export interface EdisonInspectorSectionDescriptor {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly canRender: (selection: EdisonSelection) => boolean;
  readonly render: (host: HTMLElement, selection: EdisonSelection, context: EdisonPluginContext) => void;
}

export class EdisonPanelRegistry {
  private readonly panels = new Map<string, EdisonPanelDescriptor>();
  private readonly inspectorSections = new Map<string, EdisonInspectorSectionDescriptor>();
  private readonly listeners = new Set<() => void>();

  public registerPanel(panel: EdisonPanelDescriptor): () => void {
    if (this.panels.has(panel.id)) {
      throw new Error(`Edison panel '${panel.id}' is already registered.`);
    }

    this.panels.set(panel.id, panel);
    this.notifyChanged();
    return () => {
      this.panels.delete(panel.id);
      this.notifyChanged();
    };
  }

  public registerInspectorSection(section: EdisonInspectorSectionDescriptor): () => void {
    if (this.inspectorSections.has(section.id)) {
      throw new Error(`Edison inspector section '${section.id}' is already registered.`);
    }

    this.inspectorSections.set(section.id, section);
    this.notifyChanged();
    return () => {
      this.inspectorSections.delete(section.id);
      this.notifyChanged();
    };
  }

  public getPanels(slot: EdisonPanelSlot): readonly EdisonPanelDescriptor[] {
    return [...this.panels.values()]
      .filter((panel) => panel.slot === slot)
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  public getInspectorSections(selection: EdisonSelection): readonly EdisonInspectorSectionDescriptor[] {
    return [...this.inspectorSections.values()]
      .filter((section) => section.canRender(selection))
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  public onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.panels.clear();
    this.inspectorSections.clear();
    this.listeners.clear();
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
