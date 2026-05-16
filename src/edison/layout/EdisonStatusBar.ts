import type { EdisonPluginContext } from "../plugins/EdisonPlugin";

export class EdisonStatusBar {
  private lastMessage = "";

  public constructor(private readonly host: HTMLElement) {}

  public setMessage(message: string): void {
    this.lastMessage = message;
  }

  public render(context: EdisonPluginContext): void {
    const snapshot = context.scene.getSnapshot();
    const selection = context.selection.getSelection();
    const activeTool = context.tools.getActiveTool();
    this.host.replaceChildren();

    const dirty = document.createElement("div");
    dirty.innerHTML = snapshot.dirty ? "<strong>Unsaved changes</strong>" : "Saved";
    const tool = document.createElement("div");
    tool.textContent = `Tool: ${activeTool?.title ?? "None"}`;
    const selected = document.createElement("div");
    selected.textContent = selection?.kind === "scene-object" ? `Selected: ${selection.objectId}` : "Selected: none";
    const message = document.createElement("div");
    message.textContent = this.lastMessage;

    this.host.append(dirty, tool, selected, message);
  }
}
