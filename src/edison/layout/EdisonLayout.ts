import { EdisonDockHost } from "./EdisonDockHost";

export interface EdisonLayoutElements {
  readonly root: HTMLElement;
  readonly dockHost: EdisonDockHost;
  readonly toolbarHost: HTMLElement;
  readonly statusHost: HTMLElement;
}

export class EdisonLayout {
  private readonly disposers: Array<() => void> = [];

  public create(): EdisonLayoutElements {
    const root = document.createElement("div");
    root.className = "edison-root";

    const toolbarHost = document.createElement("div");
    toolbarHost.className = "edison-toolbar";
    root.appendChild(toolbarHost);

    const workspace = document.createElement("div");
    workspace.className = "edison-workspace";
    root.appendChild(workspace);

    const dockHost = new EdisonDockHost();
    const left = document.createElement("div");
    left.className = "edison-left";
    const center = document.createElement("div");
    center.className = "edison-center edison-slot";
    const right = document.createElement("div");
    right.className = "edison-right";

    const tools = this.createSlot("edison-slot");
    const hierarchy = this.createSlot("edison-slot edison-slot-scroll");
    const inspector = this.createSlot("edison-slot edison-slot-scroll");
    const plugins = this.createSlot("edison-slot edison-slot-scroll");
    const leftCenterResizer = this.createSplitter("vertical");
    const centerRightResizer = this.createSplitter("vertical");
    const inspectorPluginsResizer = this.createSplitter("horizontal");

    tools.hidden = true;
    left.append(hierarchy);
    right.append(inspector, inspectorPluginsResizer, plugins);
    workspace.append(left, leftCenterResizer, center, centerRightResizer, right);
    this.installColumnResizer(root, left, "edison-left-width", leftCenterResizer, 190, 340, "left");
    this.installColumnResizer(root, right, "edison-right-width", centerRightResizer, 260, 460, "right");
    this.installRowResizer(root, right, "edison-inspector-height", inspectorPluginsResizer, 200, 560, "top");

    const statusHost = document.createElement("div");
    statusHost.className = "edison-status";
    root.appendChild(statusHost);

    dockHost.setHost("left.tools", tools);
    dockHost.setHost("left.hierarchy", hierarchy);
    dockHost.setHost("center.sceneView", center);
    dockHost.setHost("right.inspector", inspector);
    dockHost.setHost("right.plugins", plugins);
    dockHost.setHost("top.toolbar", toolbarHost);
    dockHost.setHost("bottom.status", statusHost);

    return { root, dockHost, toolbarHost, statusHost };
  }

  public dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
  }

  private createSlot(className: string): HTMLElement {
    const slot = document.createElement("div");
    slot.className = className;
    return slot;
  }

  private createSplitter(direction: "horizontal" | "vertical"): HTMLElement {
    const splitter = document.createElement("div");
    splitter.className = `edison-splitter edison-splitter-${direction}`;
    return splitter;
  }

  private installColumnResizer(
    root: HTMLElement,
    pane: HTMLElement,
    variableName: string,
    splitter: HTMLElement,
    min: number,
    max: number,
    side: "left" | "right"
  ): void {
    const onPointerDown = (event: PointerEvent): void => {
      const startX = event.clientX;
      const startWidth = pane.getBoundingClientRect().width;

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const delta = moveEvent.clientX - startX;
        const next = side === "left" ? startWidth + delta : startWidth - delta;
        root.style.setProperty(`--${variableName}`, `${this.clamp(next, min, max)}px`);
      };
      const onPointerUp = (): void => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.classList.remove("edison-resizing-columns");
      };

      document.body.classList.add("edison-resizing-columns");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      event.preventDefault();
    };

    splitter.addEventListener("pointerdown", onPointerDown);
    this.disposers.push(() => splitter.removeEventListener("pointerdown", onPointerDown));
  }

  private installRowResizer(
    root: HTMLElement,
    pane: HTMLElement,
    variableName: string,
    splitter: HTMLElement,
    min: number,
    max: number,
    edge: "top"
  ): void {
    const onPointerDown = (event: PointerEvent): void => {
      const startY = event.clientY;
      const startHeight = pane.firstElementChild instanceof HTMLElement
        ? pane.firstElementChild.getBoundingClientRect().height
        : pane.getBoundingClientRect().height;

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const delta = moveEvent.clientY - startY;
        const next = edge === "top" ? startHeight + delta : startHeight - delta;
        root.style.setProperty(`--${variableName}`, `${this.clamp(next, min, max)}px`);
      };
      const onPointerUp = (): void => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.classList.remove("edison-resizing-rows");
      };

      document.body.classList.add("edison-resizing-rows");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      event.preventDefault();
    };

    splitter.addEventListener("pointerdown", onPointerDown);
    this.disposers.push(() => splitter.removeEventListener("pointerdown", onPointerDown));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
