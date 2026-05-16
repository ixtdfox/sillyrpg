import type { EdisonPluginContext } from "../../plugins/EdisonPlugin";

export class SceneViewPanel {
  public render(host: HTMLElement, context: EdisonPluginContext): void {
    const viewportHost = document.createElement("div");
    viewportHost.className = "edison-viewport-host";

    const overlay = document.createElement("div");
    overlay.className = "edison-viewport-overlay";

    const axes = document.createElement("div");
    axes.className = "edison-axis-gizmo";
    axes.innerHTML = '<span class="edison-axis-x">X</span> <span class="edison-axis-y">Y</span> <span class="edison-axis-z">Z</span>';
    overlay.append(document.createElement("span"), axes);

    viewportHost.appendChild(overlay);
    host.appendChild(viewportHost);
    context.viewport.attachCanvas(viewportHost);
  }
}
