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
        this.runToolLifecycle(tool, "deactivate");
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

    const previousTool = this.getActiveTool();
    if (previousTool) {
      this.runToolLifecycle(previousTool, "deactivate");
    }

    this.activeToolId = toolId;
    this.runToolLifecycle(nextTool, "activate");
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
    const activeTool = this.getActiveTool();
    if (activeTool) {
      this.runToolLifecycle(activeTool, "deactivate");
    }
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

    try {
      return callback(tool, context) === true;
    } catch (error) {
      this.reportToolError(tool, "handle pointer input", error);
      return true;
    }
  }

  private runToolLifecycle(tool: EdisonTool, phase: "activate" | "deactivate"): void {
    try {
      tool[phase]?.();
    } catch (error) {
      this.reportToolError(tool, phase, error);
    }
  }

  private reportToolError(tool: EdisonTool, action: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Tool '${tool.title}' failed to ${action}. ${detail}`;
    console.error(message, error);
    this.events.emit("edison.message", { text: message });
  }

  private notifyChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
