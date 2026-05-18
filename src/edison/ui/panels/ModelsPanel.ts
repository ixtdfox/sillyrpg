import { EdisonModelAssetCatalog, type EdisonModelAssetOption } from "../../assets/EdisonModelAssetCatalog";
import { EdisonModelThumbnailService } from "../../assets/EdisonModelThumbnailService";
import { writeEdisonModelAssetDragData } from "../../assets/EdisonModelDragDrop";
import type { EdisonPluginContext } from "../../plugins/EdisonPlugin";

export class ModelsPanel {
  private readonly catalog = new EdisonModelAssetCatalog();
  private readonly thumbnailService = new EdisonModelThumbnailService();
  private searchQuery = "";
  private activeCategory = "all";
  private renderToken = 0;

  public render(host: HTMLElement, context: EdisonPluginContext): void {
    const token = ++this.renderToken;
    const models = this.catalog.getModelOptions();
    const categories = this.catalog.getCategories(models);
    const filteredModels = this.filterModels(models);

    host.classList.add("edison-models-host");
    host.replaceChildren();
    host.append(
      this.renderHeader(models.length, filteredModels.length),
      this.renderSearch(host, context),
      this.renderCategories(categories, context),
      this.renderContent(filteredModels, token, context)
    );
  }

  public dispose(): void {
    this.renderToken += 1;
    this.thumbnailService.dispose();
  }

  private renderHeader(totalCount: number, visibleCount: number): HTMLElement {
    const header = document.createElement("div");
    header.className = "edison-models-header";
    header.innerHTML = `
      <div>
        <div class="edison-models-title">Model Library</div>
        <div class="edison-models-subtitle" data-model-count>${visibleCount} visible / ${totalCount} total</div>
      </div>
      <div class="edison-models-drop-hint">Drag into Scene View</div>
    `;
    return header;
  }

  private renderSearch(host: HTMLElement, context: EdisonPluginContext): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "edison-models-search";
    wrapper.innerHTML = `
      <span aria-hidden="true">Search</span>
      <input type="search" placeholder="Model, path, category..." value="${escapeHtml(this.searchQuery)}">
    `;

    const input = wrapper.querySelector("input");
    input?.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.refreshResults(host, context);
    });

    return wrapper;
  }

  private renderCategories(
    categories: readonly { readonly id: string; readonly label: string; readonly count: number }[],
    context: EdisonPluginContext
  ): HTMLElement {
    const container = document.createElement("div");
    container.className = "edison-models-categories";

    const allButton = this.createCategoryButton("all", "All", categories.reduce((count, category) => count + category.count, 0), context);
    container.appendChild(allButton);
    for (const category of categories) {
      container.appendChild(this.createCategoryButton(category.id, category.label, category.count, context));
    }

    return container;
  }

  private createCategoryButton(id: string, label: string, count: number, context: EdisonPluginContext): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `edison-models-category${this.activeCategory === id ? " is-active" : ""}`;
    button.innerHTML = `<span>${escapeHtml(label)}</span><strong>${count}</strong>`;
    button.addEventListener("click", () => {
      this.activeCategory = id;
      context.events.emit("edison.message", { text: `Model category: ${label}.` });
      const host = button.closest(".edison-models-host");
      if (host instanceof HTMLElement) {
        this.render(host, context);
      }
    });
    return button;
  }

  private renderContent(models: readonly EdisonModelAssetOption[], token: number, context: EdisonPluginContext): HTMLElement {
    const container = document.createElement("div");
    container.className = "edison-models-content";

    if (models.length === 0) {
      const empty = document.createElement("div");
      empty.className = "edison-models-empty";
      empty.textContent = this.searchQuery || this.activeCategory !== "all"
        ? "No models match the current filter."
        : "No .glb or .gltf models found under assets/models.";
      container.appendChild(empty);
      return container;
    }

    const grid = document.createElement("div");
    grid.className = "edison-models-grid";
    for (const model of models) {
      grid.appendChild(this.createModelCard(model, token, context));
    }
    container.appendChild(grid);
    return container;
  }

  private createModelCard(model: EdisonModelAssetOption, token: number, context: EdisonPluginContext): HTMLElement {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "edison-model-card";
    card.draggable = true;
    card.title = `Drag ${model.title} into Scene View`;
    card.setAttribute("aria-label", `Drag model ${model.title} into Scene View`);
    card.innerHTML = `
      <span class="edison-model-card-thumb" data-model-thumb="${escapeHtml(model.id)}">
        <span class="edison-model-card-thumb-fallback">${escapeHtml(model.categoryLabel.slice(0, 1).toUpperCase())}</span>
      </span>
      <span class="edison-model-card-body">
        <span class="edison-model-card-title">${escapeHtml(model.title)}</span>
        <span class="edison-model-card-meta">${escapeHtml(model.categoryLabel)} · ${escapeHtml(model.objectType)}</span>
        <span class="edison-model-card-path">${escapeHtml(model.relativePath)}</span>
      </span>
    `;

    card.addEventListener("click", () => {
      context.events.emit("edison.message", { text: `Drag '${model.title}' into Scene View to place it.` });
    });
    card.addEventListener("dragstart", (event) => {
      if (!event.dataTransfer) {
        return;
      }

      writeEdisonModelAssetDragData(event.dataTransfer, model);
      card.classList.add("is-dragging");
      context.events.emit("edison.message", { text: `Drop '${model.title}' into Scene View.` });
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
    });

    void this.thumbnailService.getThumbnail(model.rawModelPath).then((thumbnailUrl) => {
      if (this.renderToken !== token || !thumbnailUrl || !card.isConnected) {
        return;
      }

      const thumbnail = card.querySelector<HTMLElement>("[data-model-thumb]");
      if (!thumbnail) {
        return;
      }

      thumbnail.style.backgroundImage = `url("${thumbnailUrl}")`;
      thumbnail.classList.add("is-ready");
    });

    return card;
  }

  private filterModels(models: readonly EdisonModelAssetOption[]): readonly EdisonModelAssetOption[] {
    const query = this.searchQuery.trim().toLowerCase();
    return models.filter((model) => {
      if (this.activeCategory !== "all" && model.category !== this.activeCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        model.title,
        model.relativePath,
        model.category,
        model.objectType,
        ...model.tags
      ].some((value) => value.toLowerCase().includes(query));
    });
  }

  private refreshResults(host: HTMLElement, context: EdisonPluginContext): void {
    const token = ++this.renderToken;
    const models = this.catalog.getModelOptions();
    const filteredModels = this.filterModels(models);
    const counter = host.querySelector<HTMLElement>("[data-model-count]");
    if (counter) {
      counter.textContent = `${filteredModels.length} visible / ${models.length} total`;
    }

    const currentContent = host.querySelector(".edison-models-content");
    const nextContent = this.renderContent(filteredModels, token, context);
    if (currentContent) {
      currentContent.replaceWith(nextContent);
    } else {
      host.appendChild(nextContent);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return character;
    }
  });
}
