import orientationGizmoLinesSvg from "../../../../assets/edison/orientation-gizmo-lines.svg?raw";
import type { EdisonPluginContext } from "../../plugins/EdisonPlugin";
import type { EdisonOrientationGizmoAxis } from "../../tools/EditorCameraTool";

export class SceneViewPanel {
  public render(host: HTMLElement, context: EdisonPluginContext): void {
    const viewportHost = document.createElement("div");
    viewportHost.className = "edison-viewport-host";

    const overlay = document.createElement("div");
    overlay.className = "edison-viewport-overlay";
    const orientationGizmo = this.createOrientationGizmo(context);
    overlay.appendChild(orientationGizmo);

    host.appendChild(viewportHost);
    context.viewport.attachCanvas(viewportHost);
    viewportHost.appendChild(overlay);
    this.startOrientationGizmoLoop(orientationGizmo, context);
  }

  private createOrientationGizmo(context: EdisonPluginContext): HTMLElement {
    const gizmo = document.createElement("div");
    gizmo.className = "edison-orientation-gizmo";
    gizmo.innerHTML = orientationGizmoLinesSvg;

    const projection = document.createElement("button");
    projection.type = "button";
    projection.className = "edison-gizmo-projection";
    projection.textContent = context.viewport.getProjectionMode() === "Perspective" ? "Persp" : "Iso";
    projection.title = "Toggle Perspective / Orthographic";
    projection.addEventListener("click", () => context.viewport.toggleProjectionMode());

    const cube = document.createElement("button");
    cube.type = "button";
    cube.className = "edison-gizmo-cube";
    cube.title = "Toggle projection. Shift-click resets the default view.";
    cube.addEventListener("click", (event) => {
      if (event.shiftKey) {
        context.viewport.resetCameraView();
        return;
      }
      context.viewport.toggleProjectionMode();
    });
    cube.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      context.viewport.resetCameraView();
    });

    gizmo.append(
      this.createAxisButton("+x", "X", "View from +X", "edison-gizmo-axis-x", context),
      this.createAxisButton("-x", "", "View from -X", "edison-gizmo-axis-neg", context),
      this.createAxisButton("+y", "Y", "View from +Y", "edison-gizmo-axis-y", context),
      this.createAxisButton("-y", "", "View from -Y", "edison-gizmo-axis-neg", context),
      this.createAxisButton("+z", "Z", "View from +Z", "edison-gizmo-axis-z", context),
      this.createAxisButton("-z", "", "View from -Z", "edison-gizmo-axis-neg", context),
      cube,
      projection
    );

    return gizmo;
  }

  private createAxisButton(
    axis: EdisonOrientationGizmoAxis,
    label: string,
    title: string,
    className: string,
    context: EdisonPluginContext
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `edison-gizmo-axis ${className}`;
    button.dataset.gizmoAxis = axis;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.textContent = label;
    const fallbackPosition = this.getFallbackAxisPosition(axis);
    button.style.left = `${fallbackPosition.x}px`;
    button.style.top = `${fallbackPosition.y}px`;
    button.addEventListener("click", () => context.viewport.setCameraAxisView(axis));
    return button;
  }

  private getFallbackAxisPosition(axis: EdisonOrientationGizmoAxis): { readonly x: number; readonly y: number } {
    switch (axis) {
      case "+x":
        return { x: 102, y: 62 };
      case "-x":
        return { x: 22, y: 62 };
      case "+y":
        return { x: 62, y: 22 };
      case "-y":
        return { x: 62, y: 102 };
      case "+z":
        return { x: 90, y: 34 };
      case "-z":
        return { x: 34, y: 90 };
    }
  }

  private startOrientationGizmoLoop(gizmo: HTMLElement, context: EdisonPluginContext): void {
    const center = 62;
    const radius = 40;
    const axisElements = new Map<EdisonOrientationGizmoAxis, HTMLButtonElement>();
    const lineElements = new Map<EdisonOrientationGizmoAxis, SVGLineElement>();

    for (const element of Array.from(gizmo.querySelectorAll<HTMLButtonElement>("[data-gizmo-axis]"))) {
      axisElements.set(element.dataset.gizmoAxis as EdisonOrientationGizmoAxis, element);
    }

    for (const element of Array.from(gizmo.querySelectorAll<SVGLineElement>("[data-gizmo-line]"))) {
      lineElements.set(element.dataset.gizmoLine as EdisonOrientationGizmoAxis, element);
    }

    let wasConnected = false;
    const update = (): void => {
      if (!gizmo.isConnected) {
        if (!wasConnected) {
          requestAnimationFrame(update);
        }
        return;
      }

      wasConnected = true;
      gizmo.hidden = !context.viewport.getAxesVisible();
      const projection = gizmo.querySelector<HTMLButtonElement>(".edison-gizmo-projection");
      if (projection) {
        projection.textContent = context.viewport.getProjectionMode() === "Perspective" ? "Persp" : "Iso";
      }

      for (const point of context.viewport.getOrientationGizmoPoints()) {
        const x = center + point.screenX * radius;
        const y = center + point.screenY * radius;
        const zIndex = String(Math.round((point.depth + 1) * 100));
        const opacity = String(0.52 + Math.max(0, point.depth) * 0.48);
        const axisElement = axisElements.get(point.axis);
        if (axisElement) {
          axisElement.style.left = `${x}px`;
          axisElement.style.top = `${y}px`;
          axisElement.style.zIndex = zIndex;
          axisElement.style.opacity = opacity;
        }

        const lineElement = lineElements.get(point.axis);
        if (lineElement) {
          lineElement.setAttribute("x2", x.toFixed(2));
          lineElement.setAttribute("y2", y.toFixed(2));
          lineElement.style.opacity = opacity;
        }
      }

      requestAnimationFrame(update);
    };

    update();
  }
}
