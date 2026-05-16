import type { EdisonPluginContext } from "../../plugins/EdisonPlugin";

export class HierarchyPanel {
  public render(host: HTMLElement, context: EdisonPluginContext): void {
    const snapshot = context.scene.getSnapshot();
    const selection = context.selection.getSelection();

    const sceneTitle = document.createElement("div");
    sceneTitle.className = "edison-card";
    sceneTitle.innerHTML = `<div class="edison-card-title">${snapshot.descriptor?.title ?? snapshot.option?.label ?? "No scene"}</div><div class="edison-muted">${snapshot.descriptorPath ?? "No descriptor loaded"}</div>`;
    host.appendChild(sceneTitle);

    const terrainTitle = document.createElement("div");
    terrainTitle.className = "edison-section-title";
    terrainTitle.textContent = "Terrain";
    host.appendChild(terrainTitle);

    const terrainButton = document.createElement("button");
    terrainButton.type = "button";
    terrainButton.className = `edison-tree-item${selection?.kind === "terrain" ? " is-selected" : ""}`;
    terrainButton.textContent = context.scene.describeTerrain();
    terrainButton.addEventListener("click", () => {
      const terrain = snapshot.descriptor?.terrain;
      if (terrain) {
        context.selection.selectTerrain(terrain.id);
      } else {
        context.selection.clear();
      }
    });
    host.appendChild(terrainButton);

    const objectTitle = document.createElement("div");
    objectTitle.className = "edison-section-title";
    objectTitle.textContent = `Objects (${snapshot.descriptor?.objects.length ?? 0})`;
    host.appendChild(objectTitle);

    for (const object of snapshot.descriptor?.objects ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `edison-tree-item${selection?.kind === "scene-object" && selection.objectId === object.id ? " is-selected" : ""}`;
      button.textContent = `${object.id} (${object.type})`;
      button.addEventListener("click", () => {
        context.selection.selectSceneObject(object.id);
      });
      host.appendChild(button);
    }

    const lightTitle = document.createElement("div");
    lightTitle.className = "edison-section-title";
    lightTitle.textContent = "Lights";
    host.appendChild(lightTitle);
    const lightInfo = document.createElement("div");
    lightInfo.className = "edison-muted";
    lightInfo.textContent = snapshot.descriptor?.lighting?.preset ? `Preset: ${snapshot.descriptor.lighting.preset}` : "Default scene lighting";
    host.appendChild(lightInfo);
  }
}
