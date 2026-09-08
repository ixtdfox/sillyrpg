import { Vector3 } from "@babylonjs/core";
import type { SceneObjectDescriptor } from "../../../core/world/scene/SceneDescriptor";
import type { EdisonSelection } from "../../core/EdisonSelectionService";
import type { EdisonPluginContext } from "../../plugins/EdisonPlugin";

export class InspectorPanel {
  public render(host: HTMLElement, context: EdisonPluginContext): void {
    this.renderInteriorEditControls(host, context);
    const selection = context.selection.getSelection();
    if (!selection) {
      this.renderEmpty(host, "Nothing selected");
      return;
    }

    if (selection.kind === "terrain") {
      this.renderTerrain(host, context);
      this.renderExtensionSections(host, selection, context);
      return;
    }

    const object = context.scene.getObject(selection.objectId);
    if (!object) {
      this.renderEmpty(host, "Selected object is missing");
      return;
    }

    this.renderObject(host, object, context);
    this.renderExtensionSections(host, selection, context);
  }

  private renderObject(host: HTMLElement, object: SceneObjectDescriptor, context: EdisonPluginContext): void {
    const card = document.createElement("div");
    card.className = "edison-card";
    card.innerHTML = `<div class="edison-card-title">${object.id}</div><div class="edison-muted">${object.type} | ${object.asset}</div>`;
    host.appendChild(card);

    this.renderVectorFields(host, "Position", object.position, (vector) => {
      context.transforms.updateObjectTransform(object.id, { position: vector });
    });
    this.renderSingleNumber(host, "Rotation Y", object.rotation[1], (value) => {
      context.transforms.updateObjectTransform(object.id, {
        rotation: new Vector3(object.rotation[0], value, object.rotation[2])
      });
    });
    this.renderVectorFields(host, "Scale", object.scale, (vector) => {
      context.transforms.updateObjectTransform(object.id, { scale: vector });
    });

    if (object.type === "building" && context.interiorEdit.getActiveBuildingId() !== object.id) {
      this.renderEnterInteriorEditButton(host, object, context);
    }
  }

  private renderInteriorEditControls(host: HTMLElement, context: EdisonPluginContext): void {
    const state = context.interiorEdit.getState();
    if (!state) {
      return;
    }

    const card = document.createElement("div");
    card.className = "edison-card edison-interior-edit-card";

    const title = document.createElement("div");
    title.className = "edison-card-title";
    title.textContent = "Interior Edit";
    const subtitle = document.createElement("div");
    subtitle.className = "edison-muted";
    subtitle.textContent = `Building: ${state.activeBuildingId}`;

    const floorRow = document.createElement("div");
    floorRow.className = "edison-floor-button-row";
    for (const floor of state.floors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `edison-button${floor.storyIndex === state.activeStoryIndex ? " is-active" : ""}`;
      button.textContent = floor.label;
      button.addEventListener("click", () => {
        context.interiorEdit.selectStory(floor.storyIndex);
      });
      floorRow.appendChild(button);
    }

    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.className = "edison-button";
    exitButton.textContent = "Exit Interior";
    exitButton.addEventListener("click", () => context.interiorEdit.exit());

    const magicFillButton = document.createElement("button");
    magicFillButton.type = "button";
    magicFillButton.className = "edison-button edison-button-primary";
    magicFillButton.textContent = "Magic fill";
    magicFillButton.addEventListener("click", () => {
      magicFillButton.disabled = true;
      void context.interiorMagicFill.fillActiveBuilding()
        .catch((error) => {
          context.events.emit("edison.message", { text: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => {
          magicFillButton.disabled = false;
        });
    });

    const actionRow = document.createElement("div");
    actionRow.className = "edison-interior-action-row";
    actionRow.append(magicFillButton, exitButton);

    card.append(title, subtitle, floorRow, actionRow);
    host.appendChild(card);
  }

  private renderEnterInteriorEditButton(host: HTMLElement, object: SceneObjectDescriptor, context: EdisonPluginContext): void {
    const title = document.createElement("div");
    title.className = "edison-section-title";
    title.textContent = "Interior";

    const card = document.createElement("div");
    card.className = "edison-card";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edison-button";
    button.textContent = "Edit Interior";
    button.addEventListener("click", () => {
      const floors = context.viewport.getInteriorEditFloors(object.id);
      if (floors.length === 0) {
        context.events.emit("edison.message", { text: "Selected building has no editable floor metadata." });
        return;
      }

      context.interiorEdit.enterBuilding(object.id, floors);
      context.events.emit("edison.message", { text: `Interior edit mode: ${object.id}.` });
    });
    card.appendChild(button);
    host.append(title, card);
  }

  private renderTerrain(host: HTMLElement, context: EdisonPluginContext): void {
    const card = document.createElement("div");
    card.className = "edison-card";
    card.innerHTML = `<div class="edison-card-title">Terrain</div><div class="edison-muted">${context.scene.describeTerrain()}</div>`;
    host.appendChild(card);
  }

  private renderExtensionSections(host: HTMLElement, selection: EdisonSelection, context: EdisonPluginContext): void {
    for (const section of context.panels.getInspectorSections(selection)) {
      const title = document.createElement("div");
      title.className = "edison-section-title";
      title.textContent = section.title;
      const body = document.createElement("div");
      body.className = "edison-card";
      section.render(body, selection, context);
      host.append(title, body);
    }
  }

  private renderEmpty(host: HTMLElement, text: string): void {
    const empty = document.createElement("div");
    empty.className = "edison-card edison-muted";
    empty.textContent = text;
    host.appendChild(empty);
  }

  private renderVectorFields(
    host: HTMLElement,
    label: string,
    value: readonly [number, number, number],
    onChange: (value: Vector3) => void
  ): void {
    const title = document.createElement("div");
    title.className = "edison-section-title";
    title.textContent = label;
    host.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "edison-field-grid";
    const inputs: HTMLInputElement[] = [];
    for (const number of value) {
      inputs.push(this.createNumberInput(number, () => {
      onChange(new Vector3(
        Number(inputs[0].value),
        Number(inputs[1].value),
        Number(inputs[2].value)
      ));
      }));
    }
    grid.append(this.createFieldLabel("X"), inputs[0], this.createFieldLabel("Y"), inputs[1], this.createFieldLabel("Z"), inputs[2]);
    host.appendChild(grid);
  }

  private renderSingleNumber(host: HTMLElement, label: string, value: number, onChange: (value: number) => void): void {
    const title = document.createElement("div");
    title.className = "edison-section-title";
    title.textContent = label;
    const input = this.createNumberInput(value, () => {
      onChange(Number(input.value));
    });
    input.className = "edison-number";
    host.append(title, input);
  }

  private createNumberInput(value: number, onChange: () => void): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = String(Number(value.toFixed(3)));
    input.addEventListener("change", onChange);
    return input;
  }

  private createFieldLabel(text: string): HTMLElement {
    const label = document.createElement("div");
    label.className = "edison-muted";
    label.textContent = text;
    return label;
  }
}
