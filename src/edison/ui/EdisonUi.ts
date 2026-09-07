import type { EdisonPluginContext } from "../plugins/EdisonPlugin";
import type { EdisonInstalledPlugin } from "../plugins/EdisonPluginManager";
import type { EdisonPanelSlot } from "../layout/EdisonWindowTypes";
import { EdisonLayout } from "../layout/EdisonLayout";
import { EdisonStatusBar } from "../layout/EdisonStatusBar";
import { getEdisonIcon, getEdisonSvgIcon } from "./EdisonIcons";
import { ensureEdisonCss } from "./EdisonCss";

export class EdisonUi {
  private readonly root: HTMLElement;
  private readonly layout = new EdisonLayout();
  private readonly elements = this.layout.create();
  private readonly statusBar = new EdisonStatusBar(this.elements.statusHost);
  private readonly saveOverlay = this.createSaveOverlay();
  private readonly pluginManagerDialog = this.createPluginManagerDialog();
  private context: EdisonPluginContext | null = null;
  private openMenu: HTMLDetailsElement | null = null;
  private installedPlugins: readonly EdisonInstalledPlugin[] = [];
  private readonly disposers: Array<() => void> = [];
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.closeOpenMenu();
      return;
    }

    const targetElement = target instanceof Element ? target : target.parentElement;
    if (targetElement?.closest(".edison-menu")) {
      return;
    }

    this.closeOpenMenu();
  };

  public constructor() {
    ensureEdisonCss();
    this.root = this.elements.root;
    this.root.appendChild(this.saveOverlay.root);
    this.root.appendChild(this.pluginManagerDialog.root);
    document.body.appendChild(this.root);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  public bind(context: EdisonPluginContext): void {
    this.context = context;
    this.disposers.push(
      context.panels.onDidChange(() => this.render()),
      context.toolbar.onDidChange(() => this.renderToolbar()),
      context.commands.onDidChange(() => this.renderToolbar()),
      context.tools.onDidChange(() => this.renderNonViewportPanels()),
      context.selection.onDidChange(() => this.renderNonViewportPanels()),
      context.placement.onDidChange(() => this.renderNonViewportPanels()),
      context.events.on("edison.connectedObjects.changed", () => this.renderNonViewportPanels()),
      context.events.on("edison.terrainSnap.changed", () => this.renderNonViewportPanels()),
      context.events.on("edison.interiorEdit.changed", () => this.renderNonViewportPanels()),
      context.events.on<{ text: string }>("edison.message", (payload) => {
        this.statusBar.setMessage(payload.text);
        this.renderStatus();
      }),
      context.events.on("edison.document.changed", () => this.renderNonViewportPanels()),
      context.events.on<{ active: boolean; message: string; progress: number }>("edison.save.progress", (payload) => {
        this.renderSaveOverlay(payload);
      }),
      context.events.on("edison.pluginManager.open", () => {
        this.showPluginManagerDialog();
      }),
      context.events.on<{ plugins: readonly EdisonInstalledPlugin[] }>("edison.plugins.changed", (payload) => {
        this.installedPlugins = payload.plugins;
        this.renderPluginManagerDialog();
      }),
      context.events.on("edison.viewport.changed", () => {
        this.renderToolbar();
        this.renderStatus();
      })
    );
    this.render();
  }

  public render(): void {
    if (!this.context) {
      return;
    }

    this.renderNonViewportPanels();
    this.renderSlot("center.sceneView");
  }

  private renderNonViewportPanels(): void {
    if (!this.context) {
      return;
    }

    this.renderToolbar();
    this.renderSlot("left.hierarchy");
    this.renderSlot("right.inspector");
    this.renderSlot("right.plugins");
    this.renderStatus();
  }

  public dispose(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.closeOpenMenu();
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.layout.dispose();
    this.root.remove();
    this.context = null;
  }

  private renderToolbar(): void {
    const context = this.context;
    if (!context) {
      return;
    }

    const host = this.elements.toolbarHost;
    host.replaceChildren();
    this.openMenu = null;

    const brand = document.createElement("div");
    brand.className = "edison-brand";
    brand.textContent = "Edison";
    host.appendChild(brand);

    const separator = document.createElement("div");
    separator.className = "edison-toolbar-separator";
    host.appendChild(separator);

    host.append(
      this.createCommandMenu("Scene", [
        { commandId: "edison.save", label: "Save" },
        { commandId: "edison.exportJson", label: "Export JSON" },
        { commandId: "edison.reload", label: "Reload" },
        { commandId: "edison.back", label: "Back to Menu" }
      ], context),
      this.createCommandMenu("Settings", [
        { commandId: "edison.frameScene", label: "Fit View" },
        { commandId: "edison.toggleGrid", label: "Grid", active: context.viewport.getGridVisible() },
        { commandId: "edison.toggleAxes", label: "Axes", active: context.viewport.getAxesVisible() },
        { commandId: "edison.toggleTerrainSnap", label: "Terrain Snap", active: context.terrainSnap.isEnabled(), checkbox: true }
      ], context),
      this.createCommandMenu("Plugins", [
        { commandId: "edison.openPluginManager", label: "Plugin Manager" },
        { commandId: "edison.installPluginZip", label: "Install from ZIP" }
      ], context)
    );

    const toolsSeparator = document.createElement("div");
    toolsSeparator.className = "edison-toolbar-separator";
    host.appendChild(toolsSeparator);

    const toolHost = document.createElement("div");
    toolHost.className = "edison-toolbar-tools";
    const activeToolId = context.tools.getActiveToolId();
    for (const tool of context.tools.getTools()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `edison-tool-icon-button${tool.id === activeToolId ? " is-active" : ""}`;
      button.title = tool.title;
      button.setAttribute("aria-label", tool.title);
      const svgIcon = getEdisonSvgIcon(tool.icon ?? tool.id);
      if (svgIcon) {
        button.innerHTML = svgIcon;
      } else {
        button.textContent = tool.title.slice(0, 1).toUpperCase();
      }
      button.addEventListener("click", () => {
        try {
          context.tools.setActiveTool(tool.id);
        } catch (error) {
          context.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
        }
      });
      toolHost.appendChild(button);
    }
    host.appendChild(toolHost);

    const externalButtons = context.toolbar.getButtons();
    if (externalButtons.length > 0) {
      const externalSeparator = document.createElement("div");
      externalSeparator.className = "edison-toolbar-separator";
      host.appendChild(externalSeparator);
    }

    for (const button of externalButtons) {
      const element = document.createElement("button");
      element.className = "edison-button";
      if (this.isToolbarButtonActive(button.commandId, context)) {
        element.classList.add("is-active");
      }
      element.type = "button";
      element.title = button.title;
      element.textContent = getEdisonIcon(button.icon, button.title);
      element.disabled = !context.commands.canExecute(button.commandId);
      element.addEventListener("click", () => {
        void context.commands.execute(button.commandId).catch((error: unknown) => {
          context.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
        });
      });
      host.appendChild(element);
    }
  }

  private createCommandMenu(
    label: string,
    items: ReadonlyArray<{
      readonly commandId: string;
      readonly label: string;
      readonly active?: boolean;
      readonly checkbox?: boolean;
    }>,
    context: EdisonPluginContext
  ): HTMLElement {
    const menu = document.createElement("details");
    menu.className = "edison-menu";

    const summary = document.createElement("summary");
    summary.textContent = label;
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      if (menu.open) {
        this.closeOpenMenu();
        return;
      }

      this.openCommandMenu(menu);
    });
    summary.addEventListener("mouseenter", () => {
      if (this.openMenu && this.openMenu !== menu) {
        this.openCommandMenu(menu);
      }
    });
    menu.appendChild(summary);

    const popover = document.createElement("div");
    popover.className = "edison-menu-popover";
    for (const item of items) {
      if (item.checkbox && item.active !== undefined) {
        const checkboxLabel = document.createElement("label");
        const commandEnabled = context.commands.canExecute(item.commandId);
        checkboxLabel.className = `edison-menu-item edison-menu-checkbox${item.active ? " is-active" : ""}${commandEnabled ? "" : " is-disabled"}`;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.active;
        checkbox.disabled = !commandEnabled;
        checkbox.addEventListener("change", () => {
          this.closeOpenMenu();
          void context.commands.execute(item.commandId).catch((error: unknown) => {
            context.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
          });
        });
        const checkboxText = document.createElement("span");
        checkboxText.textContent = item.label;
        checkboxLabel.append(checkbox, checkboxText);
        popover.appendChild(checkboxLabel);
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = `edison-menu-item${item.active ? " is-active" : ""}`;
      button.textContent = item.active === undefined ? item.label : `${item.active ? "[x]" : "[ ]"} ${item.label}`;
      if (item.active !== undefined) {
        button.setAttribute("aria-pressed", String(item.active));
      }
      button.disabled = !context.commands.canExecute(item.commandId);
      button.addEventListener("click", () => {
        this.closeOpenMenu();
        void context.commands.execute(item.commandId).catch((error: unknown) => {
          context.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
        });
      });
      popover.appendChild(button);
    }
    menu.appendChild(popover);
    return menu;
  }

  private openCommandMenu(menu: HTMLDetailsElement): void {
    if (this.openMenu && this.openMenu !== menu) {
      this.openMenu.open = false;
    }

    this.openMenu = menu;
    this.openMenu.open = true;
  }

  private closeOpenMenu(): void {
    if (!this.openMenu) {
      return;
    }

    this.openMenu.open = false;
    this.openMenu = null;
  }

  private renderSlot(slot: EdisonPanelSlot): void {
    const context = this.context;
    if (!context) {
      return;
    }

    const host = this.elements.dockHost.getHost(slot);
    host.replaceChildren();

    for (const panel of context.panels.getPanels(slot)) {
      const wrapper = document.createElement("section");
      wrapper.className = `edison-panel ${slot === "center.sceneView" ? "edison-scene-panel" : ""}`;
      const header = document.createElement("header");
      header.className = "edison-panel-header";
      header.textContent = panel.title;
      const body = document.createElement("div");
      body.className = "edison-panel-body";
      wrapper.append(header, body);
      host.appendChild(wrapper);
      panel.render(body, context);
    }
  }

  private renderStatus(): void {
    if (this.context) {
      this.statusBar.render(this.context);
    }
  }

  private createSaveOverlay(): {
    readonly root: HTMLElement;
    readonly message: HTMLElement;
    readonly progress: HTMLElement;
    readonly percent: HTMLElement;
  } {
    const root = document.createElement("div");
    root.className = "edison-save-overlay";
    root.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "edison-save-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("div");
    title.className = "edison-save-title";
    title.textContent = "Save Progress";

    const message = document.createElement("div");
    message.className = "edison-save-message";
    message.textContent = "Preparing scene save...";

    const track = document.createElement("div");
    track.className = "edison-save-progress-track";
    const progress = document.createElement("div");
    progress.className = "edison-save-progress-bar";
    track.appendChild(progress);

    const percent = document.createElement("div");
    percent.className = "edison-save-percent";
    percent.textContent = "0%";

    dialog.append(title, message, track, percent);
    root.appendChild(dialog);
    return { root, message, progress, percent };
  }

  private renderSaveOverlay(payload: { readonly active: boolean; readonly message: string; readonly progress: number }): void {
    this.saveOverlay.root.hidden = !payload.active;
    if (!payload.active) {
      return;
    }

    const progress = Math.max(0, Math.min(1, payload.progress));
    this.saveOverlay.message.textContent = payload.message;
    this.saveOverlay.progress.style.width = `${Math.round(progress * 100)}%`;
    this.saveOverlay.percent.textContent = `${Math.round(progress * 100)}%`;
  }

  private createPluginManagerDialog(): {
    readonly root: HTMLElement;
    readonly list: HTMLElement;
    readonly installButton: HTMLButtonElement;
    readonly closeButton: HTMLButtonElement;
  } {
    const root = document.createElement("div");
    root.className = "edison-plugin-manager-overlay";
    root.hidden = true;

    const dialog = document.createElement("section");
    dialog.className = "edison-plugin-manager-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Plugin Manager");
    dialog.addEventListener("pointerdown", (event) => event.stopPropagation());

    const header = document.createElement("header");
    header.className = "edison-plugin-manager-header";
    const title = document.createElement("div");
    title.className = "edison-plugin-manager-title";
    title.textContent = "Plugin Manager";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "edison-plugin-manager-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.hidePluginManagerDialog());
    header.append(title, closeButton);

    const body = document.createElement("div");
    body.className = "edison-plugin-manager-body";
    const list = document.createElement("div");
    list.className = "edison-plugin-manager-list";
    body.appendChild(list);

    const footer = document.createElement("footer");
    footer.className = "edison-plugin-manager-footer";
    const installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "edison-button";
    installButton.textContent = "Install from ZIP";
    installButton.addEventListener("click", () => {
      if (!this.context) {
        return;
      }
      void this.context.commands.execute("edison.installPluginZip").catch((error: unknown) => {
        this.context?.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
      });
    });
    footer.appendChild(installButton);

    dialog.append(header, body, footer);
    root.appendChild(dialog);
    root.addEventListener("pointerdown", () => this.hidePluginManagerDialog());
    return { root, list, installButton, closeButton };
  }

  private showPluginManagerDialog(): void {
    this.closeOpenMenu();
    this.pluginManagerDialog.root.hidden = false;
    this.renderPluginManagerDialog();
  }

  private hidePluginManagerDialog(): void {
    this.pluginManagerDialog.root.hidden = true;
  }

  private renderPluginManagerDialog(): void {
    const { list, installButton } = this.pluginManagerDialog;
    installButton.disabled = !this.context?.commands.canExecute("edison.installPluginZip");
    list.replaceChildren();

    if (this.installedPlugins.length === 0) {
      const empty = document.createElement("div");
      empty.className = "edison-plugin-manager-empty";
      empty.textContent = "No plugins installed.";
      list.appendChild(empty);
      return;
    }

    for (const installed of this.installedPlugins) {
      const row = document.createElement("article");
      row.className = "edison-plugin-manager-row";

      const main = document.createElement("div");
      main.className = "edison-plugin-manager-row-main";
      const name = document.createElement("div");
      name.className = "edison-plugin-manager-row-name";
      name.textContent = installed.manifest.name;
      const meta = document.createElement("div");
      meta.className = "edison-plugin-manager-row-meta";
      meta.textContent = `${installed.manifest.id} v${installed.manifest.version}`;
      const description = document.createElement("div");
      description.className = "edison-plugin-manager-row-description";
      description.textContent = installed.manifest.description ?? "";
      main.append(name, meta, description);

      const status = document.createElement("div");
      status.className = `edison-plugin-manager-status${installed.active ? " is-active" : ""}`;
      status.textContent = installed.active ? "Active" : "Inactive";

      row.append(main, status);
      list.appendChild(row);
    }
  }

  private isToolbarButtonActive(commandId: string, context: EdisonPluginContext): boolean {
    if (commandId === "edison.toggleGrid") {
      return context.viewport.getGridVisible();
    }

    if (commandId === "edison.toggleAxes") {
      return context.viewport.getAxesVisible();
    }

    return false;
  }
}
