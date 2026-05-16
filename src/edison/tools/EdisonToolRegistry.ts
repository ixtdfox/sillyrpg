import { EdisonEventBus } from "../core/EdisonEventBus";
import type { EdisonPluginContext } from "../plugins/EdisonPlugin";
import type { EdisonTool, EdisonToolPointerEvent } from "./EdisonTool";

export class EdisonToolRegistry {
  private readonly tools = new Map<string, EdisonTool>();
  private readonly listeners = new Set<() => void>();
  private activeToolId: string | null = null;
  private context: EdisonPluginContext | null = null;

  public constructor(private readonly events: EdisonEventBus) {}

  public bindContext(context: EdisonPluginContext): void {
    this.context = context;
  }

  public registerTool(tool: EdisonTool): () => void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Edison tool '${tool.id}' is already registered.`);
    }

    this.tools.set(tool.id, tool);
    if (!this.activeToolId) {
      this.setActiveTool(tool.id);
    }
    this.notifyChanged();

    return () => {
      if (this.activeToolId === tool.id) {
        tool.deactivate?.();
        this.activeToolId = null;
      }
      this.tools.delete(tool.id);
      this.notifyChanged();
    };
  }

  public getTools(): readonly EdisonTool[] {
    return [...this.tools.values()].sort((left, right) => (left.order ?? 1000) - (right.order ?? 1000) || left.title.localeCompare(right.title));
  }

  public getActiveTool(): EdisonTool | null {
    return this.activeToolId ? this.tools.get(this.activeToolId) ?? null : null;
  }

  public getActiveToolId(): string | null {
    return this.activeToolId;
  }

  public setActiveTool(toolId: string): void {
    if (this.activeToolId === toolId) {
      return;
    }

    const nextTool = this.tools.get(toolId);
    if (!nextTool) {
      throw new Error(`Edison tool '${toolId}' is not registered.`);
    }

    this.getActiveTool()?.deactivate?.();
    this.activeToolId = toolId;
    nextTool.activate?.();
    this.events.emit("edison.tool.changed", { toolId });
    this.notifyChanged();
  }

  public dispatchPointerDown(event: EdisonToolPointerEvent): boolean {
    return this.dispatch((tool, context) => tool.onPointerDown?.(event, context));
  }

  public dispatchPointerMove(event: EdisonToolPointerEvent): boolean {
    return this.dispatch((tool, context) => tool.onPointerMove?.(event, context));
  }

  public dispatchPointerUp(event: EdisonToolPointerEvent): boolean {
    return this.dispatch((tool, context) => tool.onPointerUp?.(event, context));
  }

  public onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.getActiveTool()?.deactivate?.();
    this.tools.clear();
    this.listeners.clear();
    this.activeToolId = null;
    this.context = null;
  }

  private dispatch(callback: (tool: EdisonTool, context: EdisonPluginContext) => boolean | void | undefined): boolean {
    const tool = this.getActiveTool();
    const context = this.context;
    if (!tool || !context) {
      return false;
    }

    return callback(tool, context) === true;
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
