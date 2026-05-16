import type { EdisonPluginContext } from "../../plugins/EdisonPlugin";

export class ToolsPanel {
  public render(host: HTMLElement, context: EdisonPluginContext): void {
    const toolGrid = document.createElement("div");
    toolGrid.className = "edison-tool-grid";
    const activeToolId = context.tools.getActiveToolId();

    for (const tool of context.tools.getTools()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `edison-tool-button${tool.id === activeToolId ? " is-active" : ""}`;
      button.title = tool.title;
      button.textContent = tool.title;
      button.addEventListener("click", () => {
        context.tools.setActiveTool(tool.id);
      });
      toolGrid.appendChild(button);
    }

    host.appendChild(toolGrid);
  }
}
