const manifest = {
  id: "sillyrpg.terrain-tools",
  name: "Terrain Tools",
  version: "0.1.14",
  author: "SillyRPG",
  description: "Procedural terrain generation, sculpting, and texture paint for Edison.",
  entry: "dist/index.js",
  edisonApiVersion: "1"
};

const STYLE_ID = "sillyrpg-terrain-tools-css";
const DEFAULT_TERRAIN_ID = "terrain-0";
const DEFAULT_TERRAIN_SIZE = [80, 80];
const DEFAULT_GRID_STEP = 1;
const DEFAULT_PRESET = "urban-pad";
const MIN_RESOLUTION = 9;
const MAX_RESOLUTION = 513;
const TEXTURE_PREVIEW_PIXELS_PER_WORLD_UNIT = 12;
const TEXTURE_RUNTIME_PIXELS_PER_WORLD_UNIT = 32;
const TEXTURE_MIN_BAKE_RESOLUTION = 1024;
const TEXTURE_PREVIEW_MAX_BAKE_RESOLUTION = 2048;
const TEXTURE_RUNTIME_MAX_BAKE_RESOLUTION = 4096;
const TEXTURE_PAINT_STRENGTH_SCALE = 0.1;
const LAYER_SAMPLE_SIZE = 256;
const WORLD_VERTICAL_TILE_SIZE = 1;
const WORLD_GRID_ORIGIN_Y = 0;
const layerImageCache = new Map();

const TERRAIN_TEXTURE_LAYERS = [
  "dirt_1.png",
  "dirt_2.png",
  "dirt_3.png",
  "dirt snow.png",
  "g_pal_00_color.png",
  "grass (2).png",
  "grass_1.png",
  "grass_3.png",
  "grass_4.png",
  "grass_5.png",
  "grass snow.png",
  "ice.png",
  "leaves.png",
  "leaves snow.png",
  "road.png",
  "road dirt.png",
  "road sand.png",
  "road snow.png",
  "snow.png"
].map((filename) => {
  const id = filename.replace(/\.png$/i, "");
  return {
    id,
    label: toReadableLabel(id),
    url: terrainTextureUrl(filename)
  };
});

const DEFAULT_HEIGHT_BANDS = [
  { id: "low", label: "Low", minHeight: -160, maxHeight: -8, color: "#475D52" },
  { id: "mid", label: "Mid", minHeight: -8, maxHeight: 24, color: "#6E7B57" },
  { id: "high", label: "High", minHeight: 24, maxHeight: 72, color: "#7A746D" },
  { id: "peak", label: "Peak", minHeight: 72, maxHeight: 220, color: "#C8CBCB" }
];

const ISLAND_HEIGHT_BANDS = [
  { id: "shore", label: "Shore", minHeight: -160, maxHeight: 0, color: "#4D6970" },
  { id: "low", label: "Low", minHeight: 0, maxHeight: 14, color: "#73805A" },
  { id: "high", label: "High", minHeight: 14, maxHeight: 40, color: "#8A846F" },
  { id: "peak", label: "Peak", minHeight: 40, maxHeight: 180, color: "#D0D2D0" }
];

const COLOR_PRESETS = {
  natural: {
    label: "Natural",
    color: "#7E8770",
    bands: DEFAULT_HEIGHT_BANDS
  },
  island: {
    label: "Island",
    color: "#6D806B",
    bands: ISLAND_HEIGHT_BANDS
  },
  rocky: {
    label: "Rocky",
    color: "#85817A",
    bands: [
      { id: "soil", label: "Soil", minHeight: -160, maxHeight: 8, color: "#5F624D" },
      { id: "scrub", label: "Scrub", minHeight: 8, maxHeight: 28, color: "#777159" },
      { id: "stone", label: "Stone", minHeight: 28, maxHeight: 86, color: "#85817A" },
      { id: "peak", label: "Peak", minHeight: 86, maxHeight: 220, color: "#C5C5C0" }
    ]
  },
  snowline: {
    label: "Snowline",
    color: "#788477",
    bands: [
      { id: "low", label: "Low", minHeight: -160, maxHeight: 12, color: "#536B4F" },
      { id: "grass", label: "Grass", minHeight: 12, maxHeight: 36, color: "#74845D" },
      { id: "rock", label: "Rock", minHeight: 36, maxHeight: 76, color: "#817D76" },
      { id: "snow", label: "Snow", minHeight: 76, maxHeight: 240, color: "#D8DEDD" }
    ]
  }
};

const PRESETS = [
  {
    id: "flat-gray",
    label: "Flat Gray",
    description: "Very small variation for placement-heavy scenes.",
    strategy: "flat",
    generator: {
      preset: "flat-gray",
      strategy: "flat",
      seed: 101,
      height: { base: 0, amplitude: 0.18, frequency: 0.14, octaves: 2, persistence: 0.35, lacunarity: 2 },
      falloff: { enabled: false, mode: "none", radius: 0.8, strength: 0 },
      shaping: { flattenCenter: false, centerRadius: 0.4, terraceSteps: 0, smoothPasses: 1 }
    },
    material: { kind: "flat", color: "#8D9298" }
  },
  {
    id: "soft-hills",
    label: "Soft Hills",
    description: "Gentle rolling hills with smooth slopes.",
    strategy: "noise",
    generator: {
      preset: "soft-hills",
      strategy: "noise",
      seed: 204,
      height: { base: 0, amplitude: 14, frequency: 0.034, octaves: 4, persistence: 0.48, lacunarity: 2.1 },
      falloff: { enabled: false, mode: "none", radius: 0.75, strength: 0 },
      shaping: { flattenCenter: false, centerRadius: 0.42, terraceSteps: 0, smoothPasses: 1 }
    },
    material: { kind: "heightBands", color: "#7E8770", bands: DEFAULT_HEIGHT_BANDS }
  },
  {
    id: "island-plateau",
    label: "Island Plateau",
    description: "Usable center with falling edges around the perimeter.",
    strategy: "islandPlateau",
    generator: {
      preset: "island-plateau",
      strategy: "islandPlateau",
      seed: 307,
      height: { base: 0.15, amplitude: 24, frequency: 0.028, octaves: 5, persistence: 0.52, lacunarity: 2.2 },
      falloff: { enabled: true, mode: "island", radius: 0.62, strength: 0.92 },
      shaping: { flattenCenter: true, centerRadius: 0.3, terraceSteps: 0, smoothPasses: 1 }
    },
    material: { kind: "heightBands", color: "#7E8770", bands: ISLAND_HEIGHT_BANDS }
  },
  {
    id: "rocky-ridges",
    label: "Rocky Ridges",
    description: "Sharper height changes and more dramatic ridges.",
    strategy: "rockyRidges",
    generator: {
      preset: "rocky-ridges",
      strategy: "rockyRidges",
      seed: 409,
      height: { base: 0, amplitude: 32, frequency: 0.026, octaves: 5, persistence: 0.44, lacunarity: 2.1 },
      falloff: { enabled: false, mode: "none", radius: 0.72, strength: 0 },
      shaping: { flattenCenter: false, centerRadius: 0.2, terraceSteps: 0, smoothPasses: 2 }
    },
    material: { kind: "heightBands", color: "#8F8A82", bands: DEFAULT_HEIGHT_BANDS }
  },
  {
    id: "urban-pad",
    label: "Urban Pad",
    description: "Mostly flat center with mild edge breakup for city blocks.",
    strategy: "urbanPad",
    generator: {
      preset: "urban-pad",
      strategy: "urbanPad",
      seed: 503,
      height: { base: 0, amplitude: 4, frequency: 0.026, octaves: 3, persistence: 0.4, lacunarity: 2 },
      falloff: { enabled: true, mode: "edgeFade", radius: 0.8, strength: 0.45 },
      shaping: { flattenCenter: true, centerRadius: 0.48, terraceSteps: 0, smoothPasses: 2 }
    },
    material: { kind: "flat", color: "#8D9298" }
  },
  {
    id: "mountains",
    label: "Mountains",
    description: "Large mountain chains with deep valleys and sharp peaks.",
    strategy: "mountains",
    generator: {
      preset: "mountains",
      strategy: "mountains",
      seed: 611,
      height: { base: 4, amplitude: 58, frequency: 0.015, octaves: 5, persistence: 0.42, lacunarity: 2 },
      falloff: { enabled: false, mode: "none", radius: 0.72, strength: 0 },
      shaping: { flattenCenter: false, centerRadius: 0.18, terraceSteps: 0, smoothPasses: 3 }
    },
    material: { kind: "heightBands", color: "#7D7A76", bands: DEFAULT_HEIGHT_BANDS }
  }
];

class TerrainBrushPreview {
  constructor(context, getBrush) {
    this.context = context;
    this.getBrush = getBrush;
    this.element = null;
    this.innerElement = null;
    this.canvas = null;
    this.lastPoint = null;
    this.lastClientPoint = null;
    this.active = false;
    this.onPointerLeave = () => this.hide();
  }

  setActive(active) {
    this.active = active;
    if (!active) {
      this.hide();
      return;
    }
    if (!this.context.viewport.setTerrainBrushPreview) {
      this.ensureElement();
    }
    this.refresh();
  }

  updateFromPointer(event) {
    if (!this.active) {
      return;
    }
    const point = this.context.viewport.pickGroundPoint(event.clientX, event.clientY);
    this.lastClientPoint = { x: event.clientX, y: event.clientY };
    if (!point) {
      this.hide();
      return;
    }
    this.lastPoint = point;
    this.renderAtPoint(point);
  }

  refresh() {
    if (!this.active || !this.lastPoint) {
      return;
    }
    this.renderAtPoint(this.lastPoint);
  }

  dispose() {
    this.context.viewport.clearTerrainBrushPreview?.();
    if (this.canvas) {
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas = null;
    }
    this.element?.remove();
    this.element = null;
    this.innerElement = null;
    this.lastPoint = null;
    this.lastClientPoint = null;
  }

  ensureElement() {
    const canvas = this.context.viewport.getCanvas?.() ?? document.querySelector("canvas");
    const parent = canvas?.parentElement;
    if (!canvas || !parent) {
      return false;
    }

    if (this.canvas !== canvas) {
      this.canvas?.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas = canvas;
      this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    }

    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "terrain-brush-preview";
      this.innerElement = document.createElement("div");
      this.innerElement.className = "terrain-brush-preview__inner";
      this.element.appendChild(this.innerElement);
    }

    if (this.element.parentElement !== parent) {
      parent.appendChild(this.element);
    }

    return true;
  }

  renderAtPoint(point) {
    const brush = this.getBrush();
    if (this.context.viewport.setTerrainBrushPreview) {
      this.context.viewport.setTerrainBrushPreview({
        center: point,
        radius: brush.radius,
        shape: brush.shape === "square" ? "square" : "circle",
        falloff: brush.falloff
      });
      return;
    }

    if (!this.ensureElement() || !this.element) {
      return;
    }

    const projected = this.context.viewport.projectWorldPoint?.(point) ?? this.lastClientPoint;
    const parentRect = this.element.parentElement?.getBoundingClientRect();
    if (!projected || !parentRect) {
      this.hide();
      return;
    }

    const radiusPx = this.measureScreenRadius(point, projected, brush.radius);
    const diameter = Math.max(8, radiusPx * 2);
    const falloffScale = clamp(1 - brush.falloff, 0.08, 0.94);
    this.element.hidden = false;
    this.element.dataset.shape = brush.shape === "square" ? "square" : "circle";
    this.element.style.width = `${diameter}px`;
    this.element.style.height = `${diameter}px`;
    this.element.style.left = `${projected.x - parentRect.left}px`;
    this.element.style.top = `${projected.y - parentRect.top}px`;
    this.element.style.borderRadius = brush.shape === "square" ? "4px" : "50%";
    if (this.innerElement) {
      this.innerElement.style.width = `${diameter * falloffScale}px`;
      this.innerElement.style.height = `${diameter * falloffScale}px`;
      this.innerElement.style.borderRadius = brush.shape === "square" ? "3px" : "50%";
    }
  }

  measureScreenRadius(point, projectedCenter, worldRadius) {
    if (!this.context.viewport.projectWorldPoint) {
      return Math.max(10, worldRadius * 4);
    }

    const candidates = [
      this.context.viewport.projectWorldPoint({ x: point.x + worldRadius, y: point.y, z: point.z }),
      this.context.viewport.projectWorldPoint({ x: point.x - worldRadius, y: point.y, z: point.z }),
      this.context.viewport.projectWorldPoint({ x: point.x, y: point.y, z: point.z + worldRadius }),
      this.context.viewport.projectWorldPoint({ x: point.x, y: point.y, z: point.z - worldRadius })
    ].filter(Boolean);
    let radius = 0;
    for (const candidate of candidates) {
      radius = Math.max(radius, Math.hypot(candidate.x - projectedCenter.x, candidate.y - projectedCenter.y));
    }
    return clamp(radius, 6, 700);
  }

  hide() {
    this.context.viewport.clearTerrainBrushPreview?.();
    if (this.element) {
      this.element.hidden = true;
    }
  }
}

class TerrainToolsPluginRuntime {
  constructor() {
    this.context = null;
    this.disposers = [];
    this.draft = null;
    this.draftDirty = false;
    this.appliedTerrainSignature = "none";
    this.activeTab = "generate";
    this.activeColorPreset = "natural";
    this.activeBrushTool = "raise";
    this.activeTextureLayerId = TERRAIN_TEXTURE_LAYERS[0]?.id ?? "";
    this.textureSplatMap = null;
    this.textureSplatSignature = "none";
    this.textureMapLoadPromise = null;
    this.textureMapLoadToken = null;
    this.textureRuntimeBakeJobId = 0;
    this.textureSaveBakeRequired = false;
    this.activeStroke = null;
    this.lastStrokeRefreshAt = 0;
    this.brushPreview = null;
    this.message = "Generate terrain or recolor the current generated terrain.";
    this.brush = {
      shape: "circle",
      radius: 4,
      strength: 10,
      falloff: 0.65,
      targetHeight: 0,
      snapHeightStep: 1
    };
  }

  activate(context) {
    this.context = context;
    this.brushPreview = new TerrainBrushPreview(context, () => this.brush);
    ensureStyle();
    this.disposers.push(
      context.commands.register({
        id: "sillyrpg.terrainTools.open",
        title: "Open Terrain Tools",
        execute: () => {
          this.message = "Terrain Tools are available in the right plugin panel.";
          context.events.emit("edison.message", { text: this.message });
        }
      }),
      context.commands.register({
        id: "sillyrpg.terrainTools.generate",
        title: "Generate Terrain",
        execute: () => this.generateAndApply()
      }),
      context.commands.register({
        id: "sillyrpg.terrainTools.randomize",
        title: "Randomize Terrain Seed",
        execute: () => this.randomizeAndGenerate()
      }),
      context.toolbar.registerButton({
        id: "sillyrpg.terrainTools.toolbar",
        title: "Terrain",
        icon: "terrain",
        order: 220,
        commandId: "sillyrpg.terrainTools.open"
      }),
      context.tools.registerTool({
        id: "sillyrpg.terrainTools.brush",
        title: "Terrain Brush",
        icon: "brush",
        cursor: "crosshair",
        order: 50,
        activate: () => {
          this.brushPreview?.setActive(true);
          this.message = "Terrain Brush active. Drag over generated terrain to sculpt.";
          context.events.emit("edison.message", { text: this.message });
        },
        deactivate: () => {
          this.brushPreview?.setActive(false);
          this.activeStroke = null;
        },
        onPointerDown: ({ nativeEvent }, toolContext) => this.handleBrushDown(nativeEvent, toolContext),
        onPointerMove: ({ nativeEvent }, toolContext) => this.handleBrushMove(nativeEvent, toolContext),
        onPointerUp: ({ nativeEvent }, toolContext) => this.handleBrushUp(nativeEvent, toolContext)
      }),
      context.panels.registerPanel({
        id: "sillyrpg.terrainTools.panel",
        title: "Terrain Tools",
        slot: "right.plugins",
        order: 100,
        render: (host) => this.render(host)
      }),
      context.events.on("edison.document.changed", () => {
        this.syncDraftFromDocument();
      })
    );
    const unregisterSaveParticipant = context.scene.registerSaveParticipant?.({
      id: "sillyrpg.terrainTools.textureBake",
      title: "Baking terrain texture",
      prepare: (saveContext) => this.prepareTextureAssetsForSave(saveContext)
    });
    if (unregisterSaveParticipant) {
      this.disposers.push(unregisterSaveParticipant);
    }
    this.syncDraftFromDocument();
  }

  deactivate() {
    this.brushPreview?.dispose();
    this.brushPreview = null;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.context = null;
  }

  ensureDraft() {
    if (!this.draft) {
      this.syncDraftFromDocument(true);
    }
  }

  syncDraftFromDocument(force = false) {
    const descriptor = this.context?.scene.getSnapshot().descriptor;
    const terrain = descriptor?.terrain;
    const nextSignature = terrainSignature(terrain);

    if (!force && this.draftDirty && nextSignature === this.appliedTerrainSignature) {
      return;
    }

    if (!force && this.draft && nextSignature === this.appliedTerrainSignature) {
      return;
    }

    if (terrain?.kind === "generated") {
      this.draft = normalizeDescriptor(clone(terrain));
      this.appliedTerrainSignature = nextSignature;
      this.draftDirty = false;
      this.prepareTextureMapForTerrain(terrain);
      return;
    }

    this.textureSplatMap = null;
    this.textureSplatSignature = "none";
    this.textureMapLoadPromise = null;
    this.textureMapLoadToken = null;
    this.textureSaveBakeRequired = false;
    this.draft = normalizeDescriptor(createDescriptorFromPreset(DEFAULT_PRESET, {
      id: terrain?.id ?? DEFAULT_TERRAIN_ID,
      size: terrain?.size ?? DEFAULT_TERRAIN_SIZE,
      position: terrain?.position ?? [0, 0, 0],
      rotation: terrain?.rotation ?? [0, 0, 0],
      scale: terrain?.scale ?? [1, 1, 1]
    }));
    this.appliedTerrainSignature = nextSignature;
    this.draftDirty = false;
  }

  render(host) {
    this.ensureDraft();
    const snapshot = this.context?.scene.getSnapshot();
    if (!snapshot?.descriptor || !this.draft) {
      host.innerHTML = `<div class="terrain-tools-empty">Load a scene before using Terrain Tools.</div>`;
      return;
    }

    const field = generateHeightField(this.draft);
    const stats = computeStats(field);
    host.innerHTML = `
      <div class="terrain-tools">
        <div class="terrain-tools-tabs">
          <button type="button" data-tab="generate" class="${this.activeTab === "generate" ? "is-active" : ""}">Generate</button>
          <button type="button" data-tab="paint" class="${this.activeTab === "paint" ? "is-active" : ""}">Color</button>
          <button type="button" data-tab="brush" class="${this.activeTab === "brush" ? "is-active" : ""}">Brush</button>
        </div>
        ${this.renderStatus(stats)}
        ${this.activeTab === "generate" ? this.renderGenerateTab() : ""}
        ${this.activeTab === "paint" ? this.renderPaintTab() : ""}
        ${this.activeTab === "brush" ? this.renderBrushTab() : ""}
        <div class="terrain-tools-message">${escapeHtml(this.message)}</div>
      </div>
    `;
    this.bindPanel(host);
  }

  renderStatus(stats) {
    const terrain = this.context?.scene.getSnapshot().descriptor?.terrain;
    const applied = terrain?.kind === "generated"
      ? `${terrain.generator.preset} ${terrain.resolution[0]}x${terrain.resolution[1]}`
      : terrain
        ? terrain.kind
        : "none";
    const draft = this.draft
      ? `${this.draft.generator.preset} ${this.draft.resolution[0]}x${this.draft.resolution[1]}${this.draftDirty ? " *" : ""}`
      : "none";
    return `
      <div class="terrain-tools-card terrain-tools-status">
        <span>Applied: ${escapeHtml(applied)}</span>
        <span>Draft: ${escapeHtml(draft)}</span>
        <span>Heights: ${stats.minHeight.toFixed(1)} ... ${stats.maxHeight.toFixed(1)}m</span>
        <span>Vertices: ${stats.vertexCount.toLocaleString()}</span>
      </div>
    `;
  }

  renderGenerateTab() {
    const presetOptions = PRESETS.map((preset) => {
      const selected = this.draft.generator.preset === preset.id ? " selected" : "";
      return `<option value="${escapeHtml(preset.id)}"${selected}>${escapeHtml(preset.label)}</option>`;
    }).join("");
    const falloff = this.draft.generator.falloff ?? { enabled: false, mode: "none", radius: 0.8, strength: 0 };
    const shaping = this.draft.generator.shaping ?? {};
    const sourceQuadSize = resolveSourceQuadSize(this.draft);
    return `
      <div class="terrain-tools-card">
        <label class="terrain-tools-field">
          <span>Preset</span>
          <select data-field="preset">${presetOptions}</select>
        </label>
        <div class="terrain-tools-actions">
          <button type="button" data-action="generate">Generate</button>
          <button type="button" data-action="randomize">Randomize</button>
          <button type="button" data-action="flatten">Flatten</button>
        </div>
      </div>
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Size & Resolution</div>
        ${numberField("width", "Width", this.draft.size[0], 1, 512, 1)}
        ${numberField("depth", "Depth", this.draft.size[1], 1, 512, 1)}
        ${numberField("gridStep", "Grid step", this.draft.terrainGridStep ?? DEFAULT_GRID_STEP, 0.25, 16, 0.25)}
        ${numberField("resolutionX", "Resolution X", this.draft.resolution[0], MIN_RESOLUTION, MAX_RESOLUTION, 2, true)}
        ${numberField("resolutionZ", "Resolution Z", this.draft.resolution[1], MIN_RESOLUTION, MAX_RESOLUTION, 2, true)}
      </div>
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Source Grid</div>
        <div class="terrain-tools-message">Quad size: ${sourceQuadSize[0].toFixed(2)} x ${sourceQuadSize[1].toFixed(2)} world units.</div>
        <div class="terrain-tools-message">Resolution follows Grid step; one gameplay grid cell is 1 world unit.</div>
      </div>
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Noise</div>
        ${numberField("seed", "Seed", this.draft.generator.seed, 0, 2147483647, 1)}
        ${numberField("base", "Base", this.draft.generator.height.base, -100, 100, 1)}
        ${numberField("amplitude", "Amplitude", this.draft.generator.height.amplitude, 0, 200, 1)}
        ${numberField("frequency", "Frequency", this.draft.generator.height.frequency, 0.001, 0.2, 0.001)}
        ${numberField("octaves", "Octaves", this.draft.generator.height.octaves, 1, 8, 1)}
        ${numberField("persistence", "Persistence", this.draft.generator.height.persistence, 0, 1, 0.01)}
        ${numberField("lacunarity", "Lacunarity", this.draft.generator.height.lacunarity, 1, 5, 0.05)}
      </div>
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Shape</div>
        ${checkboxField("falloffEnabled", "Falloff", falloff.enabled)}
        ${selectField("falloffMode", "Mode", falloff.mode, [
          ["none", "None"],
          ["island", "Island"],
          ["centerPlateau", "Center Plateau"],
          ["edgeFade", "Edge Fade"]
        ])}
        ${numberField("falloffRadius", "Radius", falloff.radius, 0, 1, 0.01)}
        ${numberField("falloffStrength", "Strength", falloff.strength, 0, 1, 0.01)}
        ${checkboxField("flattenCenter", "Flatten center", Boolean(shaping.flattenCenter))}
        ${numberField("centerRadius", "Center radius", shaping.centerRadius ?? 0.35, 0, 1, 0.01)}
        ${numberField("smoothPasses", "Smooth passes", shaping.smoothPasses ?? 0, 0, 12, 1)}
        ${numberField("terraceSteps", "Terrace steps", shaping.terraceSteps ?? 0, 0, 64, 1)}
      </div>
    `;
  }

  renderPaintTab() {
    const material = resolveHeightBandMaterial(this.draft.material);
    const presetOptions = Object.entries(COLOR_PRESETS).map(([id, preset]) => {
      const selected = id === this.activeColorPreset ? " selected" : "";
      return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(preset.label)}</option>`;
    }).join("");
    const bandRows = material.bands.map((band, index) => `
      <div class="terrain-tools-band">
        <input type="color" data-band-color="${index}" value="${escapeHtml(band.color)}" title="${escapeHtml(band.label)}">
        <span>${escapeHtml(band.label)}</span>
        <input type="number" data-band-min="${index}" value="${band.minHeight}" step="1">
        <input type="number" data-band-max="${index}" value="${band.maxHeight}" step="1">
      </div>
    `).join("");
    return `
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Height Color Bands</div>
        <label class="terrain-tools-field">
          <span>Palette</span>
          <select data-field="colorPreset">${presetOptions}</select>
        </label>
        <label class="terrain-tools-field">
          <span>Base color</span>
          <input type="color" data-field="materialColor" value="${escapeHtml(material.color ?? "#7E8770")}">
        </label>
        <div class="terrain-tools-band-head">
          <span></span><span>Band</span><span>Min</span><span>Max</span>
        </div>
        ${bandRows}
        <div class="terrain-tools-actions">
          <button type="button" data-action="apply-colors">Apply Colors</button>
          <button type="button" data-action="flat-color">Flat Color</button>
        </div>
      </div>
    `;
  }

  renderBrushTab() {
    return `
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Terrain Brush</div>
        <div class="terrain-tools-actions terrain-tools-actions-grid">
          ${toolButton("raise", "Raise", this.activeBrushTool)}
          ${toolButton("lower", "Lower", this.activeBrushTool)}
          ${toolButton("smooth", "Smooth", this.activeBrushTool)}
          ${toolButton("flatten", "Flatten", this.activeBrushTool)}
          ${toolButton("flattenToHeight", "Flatten To Height", this.activeBrushTool)}
          ${toolButton("paintTexture", "Paint Texture", this.activeBrushTool)}
        </div>
        <div class="terrain-tools-actions">
          <button type="button" data-action="clear-height-edits">Clear Height Edits</button>
          <button type="button" data-action="clear-texture-paint">Clear Texture Paint</button>
        </div>
      </div>
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Brush Settings</div>
        ${selectField("brushShape", "Shape", this.brush.shape, [["circle", "Circle"], ["square", "Square"]])}
        ${sliderField("brushRadius", "Size", this.brush.radius, 0.5, 100, 0.5)}
        ${sliderField("brushStrength", "Strength", this.brush.strength, 0.1, 100, 0.5)}
        ${sliderField("brushFalloff", "Falloff", this.brush.falloff, 0, 1, 0.05)}
        ${sliderField("targetHeight", "Target height", this.brush.targetHeight, -200, 200, 1)}
      </div>
      ${this.renderTexturePalette()}
    `;
  }

  renderTexturePalette() {
    const tiles = TERRAIN_TEXTURE_LAYERS.map((layer, index) => `
      <button
        type="button"
        class="terrain-tools-texture-tile${layer.id === this.activeTextureLayerId ? " is-active" : ""}"
        data-texture-layer="${escapeHtml(layer.id)}"
        title="${escapeHtml(layer.label)}"
      >
        <span class="terrain-tools-texture-swatch" style="background-image: url('${escapeHtml(layer.url)}')"></span>
        <span>${escapeHtml(layer.label)}</span>
      </button>
    `).join("");
    return `
      <div class="terrain-tools-card">
        <div class="terrain-tools-card-title">Texture Paint</div>
        <div class="terrain-tools-texture-grid">${tiles}</div>
      </div>
    `;
  }

  bindPanel(host) {
    host.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeTab = button.dataset.tab ?? "generate";
        if (this.activeTab === "brush") {
          this.activateBrushTool();
        }
        this.render(host);
      });
    });
    host.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        this.readDraftFromHost(host);
        this.syncGeneratedResolutionFields(host);
        this.readBrushFromHost(host);
        this.refreshSliderOutputs(host);
        this.brushPreview?.refresh();
      });
      input.addEventListener("change", () => {
        this.readDraftFromHost(host);
        this.syncGeneratedResolutionFields(host);
        this.readBrushFromHost(host);
        this.refreshSliderOutputs(host);
        this.brushPreview?.refresh();
        if (input.dataset.field === "preset") {
          this.selectPreset(input.value, host);
        }
        if (input.dataset.field === "colorPreset") {
          this.selectColorPreset(input.value, host);
        }
      });
    });
    host.querySelectorAll("[data-band-color], [data-band-min], [data-band-max]").forEach((input) => {
      input.addEventListener("input", () => this.readColorBandsFromHost(host));
      input.addEventListener("change", () => this.readColorBandsFromHost(host));
    });
    host.querySelectorAll("[data-brush-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeBrushTool = button.dataset.brushTool ?? "raise";
        this.activateBrushTool();
        this.render(host);
      });
    });
    host.querySelectorAll("[data-texture-layer]").forEach((button) => {
      button.addEventListener("click", () => {
        this.activeTextureLayerId = button.dataset.textureLayer ?? this.activeTextureLayerId;
        this.activeBrushTool = "paintTexture";
        this.activateBrushTool();
        this.message = `Texture selected: ${this.getActiveTextureLayer().label}.`;
        this.render(host);
      });
    });
    host.querySelector("[data-action='generate']")?.addEventListener("click", () => {
      this.readDraftFromHost(host);
      void this.runAction("Generating terrain...", () => this.generateAndApply(), host);
    });
    host.querySelector("[data-action='randomize']")?.addEventListener("click", () => {
      this.readDraftFromHost(host);
      void this.runAction("Generating randomized terrain...", () => this.randomizeAndGenerate(), host);
    });
    host.querySelector("[data-action='flatten']")?.addEventListener("click", () => {
      void this.runAction("Generating flat terrain...", () => this.flattenAndApply(), host);
    });
    host.querySelector("[data-action='apply-colors']")?.addEventListener("click", () => {
      this.readColorBandsFromHost(host);
      void this.runAction("Applying terrain colors...", () => this.applyColors(), host);
    });
    host.querySelector("[data-action='flat-color']")?.addEventListener("click", () => {
      void this.runAction("Applying flat terrain color...", () => this.applyFlatColor(host), host);
    });
    host.querySelector("[data-action='clear-height-edits']")?.addEventListener("click", () => {
      void this.runAction("Clearing terrain height edits...", () => this.clearHeightEdits(), host);
    });
    host.querySelector("[data-action='clear-texture-paint']")?.addEventListener("click", () => {
      void this.runAction("Clearing terrain texture paint...", () => this.clearTexturePaint(), host);
    });
    this.refreshSliderOutputs(host);
    if (this.activeTab === "brush") {
      this.activateBrushTool();
    }
  }

  activateBrushTool() {
    if (!this.context) {
      return;
    }
    if (this.context.tools.getActiveToolId?.() !== "sillyrpg.terrainTools.brush") {
      this.context.tools.setActiveTool("sillyrpg.terrainTools.brush");
    } else {
      this.brushPreview?.setActive(true);
    }
  }

  refreshSliderOutputs(host) {
    host.querySelectorAll("[data-output-for]").forEach((output) => {
      const field = output.dataset.outputFor;
      const input = field ? host.querySelector(`[data-field='${field}']`) : null;
      if (input) {
        output.textContent = formatSliderValue(input.value);
      }
    });
  }

  async runAction(startMessage, action, host = null) {
    if (!this.context) {
      return;
    }
    this.message = startMessage;
    this.context.events.emit("edison.message", { text: startMessage });
    try {
      await action();
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
      console.error("[Terrain Tools]", error);
      this.context.events.emit("edison.message", { text: `Terrain Tools: ${this.message}` });
    } finally {
      if (host?.isConnected) {
        this.render(host);
      }
    }
  }

  selectPreset(presetId, host) {
    const current = this.draft;
    const next = createDescriptorFromPreset(presetId, {
      id: current?.id ?? DEFAULT_TERRAIN_ID,
      size: current?.size ?? DEFAULT_TERRAIN_SIZE,
      position: current?.position ?? [0, 0, 0],
      rotation: current?.rotation ?? [0, 0, 0],
      scale: current?.scale ?? [1, 1, 1],
      terrainGridStep: current?.terrainGridStep ?? DEFAULT_GRID_STEP
    });
    this.draft = normalizeDescriptor({
      ...next,
      editedHeightMap: undefined,
      editedTextureMap: undefined,
      generator: {
        ...next.generator,
        seed: current?.generator?.seed ?? next.generator.seed
      }
    });
    this.draftDirty = true;
    this.message = `Preset selected: ${getPreset(presetId).label}.`;
    this.render(host);
  }

  selectColorPreset(presetId, host) {
    const preset = COLOR_PRESETS[presetId] ?? COLOR_PRESETS.natural;
    this.activeColorPreset = presetId in COLOR_PRESETS ? presetId : "natural";
    this.draft = {
      ...this.draft,
      material: clone({ kind: "heightBands", color: preset.color, bands: preset.bands })
    };
    this.draftDirty = true;
    this.message = `Color palette selected: ${preset.label}.`;
    this.render(host);
  }

  readDraftFromHost(host) {
    if (!this.draft) {
      return;
    }
    if (!host.querySelector("[data-field='preset'], [data-field='width'], [data-field='materialColor'], [data-field='colorPreset']")) {
      return;
    }
    const hasGeneratorFields = Boolean(host.querySelector("[data-field='preset'], [data-field='width']"));
    const readNumber = (field, fallback) => {
      const input = host.querySelector(`[data-field='${field}']`);
      const value = Number.parseFloat(input?.value ?? "");
      return Number.isFinite(value) ? value : fallback;
    };
    const readString = (field, fallback) => host.querySelector(`[data-field='${field}']`)?.value ?? fallback;
    const readBool = (field, fallback) => {
      const input = host.querySelector(`[data-field='${field}']`);
      return input ? Boolean(input.checked) : fallback;
    };
    const preset = getPreset(readString("preset", this.draft.generator.preset));
    const size = [readNumber("width", this.draft.size[0]), readNumber("depth", this.draft.size[1])];
    const terrainGridStep = readNumber("gridStep", this.draft.terrainGridStep ?? DEFAULT_GRID_STEP);
    const gridLayout = resolveGridAlignedLayout(size, terrainGridStep);
    this.draft = normalizeDescriptor({
      ...this.draft,
      editedHeightMap: hasGeneratorFields ? undefined : this.draft.editedHeightMap,
      editedTextureMap: hasGeneratorFields ? undefined : this.draft.editedTextureMap,
      size: gridLayout.size,
      terrainGridStep: gridLayout.gridStep,
      resolutionMode: "gridStep",
      resolution: gridLayout.resolution,
      generator: {
        ...this.draft.generator,
        preset: preset.id,
        strategy: preset.strategy,
        seed: Math.round(readNumber("seed", this.draft.generator.seed)),
        height: {
          base: readNumber("base", this.draft.generator.height.base),
          amplitude: readNumber("amplitude", this.draft.generator.height.amplitude),
          frequency: readNumber("frequency", this.draft.generator.height.frequency),
          octaves: Math.round(readNumber("octaves", this.draft.generator.height.octaves)),
          persistence: readNumber("persistence", this.draft.generator.height.persistence),
          lacunarity: readNumber("lacunarity", this.draft.generator.height.lacunarity)
        },
        falloff: {
          enabled: readBool("falloffEnabled", this.draft.generator.falloff?.enabled ?? false),
          mode: readString("falloffMode", this.draft.generator.falloff?.mode ?? "none"),
          radius: readNumber("falloffRadius", this.draft.generator.falloff?.radius ?? 0.8),
          strength: readNumber("falloffStrength", this.draft.generator.falloff?.strength ?? 0)
        },
        shaping: {
          flattenCenter: readBool("flattenCenter", this.draft.generator.shaping?.flattenCenter ?? false),
          centerRadius: readNumber("centerRadius", this.draft.generator.shaping?.centerRadius ?? 0.35),
          smoothPasses: Math.round(readNumber("smoothPasses", this.draft.generator.shaping?.smoothPasses ?? 0)),
          terraceSteps: Math.round(readNumber("terraceSteps", this.draft.generator.shaping?.terraceSteps ?? 0))
        }
      }
    });
    this.draftDirty = true;
  }

  syncGeneratedResolutionFields(host) {
    if (!this.draft) {
      return;
    }
    const resolutionX = host.querySelector("[data-field='resolutionX']");
    const resolutionZ = host.querySelector("[data-field='resolutionZ']");
    if (resolutionX) {
      resolutionX.value = String(this.draft.resolution[0]);
    }
    if (resolutionZ) {
      resolutionZ.value = String(this.draft.resolution[1]);
    }
  }

  readBrushFromHost(host) {
    const readNumber = (field, fallback) => {
      const input = host.querySelector(`[data-field='${field}']`);
      const value = Number.parseFloat(input?.value ?? "");
      return Number.isFinite(value) ? value : fallback;
    };
    const readString = (field, fallback) => host.querySelector(`[data-field='${field}']`)?.value ?? fallback;
    this.brush = {
      shape: readString("brushShape", this.brush.shape) === "square" ? "square" : "circle",
      radius: clamp(readNumber("brushRadius", this.brush.radius), 0.5, 100),
      strength: clamp(readNumber("brushStrength", this.brush.strength), 0.1, 100),
      falloff: clamp(readNumber("brushFalloff", this.brush.falloff), 0, 1),
      targetHeight: clamp(readNumber("targetHeight", this.brush.targetHeight), -1000, 1000),
      snapHeightStep: this.brush.snapHeightStep
    };
  }

  readColorBandsFromHost(host) {
    if (!this.draft) {
      return;
    }
    const current = resolveHeightBandMaterial(this.draft.material);
    const bands = current.bands.map((band, index) => {
      const color = host.querySelector(`[data-band-color='${index}']`)?.value ?? band.color;
      const min = Number.parseFloat(host.querySelector(`[data-band-min='${index}']`)?.value ?? String(band.minHeight));
      const max = Number.parseFloat(host.querySelector(`[data-band-max='${index}']`)?.value ?? String(band.maxHeight));
      return {
        ...band,
        color,
        minHeight: Number.isFinite(min) ? min : band.minHeight,
        maxHeight: Number.isFinite(max) ? max : band.maxHeight
      };
    });
    const materialColor = host.querySelector("[data-field='materialColor']")?.value ?? current.color ?? "#7E8770";
    this.draft = {
      ...this.draft,
      material: {
        kind: "heightBands",
        color: materialColor,
        bands
      }
    };
    this.draftDirty = true;
  }

  async randomizeAndGenerate() {
    if (!this.draft) {
      return;
    }
    this.draft = {
      ...this.draft,
      editedHeightMap: undefined,
      editedTextureMap: undefined,
      generator: {
        ...this.draft.generator,
        seed: Math.floor(Math.random() * 2147483647)
      }
    };
    this.draftDirty = true;
    await this.generateAndApply("Generated randomized terrain.");
  }

  async flattenAndApply() {
    this.draft = normalizeDescriptor(createDescriptorFromPreset("flat-gray", {
      id: this.draft?.id ?? DEFAULT_TERRAIN_ID,
      size: this.draft?.size ?? DEFAULT_TERRAIN_SIZE,
      position: this.draft?.position ?? [0, 0, 0],
      rotation: this.draft?.rotation ?? [0, 0, 0],
      scale: this.draft?.scale ?? [1, 1, 1],
      terrainGridStep: this.draft?.terrainGridStep ?? DEFAULT_GRID_STEP
    }));
    this.draftDirty = true;
    await this.generateAndApply("Generated flat terrain.");
  }

  async generateAndApply(message = "Generated terrain applied.") {
    if (!this.context || !this.draft) {
      return;
    }
    const source = normalizeDescriptor({
      ...this.draft,
      editedHeightMap: undefined,
      editedTextureMap: undefined
    });
    const field = generateHeightField(source);
    const descriptor = {
      ...source,
      editedHeightMap: serializeHeightMap(field),
      editedTextureMap: undefined
    };
    this.resetTexturePaintState();
    await this.applyTerrainDescriptor(descriptor, message);
  }

  async applyColors() {
    if (!this.context || !this.draft) {
      return;
    }
    const terrain = this.getGeneratedTerrain();
    if (!terrain) {
      await this.generateAndApply("Generated terrain with height colors.");
      return;
    }
    const descriptor = {
      ...terrain,
      material: clone(this.draft.material ?? resolveHeightBandMaterial(null)),
      editedTextureMap: undefined
    };
    this.resetTexturePaintState();
    await this.applyTerrainDescriptor(descriptor, "Terrain colors applied.");
  }

  async applyFlatColor(host) {
    if (!this.context || !this.draft) {
      return;
    }
    const color = host.querySelector("[data-field='materialColor']")?.value ?? "#8D9298";
    const terrain = this.getGeneratedTerrain() ?? this.draft;
    this.resetTexturePaintState();
    await this.applyTerrainDescriptor({
      ...terrain,
      material: { kind: "flat", color },
      editedTextureMap: undefined
    }, "Flat terrain color applied.");
  }

  async clearHeightEdits() {
    const terrain = this.getGeneratedTerrain();
    if (!terrain || !this.context) {
      return;
    }
    const descriptor = {
      ...terrain,
      editedHeightMap: serializeHeightMap(generateHeightField({
        ...terrain,
        editedHeightMap: undefined
      }))
    };
    await this.applyTerrainDescriptor(descriptor, "Terrain height edits cleared.");
  }

  async clearTexturePaint() {
    const terrain = this.getGeneratedTerrain();
    if (!terrain || !this.context) {
      return;
    }

    this.resetTexturePaintState();
    const descriptor = {
      ...terrain,
      editedTextureMap: undefined,
      material: resolveHeightBandMaterial(this.draft?.material)
    };
    await this.applyTerrainDescriptor(descriptor, "Terrain texture paint cleared.");
  }

  resetTexturePaintState() {
    this.textureSplatMap = null;
    this.textureSplatSignature = "none";
    this.textureMapLoadPromise = null;
    this.textureMapLoadToken = null;
    this.textureRuntimeBakeJobId += 1;
  }

  getActiveTextureLayer() {
    return TERRAIN_TEXTURE_LAYERS.find((layer) => layer.id === this.activeTextureLayerId) ?? TERRAIN_TEXTURE_LAYERS[0];
  }

  prepareTextureMapForTerrain(terrain) {
    const signature = textureMapSignatureForTerrain(terrain);
    if (signature === this.textureSplatSignature) {
      return;
    }

    this.textureSplatMap = null;
    this.textureSplatSignature = signature;
    if (!terrain.editedTextureMap) {
      return;
    }

    const token = {};
    this.textureMapLoadToken = token;
    this.textureMapLoadPromise = loadTextureSplatMapFromDescriptor(terrain.editedTextureMap, TERRAIN_TEXTURE_LAYERS)
      .then((splatMap) => {
        if (this.textureMapLoadToken === token && this.textureSplatSignature === signature) {
          this.textureSplatMap = ensureSplatMapResolution(splatMap, terrain.resolution[0], terrain.resolution[1]);
          this.textureSaveBakeRequired = this.textureSaveBakeRequired || needsRuntimeTextureRebake(terrain);
        }
      })
      .catch((error) => {
        this.message = `Texture paint raw data could not be loaded. ${error instanceof Error ? error.message : String(error)}`;
        this.context?.events.emit("edison.message", { text: this.message });
      })
      .finally(() => {
        if (this.textureMapLoadToken === token && this.textureSplatSignature === signature) {
          this.textureMapLoadPromise = null;
          this.textureMapLoadToken = null;
        }
      });
  }

  ensureTextureSplatMap(terrain) {
    const signature = textureMapSignatureForTerrain(terrain);
    if (this.textureSplatSignature !== signature) {
      this.prepareTextureMapForTerrain(terrain);
    }
    if (this.textureMapLoadPromise && !this.textureSplatMap) {
      this.textureMapLoadToken = null;
      this.textureMapLoadPromise = null;
      this.message = "Started a fresh texture paint map for immediate editing.";
      this.context?.events.emit("edison.message", { text: this.message });
    }
    if (!this.textureSplatMap) {
      this.textureSplatMap = new TerrainSplatMap(terrain.resolution[0], terrain.resolution[1], TERRAIN_TEXTURE_LAYERS.length, 0);
      this.textureSplatSignature = signature;
    }
    this.textureSplatMap = ensureSplatMapResolution(this.textureSplatMap, terrain.resolution[0], terrain.resolution[1]);
    return this.textureSplatMap;
  }

  async applyTerrainDescriptor(descriptor, message, options = {}) {
    if (!this.context) {
      return;
    }
    const snapshot = this.context.scene.getSnapshot();
    if (!snapshot.option || !snapshot.descriptor) {
      this.message = "Load a scene before applying terrain.";
      this.context.events.emit("edison.message", { text: this.message });
      return;
    }
    if (options.saveAssets?.length) {
      this.context.scene.queueSaveAssets?.(options.saveAssets);
    }
    const nextDescriptor = this.context.scene.setTerrain(descriptor, message);
    const viewportDescriptor = options.previewTerrain
      ? { ...nextDescriptor, terrain: options.previewTerrain }
      : nextDescriptor;
    if (this.context.viewport.replaceTerrain) {
      await this.context.viewport.replaceTerrain(viewportDescriptor);
    } else {
      await this.context.viewport.loadScene(snapshot.option, viewportDescriptor);
    }
    this.draft = normalizeDescriptor(clone(descriptor));
    this.appliedTerrainSignature = terrainSignature(descriptor);
    this.draftDirty = false;
    this.message = message;
    this.context.events.emit("edison.message", { text: message });
  }

  getGeneratedTerrain() {
    const terrain = this.context?.scene.getSnapshot().descriptor?.terrain;
    return terrain?.kind === "generated" ? clone(terrain) : null;
  }

  handleBrushDown(event, context) {
    if (event.button !== 0 || event.altKey) {
      return false;
    }
    this.brushPreview?.updateFromPointer(event);
    const terrain = this.getGeneratedTerrain();
    if (!terrain) {
      this.message = "Generate terrain before sculpting.";
      context.events.emit("edison.message", { text: this.message });
      return false;
    }
    const point = context.viewport.pickGroundPoint(event.clientX, event.clientY);
    if (!point) {
      return false;
    }
    const textureSplatMap = this.activeBrushTool === "paintTexture"
      ? this.ensureTextureSplatMap(terrain)
      : null;
    if (this.activeBrushTool === "paintTexture" && !textureSplatMap) {
      return true;
    }
    this.activeStroke = {
      kind: this.activeBrushTool === "paintTexture" ? "texture" : "height",
      pointerId: event.pointerId,
      flattenHeight: point.y,
      field: this.activeBrushTool === "paintTexture" ? null : generateHeightField(terrain),
      splatMap: textureSplatMap?.clone() ?? null,
      descriptor: terrain,
      lastTimestamp: performance.now()
    };
    this.applyBrushAtPoint(point, 0.12);
    return true;
  }

  handleBrushMove(event, context) {
    this.brushPreview?.updateFromPointer(event);
    if (!this.activeStroke || this.activeStroke.pointerId !== event.pointerId) {
      return false;
    }
    const point = context.viewport.pickGroundPoint(event.clientX, event.clientY);
    if (!point) {
      return true;
    }
    const now = performance.now();
    const deltaTime = clamp((now - this.activeStroke.lastTimestamp) / 1000, 1 / 120, 0.2);
    this.activeStroke.lastTimestamp = now;
    this.applyBrushAtPoint(point, deltaTime);
    const refreshDelay = this.activeStroke.kind === "texture" ? 650 : 260;
    if (now - this.lastStrokeRefreshAt > refreshDelay) {
      this.lastStrokeRefreshAt = now;
      void this.commitStroke("Terrain brush applied.");
    }
    return true;
  }

  handleBrushUp(event) {
    if (!this.activeStroke || this.activeStroke.pointerId !== event.pointerId) {
      return false;
    }
    void this.commitStroke("Terrain brush applied.");
    this.activeStroke = null;
    return true;
  }

  applyBrushAtPoint(point, deltaTime) {
    if (!this.activeStroke) {
      return;
    }
    const terrain = this.activeStroke.descriptor;
    const center = worldPointToTerrainLocal(point, terrain);
    if (this.activeStroke.kind === "texture") {
      if (!this.activeStroke.splatMap) {
        return;
      }
      const layerIndex = TERRAIN_TEXTURE_LAYERS.findIndex((layer) => layer.id === this.activeTextureLayerId);
      paintTextureAtPoint(this.activeStroke.splatMap, {
        center,
        terrainWidth: terrain.size[0],
        terrainDepth: terrain.size[1],
        brush: this.brush,
        layerIndex: Math.max(0, layerIndex),
        deltaTime
      });
      return;
    }

    const field = this.activeStroke.field;
    if (!field) {
      return;
    }
    const settings = {
      tool: this.activeBrushTool,
      brush: this.brush,
      targetHeight: this.brush.targetHeight,
      snapHeightStep: this.brush.snapHeightStep
    };
    if (this.activeBrushTool === "raise") {
      this.activeStroke.field = applyHeightDelta(field, center, settings, Math.abs(this.brush.strength) * deltaTime);
    } else if (this.activeBrushTool === "lower") {
      this.activeStroke.field = applyHeightDelta(field, center, settings, -Math.abs(this.brush.strength) * deltaTime);
    } else if (this.activeBrushTool === "smooth") {
      this.activeStroke.field = smoothHeights(field, center, settings, deltaTime);
    } else if (this.activeBrushTool === "flatten") {
      this.activeStroke.field = flattenToHeight(field, center, settings, this.activeStroke.flattenHeight, deltaTime);
    } else {
      this.activeStroke.field = flattenToHeight(field, center, settings, this.brush.targetHeight, deltaTime);
    }
    this.activeStroke.field = quantizeField(this.activeStroke.field, this.brush.snapHeightStep);
  }

  async commitStroke(message) {
    if (!this.activeStroke || !this.context) {
      return;
    }
    if (this.activeStroke.kind === "texture") {
      await this.commitTextureStroke(message);
      return;
    }
    const descriptor = {
      ...this.activeStroke.descriptor,
      editedHeightMap: serializeHeightMap(this.activeStroke.field)
    };
    await this.applyTerrainDescriptor(descriptor, message);
    if (this.activeStroke) {
      this.activeStroke.descriptor = descriptor;
    }
  }

  async commitTextureStroke(message) {
    const stroke = this.activeStroke;
    if (!stroke?.splatMap || !this.context) {
      return;
    }

    const terrain = stroke.descriptor;
    const splatMap = stroke.splatMap.clone();
    normalizeWholeSplatMap(splatMap);
    const sceneId = sanitizeAssetSegment(this.context.scene.getSnapshot().descriptor?.id ?? "scene");
    const terrainId = sanitizeAssetSegment(terrain.id ?? DEFAULT_TERRAIN_ID);
    const bakedTexturePath = `assets/generated/terrain/${sceneId}/${terrainId}_albedo.png`;
    const previewResolution = resolveTexturePreviewBakeResolution(terrain.size[0], terrain.size[1]);
    const runtimeResolution = resolveTextureRuntimeBakeResolution(terrain.size[0], terrain.size[1]);
    const previewTextureCanvas = await bakeTextureMapToCanvas({
      splatMap,
      layers: TERRAIN_TEXTURE_LAYERS,
      terrainWidth: terrain.size[0],
      terrainDepth: terrain.size[1],
      outputResolution: previewResolution
    });
    const serialized = serializeTextureSplatMap({
      sceneId,
      terrainId,
      splatMap,
      layers: TERRAIN_TEXTURE_LAYERS,
      bakedTexturePath,
      bakeResolution: runtimeResolution
    });
    const savedTerrain = {
      ...terrain,
      material: {
        kind: "bakedTexture",
        texture: bakedTexturePath,
        color: "#FFFFFF"
      },
      editedTextureMap: serialized.editedTextureMap
    };
    this.textureSplatMap = splatMap.clone();
    this.textureSplatSignature = textureMapSignatureForTerrain(savedTerrain);
    this.textureMapLoadPromise = null;
    this.textureSaveBakeRequired = true;

    this.context.scene.queueSaveAssets?.(serialized.assets);
    const nextDescriptor = this.context.scene.setTerrain(savedTerrain, message);
    const previewApplied = this.context.viewport.applyTerrainTexturePaintPreview?.(nextDescriptor, previewTextureCanvas) === true;
    if (!previewApplied) {
      const bakedTextureDataUrl = previewTextureCanvas.toDataURL("image/png");
      const previewTerrain = {
        ...savedTerrain,
        material: {
          ...savedTerrain.material,
          texture: bakedTextureDataUrl
        },
        editedTextureMap: undefined
      };
      await this.applyTerrainDescriptor(savedTerrain, message, {
        previewTerrain,
        saveAssets: serialized.assets
      });
      return;
    }

    this.draft = normalizeDescriptor(clone(savedTerrain));
    this.appliedTerrainSignature = terrainSignature(savedTerrain);
    this.draftDirty = false;
    this.message = message;
    this.context.events.emit("edison.message", { text: message });
    if (this.activeStroke) {
      this.activeStroke.descriptor = savedTerrain;
      this.activeStroke.splatMap = splatMap;
    }
  }

  async prepareTextureAssetsForSave(saveContext) {
    if (!this.context) {
      return;
    }
    const terrain = this.context.scene.getSnapshot().descriptor?.terrain;
    if (terrain?.kind !== "generated" || terrain.material?.kind !== "bakedTexture") {
      return;
    }
    if (!this.textureSaveBakeRequired && !needsRuntimeTextureRebake(terrain)) {
      return;
    }

    let splatMap = this.textureSplatMap;
    if (this.textureMapLoadPromise) {
      saveContext.report({ message: "Loading editable terrain texture data...", progress: 0.05 });
      await this.textureMapLoadPromise;
      splatMap = this.textureSplatMap;
    }
    if (!splatMap && terrain.editedTextureMap) {
      saveContext.report({ message: "Loading editable terrain texture data...", progress: 0.08 });
      splatMap = await loadTextureSplatMapFromDescriptor(terrain.editedTextureMap, TERRAIN_TEXTURE_LAYERS);
      splatMap = ensureSplatMapResolution(splatMap, terrain.resolution[0], terrain.resolution[1]);
      this.textureSplatMap = splatMap;
      this.textureSplatSignature = textureMapSignatureForTerrain(terrain);
    }
    if (!splatMap) {
      return;
    }

    const sceneId = sanitizeAssetSegment(saveContext.descriptor.id ?? "scene");
    const terrainId = sanitizeAssetSegment(terrain.id ?? DEFAULT_TERRAIN_ID);
    const bakedTexturePath = `assets/generated/terrain/${sceneId}/${terrainId}_albedo.png`;
    const runtimeResolution = resolveTextureRuntimeBakeResolution(terrain.size[0], terrain.size[1]);
    saveContext.report({ message: "Baking high resolution terrain texture...", progress: 0.12 });
    const runtimeCanvas = await bakeTextureMapToCanvas({
      splatMap: splatMap.clone(),
      layers: TERRAIN_TEXTURE_LAYERS,
      terrainWidth: terrain.size[0],
      terrainDepth: terrain.size[1],
      outputResolution: runtimeResolution,
      yieldEveryRows: 32,
      onProgress: (progress) => {
        saveContext.report({
          message: "Baking high resolution terrain texture...",
          progress: 0.12 + progress * 0.78
        });
      }
    });

    saveContext.report({ message: "Encoding terrain texture PNG...", progress: 0.94 });
    saveContext.queueSaveAssets([{
      path: bakedTexturePath,
      encoding: "dataUrl",
      mimeType: "image/png",
      data: runtimeCanvas.toDataURL("image/png")
    }]);
    const currentDescriptor = this.context.scene.getSnapshot().descriptor;
    const currentTerrain = currentDescriptor?.terrain;
    if (currentTerrain?.kind === "generated" && currentTerrain.id === terrain.id) {
      this.context.viewport.applyTerrainTexturePaintPreview?.(currentDescriptor, runtimeCanvas);
    }
    this.textureSaveBakeRequired = false;
    saveContext.report({ message: "Terrain texture bake ready.", progress: 1 });
  }
}

function createDescriptorFromPreset(presetId, options = {}) {
  const preset = getPreset(presetId);
  const size = options.size ?? DEFAULT_TERRAIN_SIZE;
  const gridStep = options.terrainGridStep ?? DEFAULT_GRID_STEP;
  const gridLayout = options.resolution
    ? { size, gridStep, resolution: options.resolution }
    : resolveGridAlignedLayout(size, gridStep);
  return normalizeDescriptor({
    id: options.id ?? DEFAULT_TERRAIN_ID,
    kind: "generated",
    size: gridLayout.size,
    terrainGridStep: gridLayout.gridStep,
    resolutionMode: options.resolution ? "manual" : "gridStep",
    resolution: gridLayout.resolution,
    position: options.position ?? [0, 0, 0],
    rotation: options.rotation ?? [0, 0, 0],
    scale: options.scale ?? [1, 1, 1],
    generator: clone(preset.generator),
    material: clone(preset.material)
  });
}

function normalizeDescriptor(descriptor) {
  const preset = getPreset(descriptor.generator?.preset ?? DEFAULT_PRESET);
  const size = [
    clampFinite(descriptor.size?.[0], 1, 512, DEFAULT_TERRAIN_SIZE[0]),
    clampFinite(descriptor.size?.[1], 1, 512, DEFAULT_TERRAIN_SIZE[1])
  ];
  const gridStep = clampFinite(descriptor.terrainGridStep, 0.25, 64, DEFAULT_GRID_STEP);
  const resolutionMode = descriptor.resolutionMode === "manual" ? "manual" : "gridStep";
  const gridLayout = resolutionMode === "gridStep"
    ? resolveGridAlignedLayout(size, gridStep)
    : {
        size,
        gridStep,
        resolution: [
          normalizeResolution(descriptor.resolution?.[0] ?? resolveGridResolution(size, gridStep)[0]),
          normalizeResolution(descriptor.resolution?.[1] ?? resolveGridResolution(size, gridStep)[1])
        ]
      };
  return {
    ...clone(descriptor),
    id: descriptor.id || DEFAULT_TERRAIN_ID,
    kind: "generated",
    size: gridLayout.size,
    terrainGridStep: gridLayout.gridStep,
    resolutionMode,
    resolution: gridLayout.resolution,
    position: descriptor.position ?? [0, 0, 0],
    rotation: descriptor.rotation ?? [0, 0, 0],
    scale: descriptor.scale ?? [1, 1, 1],
    generator: {
      ...clone(preset.generator),
      ...clone(descriptor.generator ?? {}),
      preset: preset.id,
      strategy: descriptor.generator?.strategy ?? preset.strategy,
      height: {
        ...clone(preset.generator.height),
        ...clone(descriptor.generator?.height ?? {}),
        amplitude: clampFinite(descriptor.generator?.height?.amplitude, 0, 1000, preset.generator.height.amplitude),
        frequency: clampFinite(descriptor.generator?.height?.frequency, 0.0001, 100, preset.generator.height.frequency),
        octaves: Math.round(clampFinite(descriptor.generator?.height?.octaves, 1, 8, preset.generator.height.octaves)),
        persistence: clampFinite(descriptor.generator?.height?.persistence, 0, 1, preset.generator.height.persistence),
        lacunarity: clampFinite(descriptor.generator?.height?.lacunarity, 1, 8, preset.generator.height.lacunarity)
      }
    },
    material: clone(descriptor.material ?? preset.material ?? { kind: "flat", color: "#8D9298" })
  };
}

function generateHeightField(descriptor) {
  if (descriptor.editedHeightMap?.encoding === "array") {
    return createField(descriptor.size[0], descriptor.size[1], descriptor.resolution[0], descriptor.resolution[1], descriptor.editedHeightMap.heights);
  }
  const normalized = normalizeDescriptor(descriptor);
  const context = createGenerationContext(normalized);
  let field = generateStrategyField(context);
  field = applyFalloff(field, context);
  field = applyCenterFlatten(field, context);
  field = applyTerraces(field, context);
  field = applySmoothPasses(field, context);
  field = applyRuggedSlopeRelaxation(field, context);
  field = quantizeField(field, WORLD_VERTICAL_TILE_SIZE);
  return field;
}

function createGenerationContext(descriptor) {
  return {
    descriptor,
    width: descriptor.size[0],
    depth: descriptor.size[1],
    resolutionX: descriptor.resolution[0],
    resolutionZ: descriptor.resolution[1],
    baseHeight: clampFinite(descriptor.generator.height.base, -1000, 1000, 0),
    amplitude: clampFinite(descriptor.generator.height.amplitude, 0, 1000, 0),
    frequency: clampFinite(descriptor.generator.height.frequency, 0.0001, 100, 0.1),
    octaves: Math.round(clampFinite(descriptor.generator.height.octaves, 1, 8, 4)),
    persistence: clampFinite(descriptor.generator.height.persistence, 0, 1, 0.5),
    lacunarity: clampFinite(descriptor.generator.height.lacunarity, 1, 8, 2),
    noise: new TerrainNoise(descriptor.generator.seed)
  };
}

function generateStrategyField(context) {
  const strategy = context.descriptor.generator.strategy ?? getPreset(context.descriptor.generator.preset).strategy;
  const heights = new Float32Array(context.resolutionX * context.resolutionZ);
  for (let iz = 0; iz < context.resolutionZ; iz += 1) {
    for (let ix = 0; ix < context.resolutionX; ix += 1) {
      const { x, z } = centeredNoiseCoordinates(context, ix, iz, strategy === "mountains" ? 0.65 : 1);
      const value = sampleStrategyHeight(strategy, context, ix, iz, x, z);
      heights[indexOf(context, ix, iz)] = clamp(value, -1000, 1000);
    }
  }
  return createField(context.width, context.depth, context.resolutionX, context.resolutionZ, heights);
}

function sampleStrategyHeight(strategy, context, ix, iz, x, z) {
  if (strategy === "flat") {
    const noise = context.noise.sampleFractal2D(x * 0.75, z * 0.75, Math.min(2, context.octaves), 0.35, 2);
    return context.baseHeight + noise * context.amplitude * 0.18;
  }
  if (strategy === "urbanPad") {
    const primary = context.noise.sampleFractal2D(x * 0.9, z * 0.9, Math.min(3, context.octaves), context.persistence, context.lacunarity);
    const detail = context.noise.sample2D(x * 1.62, z * 1.62) * 0.14;
    const distance = normalizedCenterDistance(context, ix, iz);
    const centerBias = 1 - smoothstep(0.18, 0.58, distance);
    const edgeWeight = smoothstep(0.42, 1, distance);
    return context.baseHeight + (primary * 0.68 + detail * edgeWeight - centerBias * 0.22) * context.amplitude;
  }
  if (strategy === "islandPlateau") {
    const primary = context.noise.sampleFractal2D(x, z, context.octaves, context.persistence, context.lacunarity);
    const detail = context.noise.sample2D(x * 2.1, z * 2.1) * 0.32;
    const distance = normalizedCenterDistance(context, ix, iz);
    const plateauLift = 1 - smoothstep(0.16, 0.64, distance);
    const shoulder = smoothstep(0.24, 0.74, distance);
    return context.baseHeight + (primary * 0.9 + detail + plateauLift * 0.48 - shoulder * 0.12) * context.amplitude;
  }
  if (strategy === "rockyRidges") {
    const broad = centeredNoiseCoordinates(context, ix, iz, 0.95);
    const detail = centeredNoiseCoordinates(context, ix, iz, 1.9);
    const base = context.noise.sampleFractal2D(broad.x, broad.z, context.octaves, Math.max(0.4, context.persistence), Math.max(2.1, context.lacunarity));
    const ridge = 1 - Math.abs(base);
    const sharp = Math.pow(Math.max(0, ridge), 2.25);
    const secondary = 1 - Math.abs(context.noise.sampleFractal2D(detail.x, detail.z, Math.max(3, context.octaves - 1), 0.46, 2.35));
    const valley = context.noise.sampleFractal2D(detail.x * 1.35, detail.z * 1.35, 3, 0.52, 2.2);
    return context.baseHeight + ((sharp * 1.55 + secondary * 0.72 - 1.02) + valley * 0.28) * context.amplitude;
  }
  if (strategy === "mountains") {
    const broad = centeredNoiseCoordinates(context, ix, iz, 0.65);
    const detail = centeredNoiseCoordinates(context, ix, iz, 1.6);
    const broadNoise = context.noise.sampleFractal2D(broad.x, broad.z, Math.max(4, context.octaves), Math.max(0.38, context.persistence), context.lacunarity);
    const ridgedBase = context.noise.sampleFractal2D(detail.x, detail.z, Math.max(5, context.octaves), Math.max(0.42, context.persistence), Math.max(2.1, context.lacunarity));
    const ridge = 1 - Math.abs(ridgedBase);
    const sharp = Math.pow(Math.max(0, ridge), 2.8);
    const valley = context.noise.sampleFractal2D(detail.x * 2.2, detail.z * 2.2, 3, 0.5, 2.35);
    const distance = normalizedCenterDistance(context, ix, iz);
    const massif = 1 - smoothstep(0.55, 1, distance);
    return context.baseHeight + (broadNoise * 0.5 + (sharp * 2 - 1) * 1.25 + valley * 0.22 + massif * 0.28) * context.amplitude;
  }
  const primary = context.noise.sampleFractal2D(x, z, context.octaves, context.persistence, context.lacunarity);
  const secondary = context.noise.sampleFractal2D(x * 2.1, z * 2.1, Math.max(2, context.octaves - 1), 0.46, 2.2);
  return context.baseHeight + (primary * 0.86 + secondary * 0.24) * context.amplitude;
}

function applyFalloff(field, context) {
  const falloff = context.descriptor.generator.falloff;
  if (!falloff?.enabled || falloff.mode === "none") {
    return field;
  }
  const next = field.heights.slice();
  const radius = clamp(falloff.radius, 0, 1);
  const strength = clamp(falloff.strength, 0, 1);
  forEachVertex(field, (index, ix, iz) => {
    const distance = normalizedCenterDistance(context, ix, iz);
    const fade = smoothstep(radius, 1, distance);
    const current = next[index] ?? context.baseHeight;
    if (falloff.mode === "island") {
      next[index] = lerp(current, context.baseHeight - Math.abs(current - context.baseHeight) * strength, fade);
    } else if (falloff.mode === "edgeFade") {
      next[index] = lerp(current, context.baseHeight, fade * strength);
    } else {
      next[index] = lerp(current, context.baseHeight + Math.max(0, current - context.baseHeight) * (1 - strength), smoothstep(radius * 0.8, 1, distance));
    }
  });
  return fieldWithHeights(field, next);
}

function applyCenterFlatten(field, context) {
  const shaping = context.descriptor.generator.shaping;
  if (!shaping?.flattenCenter) {
    return field;
  }
  const next = field.heights.slice();
  const centerRadius = clamp(shaping.centerRadius ?? 0.35, 0, 1);
  forEachVertex(field, (index, ix, iz) => {
    const flattenStrength = 1 - smoothstep(0, centerRadius, normalizedCenterDistance(context, ix, iz));
    next[index] = lerp(next[index] ?? context.baseHeight, context.baseHeight, flattenStrength * 0.92);
  });
  return fieldWithHeights(field, next);
}

function applyTerraces(field, context) {
  const terraceSteps = Math.max(0, Math.round(context.descriptor.generator.shaping?.terraceSteps ?? 0));
  if (terraceSteps <= 1 || context.amplitude <= 0) {
    return field;
  }
  const next = field.heights.slice();
  const stepSize = context.amplitude / terraceSteps;
  for (let index = 0; index < next.length; index += 1) {
    const delta = (next[index] ?? context.baseHeight) - context.baseHeight;
    next[index] = context.baseHeight + Math.round(delta / stepSize) * stepSize;
  }
  return fieldWithHeights(field, next);
}

function applySmoothPasses(field, context) {
  const smoothPasses = Math.max(0, Math.round(context.descriptor.generator.shaping?.smoothPasses ?? 0));
  let current = field;
  for (let pass = 0; pass < smoothPasses; pass += 1) {
    current = smoothWholeField(current);
  }
  return current;
}

function applyRuggedSlopeRelaxation(field, context) {
  const strategy = context.descriptor.generator.strategy ?? getPreset(context.descriptor.generator.preset).strategy;
  if (strategy !== "rockyRidges" && strategy !== "mountains") {
    return field;
  }

  const quadSizeX = field.width / Math.max(1, field.resolutionX - 1);
  const quadSizeZ = field.depth / Math.max(1, field.resolutionZ - 1);
  const maxQuadSize = Math.max(quadSizeX, quadSizeZ);
  const maxSlope = strategy === "mountains" ? 2.35 : 1.75;
  const passes = strategy === "mountains" ? 4 : 3;
  let current = field;
  for (let pass = 0; pass < passes; pass += 1) {
    current = relaxFieldSlopes(current, maxQuadSize * maxSlope);
  }
  return current;
}

function relaxFieldSlopes(field, maxAxisDelta) {
  const source = field.heights;
  const next = source.slice();
  const diagonalDelta = maxAxisDelta * Math.SQRT2;
  const neighbors = [
    [-1, 0, maxAxisDelta],
    [1, 0, maxAxisDelta],
    [0, -1, maxAxisDelta],
    [0, 1, maxAxisDelta],
    [-1, -1, diagonalDelta],
    [1, -1, diagonalDelta],
    [-1, 1, diagonalDelta],
    [1, 1, diagonalDelta]
  ];

  for (let iz = 0; iz < field.resolutionZ; iz += 1) {
    for (let ix = 0; ix < field.resolutionX; ix += 1) {
      const index = iz * field.resolutionX + ix;
      let value = source[index] ?? 0;
      for (const [dx, dz, allowedDelta] of neighbors) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nx >= field.resolutionX || nz < 0 || nz >= field.resolutionZ) {
          continue;
        }
        const neighbor = source[nz * field.resolutionX + nx] ?? value;
        if (value > neighbor + allowedDelta) {
          value = neighbor + allowedDelta;
        } else if (value < neighbor - allowedDelta) {
          value = neighbor - allowedDelta;
        }
      }
      next[index] = value;
    }
  }

  return fieldWithHeights(field, next);
}

function smoothWholeField(field) {
  const next = field.heights.slice();
  const source = field.heights;
  for (let iz = 0; iz < field.resolutionZ; iz += 1) {
    for (let ix = 0; ix < field.resolutionX; ix += 1) {
      let sum = 0;
      let count = 0;
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sx = ix + offsetX;
          const sz = iz + offsetZ;
          if (sx < 0 || sx >= field.resolutionX || sz < 0 || sz >= field.resolutionZ) {
            continue;
          }
          sum += source[sz * field.resolutionX + sx] ?? 0;
          count += 1;
        }
      }
      next[iz * field.resolutionX + ix] = count > 0 ? sum / count : source[iz * field.resolutionX + ix] ?? 0;
    }
  }
  return fieldWithHeights(field, next);
}

function applyHeightDelta(field, center, settings, signedStrength) {
  const next = field.heights.slice();
  forEachBrushVertex(field, center, settings, (index, weight) => {
    next[index] = (next[index] ?? 0) + signedStrength * weight;
  });
  return fieldWithHeights(field, next);
}

function smoothHeights(field, center, settings, deltaTime) {
  let sum = 0;
  let totalWeight = 0;
  forEachBrushVertex(field, center, settings, (index, weight) => {
    sum += (field.heights[index] ?? 0) * weight;
    totalWeight += weight;
  });
  const average = totalWeight > 0 ? sum / totalWeight : 0;
  const next = field.heights.slice();
  const blendRate = clamp01(settings.brush.strength * clamp(deltaTime, 0, 0.25));
  forEachBrushVertex(field, center, settings, (index, weight) => {
    const blend = clamp01(blendRate * weight);
    next[index] = lerp(next[index] ?? 0, average, blend);
  });
  return fieldWithHeights(field, next);
}

function flattenToHeight(field, center, settings, targetHeight, deltaTime) {
  const next = field.heights.slice();
  const blendRate = clamp01(settings.brush.strength * clamp(deltaTime, 0, 0.25));
  forEachBrushVertex(field, center, settings, (index, weight) => {
    const blend = clamp01(blendRate * weight);
    next[index] = lerp(next[index] ?? 0, targetHeight, blend);
  });
  return fieldWithHeights(field, next);
}

function forEachBrushVertex(field, center, settings, callback) {
  for (let iz = 0; iz < field.resolutionZ; iz += 1) {
    const v = field.resolutionZ <= 1 ? 0 : iz / (field.resolutionZ - 1);
    const z = (0.5 - v) * field.depth;
    for (let ix = 0; ix < field.resolutionX; ix += 1) {
      const u = field.resolutionX <= 1 ? 0 : ix / (field.resolutionX - 1);
      const x = (u - 0.5) * field.width;
      const weight = brushWeight(settings.brush.shape, x - center.x, z - center.z, settings.brush.radius, settings.brush.falloff);
      if (weight > 0) {
        callback(iz * field.resolutionX + ix, weight, x, z);
      }
    }
  }
}

function brushWeight(shape, dx, dz, radius, falloff) {
  const safeRadius = Math.max(0.0001, radius);
  if (shape === "square") {
    const distance = Math.max(Math.abs(dx), Math.abs(dz)) / safeRadius;
    if (distance > 1) {
      return 0;
    }
    return falloffWeight(distance, falloff);
  }
  const distance = Math.sqrt(dx * dx + dz * dz) / safeRadius;
  if (distance > 1) {
    return 0;
  }
  return falloffWeight(distance, falloff);
}

function falloffWeight(distance, falloff) {
  const safeFalloff = clamp01(falloff);
  if (safeFalloff <= 0) {
    return 1;
  }
  const inner = 1 - safeFalloff;
  if (distance <= inner) {
    return 1;
  }
  return 1 - smoothstep(inner, 1, distance);
}

function worldPointToTerrainLocal(point, terrain) {
  const position = terrain.position ?? [0, 0, 0];
  const rotation = terrain.rotation ?? [0, 0, 0];
  const scale = terrain.scale ?? [1, 1, 1];
  const dx = point.x - position[0];
  const dz = point.z - position[2];
  const angle = -(rotation[1] ?? 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: ((dx * cos) - (dz * sin)) / Math.max(0.0001, scale[0] ?? 1),
    z: ((dx * sin) + (dz * cos)) / Math.max(0.0001, scale[2] ?? 1)
  };
}

function createField(width, depth, resolutionX, resolutionZ, heights) {
  const array = heights instanceof Float32Array ? heights : new Float32Array(heights);
  return {
    width,
    depth,
    resolutionX,
    resolutionZ,
    heights: array
  };
}

function fieldWithHeights(field, heights) {
  return createField(field.width, field.depth, field.resolutionX, field.resolutionZ, heights);
}

function forEachVertex(field, callback) {
  for (let iz = 0; iz < field.resolutionZ; iz += 1) {
    for (let ix = 0; ix < field.resolutionX; ix += 1) {
      callback(iz * field.resolutionX + ix, ix, iz);
    }
  }
}

function quantizeField(field, step) {
  const safeStep = Math.max(0.0001, step);
  const next = field.heights.slice();
  for (let index = 0; index < next.length; index += 1) {
    next[index] = WORLD_GRID_ORIGIN_Y + Math.round(((next[index] ?? 0) - WORLD_GRID_ORIGIN_Y) / safeStep) * safeStep;
  }
  return fieldWithHeights(field, next);
}

function serializeHeightMap(field) {
  return {
    encoding: "array",
    resolution: [field.resolutionX, field.resolutionZ],
    heights: Array.from(field.heights)
  };
}

class TerrainSplatMap {
  constructor(resolutionX, resolutionZ, layerCount, initialLayerIndex = 0) {
    this.resolutionX = Math.max(1, Math.round(resolutionX));
    this.resolutionZ = Math.max(1, Math.round(resolutionZ));
    this.layerCount = Math.max(1, Math.round(layerCount));
    this.weights = new Float32Array(this.resolutionX * this.resolutionZ * this.layerCount);
    const layerIndex = clampIndex(initialLayerIndex, this.layerCount);
    for (let iz = 0; iz < this.resolutionZ; iz += 1) {
      for (let ix = 0; ix < this.resolutionX; ix += 1) {
        this.weights[this.getOffset(ix, iz, layerIndex)] = 1;
      }
    }
  }

  getWeight(ix, iz, layerIndex) {
    return this.weights[this.getOffset(ix, iz, layerIndex)] ?? 0;
  }

  setWeight(ix, iz, layerIndex, weight) {
    this.weights[this.getOffset(ix, iz, layerIndex)] = clamp01(weight);
  }

  normalizeTexel(ix, iz) {
    const texelOffset = this.getTexelOffset(ix, iz);
    let sum = 0;
    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const offset = texelOffset + layerIndex;
      const value = clamp01(this.weights[offset] ?? 0);
      this.weights[offset] = value;
      sum += value;
    }

    if (sum <= 0.000001) {
      this.weights[texelOffset] = 1;
      for (let layerIndex = 1; layerIndex < this.layerCount; layerIndex += 1) {
        this.weights[texelOffset + layerIndex] = 0;
      }
      return;
    }

    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const offset = texelOffset + layerIndex;
      this.weights[offset] = (this.weights[offset] ?? 0) / sum;
    }
  }

  getSplatTextureCount() {
    return Math.ceil(this.layerCount / 4);
  }

  clone() {
    const cloned = new TerrainSplatMap(this.resolutionX, this.resolutionZ, this.layerCount);
    cloned.weights.set(this.weights);
    return cloned;
  }

  resampled(resolutionX, resolutionZ) {
    const nextResolutionX = Math.max(1, Math.round(resolutionX));
    const nextResolutionZ = Math.max(1, Math.round(resolutionZ));
    if (nextResolutionX === this.resolutionX && nextResolutionZ === this.resolutionZ) {
      return this.clone();
    }

    const resampled = new TerrainSplatMap(nextResolutionX, nextResolutionZ, this.layerCount);
    resampled.weights.fill(0);
    for (let iz = 0; iz < nextResolutionZ; iz += 1) {
      const v = nextResolutionZ <= 1 ? 0 : iz / (nextResolutionZ - 1);
      for (let ix = 0; ix < nextResolutionX; ix += 1) {
        const u = nextResolutionX <= 1 ? 0 : ix / (nextResolutionX - 1);
        for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
          resampled.setWeight(ix, iz, layerIndex, this.sampleWeightBilinear(u, v, layerIndex));
        }
        resampled.normalizeTexel(ix, iz);
      }
    }
    return resampled;
  }

  toRgba8ArrayForChunk(chunkIndex, flipZ = false) {
    const normalizedChunkIndex = clampIndex(chunkIndex, this.getSplatTextureCount());
    const baseLayerIndex = normalizedChunkIndex * 4;
    const bytes = new Uint8Array(this.resolutionX * this.resolutionZ * 4);
    for (let iz = 0; iz < this.resolutionZ; iz += 1) {
      const sourceZ = flipZ ? this.resolutionZ - 1 - iz : iz;
      for (let ix = 0; ix < this.resolutionX; ix += 1) {
        const byteOffset = ((iz * this.resolutionX) + ix) * 4;
        for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
          const layerIndex = baseLayerIndex + channelIndex;
          if (layerIndex < this.layerCount) {
            bytes[byteOffset + channelIndex] = Math.round(clamp01(this.getWeight(ix, sourceZ, layerIndex)) * 255);
          }
        }
      }
    }
    return bytes;
  }

  sampleWeightBilinear(u, v, layerIndex) {
    const x = clamp01(u) * Math.max(0, this.resolutionX - 1);
    const z = clamp01(v) * Math.max(0, this.resolutionZ - 1);
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = Math.min(this.resolutionX - 1, x0 + 1);
    const z1 = Math.min(this.resolutionZ - 1, z0 + 1);
    const tx = x - x0;
    const tz = z - z0;
    return lerp(
      lerp(this.getWeight(x0, z0, layerIndex), this.getWeight(x1, z0, layerIndex), tx),
      lerp(this.getWeight(x0, z1, layerIndex), this.getWeight(x1, z1, layerIndex), tx),
      tz
    );
  }

  static fromRgba8Chunks(resolutionX, resolutionZ, layerCount, chunks, flipZ = false) {
    const map = new TerrainSplatMap(resolutionX, resolutionZ, layerCount);
    map.weights.fill(0);
    const expectedChunkCount = map.getSplatTextureCount();
    if (chunks.length !== expectedChunkCount) {
      throw new Error(`Expected ${expectedChunkCount} splat chunk(s), received ${chunks.length}.`);
    }

    const expectedLength = map.resolutionX * map.resolutionZ * 4;
    for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (!chunk || chunk.length !== expectedLength) {
        throw new Error(`Terrain splat chunk ${chunkIndex} has invalid byte length.`);
      }

      const baseLayerIndex = chunkIndex * 4;
      for (let iz = 0; iz < map.resolutionZ; iz += 1) {
        const targetZ = flipZ ? map.resolutionZ - 1 - iz : iz;
        for (let ix = 0; ix < map.resolutionX; ix += 1) {
          const byteOffset = ((iz * map.resolutionX) + ix) * 4;
          for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
            const layerIndex = baseLayerIndex + channelIndex;
            if (layerIndex < map.layerCount) {
              map.setWeight(ix, targetZ, layerIndex, (chunk[byteOffset + channelIndex] ?? 0) / 255);
            }
          }
        }
      }
    }

    normalizeWholeSplatMap(map);
    return map;
  }

  getOffset(ix, iz, layerIndex) {
    return this.getTexelOffset(ix, iz) + clampIndex(layerIndex, this.layerCount);
  }

  getTexelOffset(ix, iz) {
    return ((clampIndex(iz, this.resolutionZ) * this.resolutionX) + clampIndex(ix, this.resolutionX)) * this.layerCount;
  }
}

function paintTextureAtPoint(splatMap, options) {
  if (options.layerIndex < 0 || options.layerIndex >= splatMap.layerCount) {
    return { changedTexelCount: 0 };
  }

  const paintAmount = clamp01(Math.abs(options.brush.strength) * TEXTURE_PAINT_STRENGTH_SCALE * clamp(options.deltaTime, 0, 0.25));
  if (paintAmount <= 0) {
    return { changedTexelCount: 0 };
  }

  const radius = Math.max(0.0001, options.brush.radius);
  const terrainWidth = Math.max(0.0001, Math.abs(options.terrainWidth));
  const terrainDepth = Math.max(0.0001, Math.abs(options.terrainDepth));
  let changedTexelCount = 0;
  for (let iz = 0; iz < splatMap.resolutionZ; iz += 1) {
    const v = splatMap.resolutionZ <= 1 ? 0.5 : iz / (splatMap.resolutionZ - 1);
    const z = (0.5 - v) * terrainDepth;
    for (let ix = 0; ix < splatMap.resolutionX; ix += 1) {
      const u = splatMap.resolutionX <= 1 ? 0.5 : ix / (splatMap.resolutionX - 1);
      const x = (u - 0.5) * terrainWidth;
      const influence = clamp01(brushWeight(options.brush.shape, x - options.center.x, z - options.center.z, radius, options.brush.falloff) * paintAmount);
      if (influence <= 0) {
        continue;
      }

      paintTextureTexel(splatMap, ix, iz, options.layerIndex, influence);
      changedTexelCount += 1;
    }
  }
  return { changedTexelCount };
}

function paintTextureTexel(splatMap, ix, iz, selectedLayerIndex, influence) {
  const currentSelectedWeight = splatMap.getWeight(ix, iz, selectedLayerIndex);
  const nextSelectedWeight = clamp01(currentSelectedWeight + ((1 - currentSelectedWeight) * influence));
  const currentOtherWeight = 1 - currentSelectedWeight;
  const nextOtherWeight = 1 - nextSelectedWeight;
  const otherScale = currentOtherWeight > 0.000001 ? nextOtherWeight / currentOtherWeight : 0;
  for (let layerIndex = 0; layerIndex < splatMap.layerCount; layerIndex += 1) {
    if (layerIndex === selectedLayerIndex) {
      splatMap.setWeight(ix, iz, layerIndex, nextSelectedWeight);
    } else {
      splatMap.setWeight(ix, iz, layerIndex, splatMap.getWeight(ix, iz, layerIndex) * otherScale);
    }
  }
  splatMap.normalizeTexel(ix, iz);
}

function normalizeWholeSplatMap(splatMap) {
  for (let iz = 0; iz < splatMap.resolutionZ; iz += 1) {
    for (let ix = 0; ix < splatMap.resolutionX; ix += 1) {
      splatMap.normalizeTexel(ix, iz);
    }
  }
}

function getActiveSplatLayerIndices(splatMap) {
  const active = [];
  for (let layerIndex = 0; layerIndex < splatMap.layerCount; layerIndex += 1) {
    let hasWeight = false;
    for (let offset = layerIndex; offset < splatMap.weights.length; offset += splatMap.layerCount) {
      if ((splatMap.weights[offset] ?? 0) > 0.0001) {
        hasWeight = true;
        break;
      }
    }
    if (hasWeight) {
      active.push(layerIndex);
    }
  }
  return active.length > 0 ? active : [0];
}

function ensureSplatMapResolution(splatMap, resolutionX, resolutionZ) {
  let map = splatMap;
  if (map.layerCount !== TERRAIN_TEXTURE_LAYERS.length) {
    const remapped = new TerrainSplatMap(map.resolutionX, map.resolutionZ, TERRAIN_TEXTURE_LAYERS.length);
    remapped.weights.fill(0);
    const copyLayerCount = Math.min(map.layerCount, remapped.layerCount);
    for (let iz = 0; iz < map.resolutionZ; iz += 1) {
      for (let ix = 0; ix < map.resolutionX; ix += 1) {
        for (let layerIndex = 0; layerIndex < copyLayerCount; layerIndex += 1) {
          remapped.setWeight(ix, iz, layerIndex, map.getWeight(ix, iz, layerIndex));
        }
        remapped.normalizeTexel(ix, iz);
      }
    }
    map = remapped;
  }
  if (map.resolutionX !== resolutionX || map.resolutionZ !== resolutionZ) {
    return map.resampled(resolutionX, resolutionZ);
  }
  return map;
}

function serializeTextureSplatMap(input) {
  if (input.layers.length !== input.splatMap.layerCount) {
    throw new Error("Texture splat map layer count does not match terrain texture registry.");
  }

  const normalized = input.splatMap.clone();
  normalizeWholeSplatMap(normalized);
  const assets = [];
  const weightPaths = [];
  for (let chunkIndex = 0; chunkIndex < normalized.getSplatTextureCount(); chunkIndex += 1) {
    const bytes = normalized.toRgba8ArrayForChunk(chunkIndex, true);
    const assetPath = `assets/generated/terrain/${input.sceneId}/${input.terrainId}_splat_${chunkIndex}.png`;
    weightPaths.push(assetPath);
    assets.push({
      path: assetPath,
      encoding: "dataUrl",
      mimeType: "image/png",
      data: encodeRgbaBytesToPngDataUrl(bytes, normalized.resolutionX, normalized.resolutionZ)
    });
  }

  return {
    editedTextureMap: {
      encoding: "splatRgba8",
      resolution: [normalized.resolutionX, normalized.resolutionZ],
      layers: input.layers.map((layer) => layer.id),
      weights: weightPaths,
      bakedTexture: input.bakedTexturePath,
      bakeResolution: input.bakeResolution
    },
    assets
  };
}

async function loadTextureSplatMapFromDescriptor(editedTextureMap, availableLayers) {
  const chunks = await Promise.all(
    editedTextureMap.weights.map((weightPath) => loadPngRgbaBytes(weightPath, editedTextureMap.resolution))
  );
  const savedMap = TerrainSplatMap.fromRgba8Chunks(
    editedTextureMap.resolution[0],
    editedTextureMap.resolution[1],
    editedTextureMap.layers.length,
    chunks,
    true
  );
  const remapped = new TerrainSplatMap(savedMap.resolutionX, savedMap.resolutionZ, availableLayers.length);
  remapped.weights.fill(0);
  for (let savedLayerIndex = 0; savedLayerIndex < editedTextureMap.layers.length; savedLayerIndex += 1) {
    const availableLayerIndex = availableLayers.findIndex((layer) => layer.id === editedTextureMap.layers[savedLayerIndex]);
    if (availableLayerIndex < 0) {
      continue;
    }
    for (let iz = 0; iz < savedMap.resolutionZ; iz += 1) {
      for (let ix = 0; ix < savedMap.resolutionX; ix += 1) {
        remapped.setWeight(ix, iz, availableLayerIndex, savedMap.getWeight(ix, iz, savedLayerIndex));
      }
    }
  }
  normalizeWholeSplatMap(remapped);
  return remapped;
}

async function bakeTextureMapToCanvas(input) {
  if (input.layers.length === 0 || input.layers.length !== input.splatMap.layerCount) {
    throw new Error("Texture baking requires layers to match the splat map.");
  }

  const outputResolution = input.outputResolution ?? resolveTextureRuntimeBakeResolution(input.terrainWidth, input.terrainDepth);
  const yieldEveryRows = Math.max(0, Math.round(input.yieldEveryRows ?? 0));
  const activeLayerIndices = getActiveSplatLayerIndices(input.splatMap);
  const layerImages = new Map(await Promise.all(activeLayerIndices.map(async (layerIndex) => [
    layerIndex,
    await loadLayerImage(input.layers[layerIndex])
  ])));
  const canvas = createCanvas(outputResolution[0], outputResolution[1]);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Terrain texture baking could not acquire a 2D canvas context.");
  }

  const imageData = context.createImageData(outputResolution[0], outputResolution[1]);
  const target = imageData.data;
  const tileScale = resolveTextureTileScale(input.terrainWidth, input.terrainDepth);
  for (let y = 0; y < outputResolution[1]; y += 1) {
    if (yieldEveryRows > 0 && y > 0 && y % yieldEveryRows === 0) {
      input.onProgress?.(y / Math.max(1, outputResolution[1] - 1));
      await waitForIdleSlice();
    }
    const textureV = outputResolution[1] <= 1 ? 0 : y / (outputResolution[1] - 1);
    const terrainV = 1 - textureV;
    for (let x = 0; x < outputResolution[0]; x += 1) {
      const textureU = outputResolution[0] <= 1 ? 0 : x / (outputResolution[0] - 1);
      const pixelOffset = ((y * outputResolution[0]) + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let totalWeight = 0;
      for (const layerIndex of activeLayerIndices) {
        const weight = input.splatMap.sampleWeightBilinear(textureU, terrainV, layerIndex);
        if (weight <= 0.0001) {
          continue;
        }
        const layerImage = layerImages.get(layerIndex);
        if (!layerImage) {
          continue;
        }
        const sample = sampleLayerColor(layerImage, textureU, textureV, tileScale);
        red += sample[0] * weight;
        green += sample[1] * weight;
        blue += sample[2] * weight;
        totalWeight += weight;
      }
      const divisor = Math.max(totalWeight, 0.0001);
      target[pixelOffset] = clampByte(red / divisor);
      target[pixelOffset + 1] = clampByte(green / divisor);
      target[pixelOffset + 2] = clampByte(blue / divisor);
      target[pixelOffset + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  input.onProgress?.(1);
  return canvas;
}

async function loadLayerImage(layer) {
  const cached = layerImageCache.get(layer.id);
  if (cached) {
    return cached;
  }

  const canvas = createCanvas(LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Terrain texture baking could not acquire a 2D canvas context.");
  }

  context.fillStyle = resolveFallbackLayerColor(layer.id);
  context.fillRect(0, 0, LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
  if ("imageSmoothingEnabled" in context) {
    context.imageSmoothingEnabled = true;
  }

  try {
    const image = await loadImage(layer.url);
    context.drawImage(image, 0, 0, LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
  } catch {
    // Keep deterministic fallback color if a texture is unavailable.
  }

  const imageData = context.getImageData(0, 0, LAYER_SAMPLE_SIZE, LAYER_SAMPLE_SIZE);
  const sample = {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data
  };
  layerImageCache.set(layer.id, sample);
  return sample;
}

function sampleLayerColor(image, u, v, tileScale) {
  const sampleU = clampAtlasUv(fract(u * tileScale));
  const sampleV = clampAtlasUv(fract(v * tileScale));
  const x = sampleU * Math.max(0, image.width - 1);
  const y = sampleV * Math.max(0, image.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  return [
    bilinearChannel(image, x0, y0, x1, y1, tx, ty, 0),
    bilinearChannel(image, x0, y0, x1, y1, tx, ty, 1),
    bilinearChannel(image, x0, y0, x1, y1, tx, ty, 2)
  ];
}

function bilinearChannel(image, x0, y0, x1, y1, tx, ty, channel) {
  return lerp(
    lerp(readChannel(image, x0, y0, channel), readChannel(image, x1, y0, channel), tx),
    lerp(readChannel(image, x0, y1, channel), readChannel(image, x1, y1, channel), tx),
    ty
  );
}

function readChannel(image, x, y, channel) {
  return image.data[((y * image.width) + x) * 4 + channel] ?? 0;
}

function encodeRgbaBytesToPngDataUrl(bytes, width, height) {
  const packed = packRawSplatChunkForOpaquePng(bytes, width, height);
  const canvas = createCanvas(packed.width, packed.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Terrain texture map persistence could not acquire a 2D canvas context.");
  }

  const imageData = context.createImageData(packed.width, packed.height);
  imageData.data.set(packed.bytes);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function loadPngRgbaBytes(assetPath, resolution) {
  const image = await loadImage(assetUrl(assetPath));
  const canvas = createCanvas(Math.max(resolution[0], resolution[0] * 2), resolution[1]);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Terrain texture map persistence could not acquire a 2D canvas context.");
  }

  if ("imageSmoothingEnabled" in context) {
    context.imageSmoothingEnabled = false;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, image.width, image.height);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return unpackOpaquePngToRawSplatChunk(new Uint8Array(imageData.data), image.width, image.height, resolution);
}

function packRawSplatChunkForOpaquePng(bytes, width, height) {
  const expectedLength = width * height * 4;
  if (bytes.length !== expectedLength) {
    throw new Error(`Terrain splat chunk must contain ${expectedLength} rgba bytes.`);
  }

  const packedWidth = width * 2;
  const packed = new Uint8Array(packedWidth * height * 4);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const sourceOffset = pixelIndex * 4;
    const packedOffset = pixelIndex * 8;
    packed[packedOffset] = bytes[sourceOffset] ?? 0;
    packed[packedOffset + 1] = bytes[sourceOffset + 1] ?? 0;
    packed[packedOffset + 2] = bytes[sourceOffset + 2] ?? 0;
    packed[packedOffset + 3] = 255;
    packed[packedOffset + 4] = bytes[sourceOffset + 3] ?? 0;
    packed[packedOffset + 5] = 0;
    packed[packedOffset + 6] = 0;
    packed[packedOffset + 7] = 255;
  }
  return { bytes: packed, width: packedWidth, height };
}

function unpackOpaquePngToRawSplatChunk(bytes, imageWidth, imageHeight, resolution) {
  if (imageHeight !== resolution[1]) {
    throw new Error(`Terrain splat asset height ${imageHeight} does not match expected ${resolution[1]}.`);
  }

  if (imageWidth === resolution[0]) {
    return bytes;
  }

  if (imageWidth !== resolution[0] * 2) {
    throw new Error(`Terrain splat asset width ${imageWidth} does not match expected ${resolution[0]} or ${resolution[0] * 2}.`);
  }

  const unpacked = new Uint8Array(resolution[0] * resolution[1] * 4);
  for (let pixelIndex = 0; pixelIndex < resolution[0] * resolution[1]; pixelIndex += 1) {
    const packedOffset = pixelIndex * 8;
    const unpackedOffset = pixelIndex * 4;
    unpacked[unpackedOffset] = bytes[packedOffset] ?? 0;
    unpacked[unpackedOffset + 1] = bytes[packedOffset + 1] ?? 0;
    unpacked[unpackedOffset + 2] = bytes[packedOffset + 2] ?? 0;
    unpacked[unpackedOffset + 3] = bytes[packedOffset + 4] ?? 0;
  }
  return unpacked;
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image '${url}'.`));
    image.src = url;
  });
}

function waitForIdleSlice() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function resolveTextureTileScale(terrainWidth, terrainDepth) {
  const maxSize = Math.max(Math.abs(terrainWidth), Math.abs(terrainDepth), 1);
  return Math.max(4, Math.min(24, maxSize / 6));
}

function resolveTexturePreviewBakeResolution(terrainWidth, terrainDepth) {
  return resolveSquareBakeResolution(
    terrainWidth,
    terrainDepth,
    TEXTURE_PREVIEW_PIXELS_PER_WORLD_UNIT,
    TEXTURE_MIN_BAKE_RESOLUTION,
    TEXTURE_PREVIEW_MAX_BAKE_RESOLUTION
  );
}

function resolveTextureRuntimeBakeResolution(terrainWidth, terrainDepth) {
  return resolveSquareBakeResolution(
    terrainWidth,
    terrainDepth,
    TEXTURE_RUNTIME_PIXELS_PER_WORLD_UNIT,
    TEXTURE_MIN_BAKE_RESOLUTION,
    TEXTURE_RUNTIME_MAX_BAKE_RESOLUTION
  );
}

function resolveSquareBakeResolution(terrainWidth, terrainDepth, pixelsPerWorldUnit, minResolution, maxResolution) {
  const maxWorldSize = Math.max(Math.abs(terrainWidth), Math.abs(terrainDepth), 1);
  const resolution = clampPowerOfTwo(maxWorldSize * pixelsPerWorldUnit, minResolution, maxResolution);
  return [resolution, resolution];
}

function clampPowerOfTwo(value, minResolution, maxResolution) {
  const clamped = Math.max(minResolution, Math.min(maxResolution, Math.round(value)));
  let power = 1;
  while (power < clamped) {
    power *= 2;
  }
  return Math.max(minResolution, Math.min(maxResolution, power));
}

function terrainTextureUrl(filename) {
  return `/assets/textures/terrain/${filename.split("/").map(encodeURIComponent).join("/")}`;
}

function assetUrl(path) {
  if (path.startsWith("/") || path.startsWith("data:") || path.startsWith("blob:") || /^https?:\/\//i.test(path)) {
    return path;
  }
  return `/${path}`;
}

function textureMapSignatureForTerrain(terrain) {
  return terrain
    ? `${terrain.id}|${terrain.resolution?.[0]}x${terrain.resolution?.[1]}|${JSON.stringify(terrain.editedTextureMap ?? null)}`
    : "none";
}

function needsRuntimeTextureRebake(terrain) {
  const bakeResolution = terrain.editedTextureMap?.bakeResolution;
  const requiredResolution = resolveTextureRuntimeBakeResolution(terrain.size?.[0] ?? 1, terrain.size?.[1] ?? 1);
  if (!bakeResolution) {
    return terrain.material?.kind === "bakedTexture";
  }
  return (
    (bakeResolution[0] ?? 0) < requiredResolution[0] ||
    (bakeResolution[1] ?? 0) < requiredResolution[1]
  );
}

function sanitizeAssetSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "terrain";
}

function computeStats(field) {
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (const height of field.heights) {
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }
  return {
    minHeight: Number.isFinite(minHeight) ? minHeight : 0,
    maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0,
    vertexCount: field.resolutionX * field.resolutionZ,
    triangleCount: Math.max(0, (field.resolutionX - 1) * (field.resolutionZ - 1) * 2)
  };
}

function resolveSourceQuadSize(descriptor) {
  return [
    descriptor.size[0] / Math.max(1, descriptor.resolution[0] - 1),
    descriptor.size[1] / Math.max(1, descriptor.resolution[1] - 1)
  ];
}

function resolveGridResolution(size, gridStep) {
  return [
    normalizeResolution(Math.floor(size[0] / gridStep) + 1),
    normalizeResolution(Math.floor(size[1] / gridStep) + 1)
  ];
}

function resolveGridAlignedLayout(size, gridStep) {
  const normalizedGridStep = clampFinite(gridStep, 0.25, 64, DEFAULT_GRID_STEP);
  const normalizedSize = [
    clampFinite(size?.[0], 1, 512, DEFAULT_TERRAIN_SIZE[0]),
    clampFinite(size?.[1], 1, 512, DEFAULT_TERRAIN_SIZE[1])
  ];
  const quadCounts = [
    snapEvenQuadCount(normalizedSize[0] / normalizedGridStep),
    snapEvenQuadCount(normalizedSize[1] / normalizedGridStep)
  ];
  return {
    size: [
      Number((quadCounts[0] * normalizedGridStep).toFixed(6)),
      Number((quadCounts[1] * normalizedGridStep).toFixed(6))
    ],
    gridStep: normalizedGridStep,
    resolution: [quadCounts[0] + 1, quadCounts[1] + 1]
  };
}

function snapEvenQuadCount(requestedQuadCount) {
  const nearestEven = Math.round(requestedQuadCount / 2) * 2;
  return Math.max(MIN_RESOLUTION - 1, Math.min(MAX_RESOLUTION - 1, nearestEven));
}

function normalizeResolution(value) {
  const rounded = Math.round(clampFinite(value, MIN_RESOLUTION, MAX_RESOLUTION, MIN_RESOLUTION));
  const odd = rounded % 2 === 0 ? rounded + 1 : rounded;
  return Math.min(MAX_RESOLUTION, odd);
}

function getPreset(id) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS.find((preset) => preset.id === DEFAULT_PRESET);
}

function resolveHeightBandMaterial(material) {
  if (material?.kind === "heightBands" && material.bands?.length) {
    return clone(material);
  }
  return clone({
    kind: "heightBands",
    color: COLOR_PRESETS.natural.color,
    bands: COLOR_PRESETS.natural.bands
  });
}

function indexOf(context, ix, iz) {
  return iz * context.resolutionX + ix;
}

function centeredNoiseCoordinates(context, ix, iz, frequencyMultiplier = 1) {
  return {
    x: ((context.resolutionX <= 1 ? 0 : ix / (context.resolutionX - 1)) - 0.5) * context.width * context.frequency * frequencyMultiplier,
    z: ((context.resolutionZ <= 1 ? 0 : iz / (context.resolutionZ - 1)) - 0.5) * context.depth * context.frequency * frequencyMultiplier
  };
}

function normalizedCenterDistance(context, ix, iz) {
  const dx = (context.resolutionX <= 1 ? 0 : ix / (context.resolutionX - 1)) - 0.5;
  const dz = (context.resolutionZ <= 1 ? 0 : iz / (context.resolutionZ - 1)) - 0.5;
  return Math.min(1, Math.sqrt(dx * dx + dz * dz) / 0.70710678118);
}

class TerrainNoise {
  constructor(seed) {
    this.seed = seed | 0;
  }
  sample2D(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const tx = fade(x - x0);
    const tz = fade(z - z0);
    const v00 = this.random2D(x0, z0);
    const v10 = this.random2D(x1, z0);
    const v01 = this.random2D(x0, z1);
    const v11 = this.random2D(x1, z1);
    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz) * 2 - 1;
  }
  sampleFractal2D(x, z, octaves, persistence, lacunarity) {
    let signal = 0;
    let octaveAmplitude = 1;
    let amplitudeTotal = 0;
    let octaveFrequency = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      signal += this.sample2D(x * octaveFrequency, z * octaveFrequency) * octaveAmplitude;
      amplitudeTotal += octaveAmplitude;
      octaveAmplitude *= persistence;
      octaveFrequency *= lacunarity;
    }
    return amplitudeTotal > 0 ? signal / amplitudeTotal : 0;
  }
  random2D(x, z) {
    let hash = Math.imul(x ^ this.seed, 374761393);
    hash = Math.imul(hash ^ (z + 0x9e3779b9), 668265263);
    hash = (hash ^ (hash >>> 13)) >>> 0;
    hash = Math.imul(hash, 1274126177) >>> 0;
    return hash / 0xffffffff;
  }
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .terrain-tools { display: grid; gap: 8px; color: #DDE7F6; }
    .terrain-tools-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    .terrain-tools-tabs button,
    .terrain-tools-actions button,
    .terrain-tools-tool { height: 28px; border: 1px solid #2C405E; border-radius: 5px; background: #122037; color: #DDE7F6; font: inherit; cursor: pointer; }
    .terrain-tools-tabs button.is-active,
    .terrain-tools-actions button.is-active,
    .terrain-tools-tool.is-active { border-color: #F7B84B; background: #21304A; color: #FFF0C2; }
    .terrain-tools-card { border: 1px solid #263954; border-radius: 7px; background: #101E31; padding: 9px; display: grid; gap: 8px; }
    .terrain-tools-card-title { color: #F7B84B; font-size: 12px; font-weight: 700; }
    .terrain-tools-status { font-size: 12px; color: #B9C6D9; }
    .terrain-tools-field { display: grid; grid-template-columns: 88px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 28px; font-size: 12px; color: #B9C6D9; }
    .terrain-tools-slider-field { display: grid; grid-template-columns: 88px minmax(0, 1fr) 46px; align-items: center; gap: 8px; min-height: 28px; font-size: 12px; color: #B9C6D9; }
    .terrain-tools-field input,
    .terrain-tools-field select,
    .terrain-tools-band input,
    .terrain-tools-band-head { min-width: 0; height: 26px; box-sizing: border-box; border: 1px solid #2C405E; border-radius: 5px; background: #081323; color: #E7EDF7; padding: 0 6px; font: inherit; }
    .terrain-tools-field input[type="checkbox"] { justify-self: start; width: 16px; height: 16px; }
    .terrain-tools-slider-field input[type="range"] { min-width: 0; accent-color: #F7B84B; cursor: ew-resize; }
    .terrain-tools-slider-field output { justify-self: end; min-width: 0; color: #E7EDF7; font-variant-numeric: tabular-nums; text-align: right; }
    .terrain-tools-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .terrain-tools-actions button { padding: 0 9px; }
    .terrain-tools-actions-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .terrain-tools-band-head,
    .terrain-tools-band { display: grid; grid-template-columns: 28px 1fr 58px 58px; gap: 6px; align-items: center; font-size: 12px; color: #B9C6D9; }
    .terrain-tools-band input[type="color"] { padding: 0; }
    .terrain-tools-texture-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .terrain-tools-texture-tile { min-width: 0; border: 1px solid #2C405E; border-radius: 6px; background: #0B1728; color: #DDE7F6; padding: 6px; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 7px; align-items: center; text-align: left; font: inherit; cursor: pointer; }
    .terrain-tools-texture-tile.is-active { border-color: #F7B84B; background: #21304A; color: #FFF0C2; }
    .terrain-tools-texture-swatch { width: 34px; height: 26px; border-radius: 4px; border: 1px solid rgba(221, 231, 246, 0.2); background-size: cover; background-position: center; box-shadow: inset 0 0 0 1px rgba(8, 19, 35, 0.35); }
    .terrain-tools-texture-tile span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .terrain-tools-message,
    .terrain-tools-empty { color: #9EAEC6; font-size: 12px; line-height: 1.4; }
    .terrain-brush-preview { position: absolute; z-index: 20; pointer-events: none; box-sizing: border-box; transform: translate(-50%, -50%); border: 2px solid rgba(247, 184, 75, 0.95); background: rgba(247, 184, 75, 0.08); box-shadow: 0 0 0 1px rgba(8, 19, 35, 0.75), 0 0 18px rgba(247, 184, 75, 0.35); }
    .terrain-brush-preview__inner { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box; border: 1px dashed rgba(231, 237, 247, 0.72); background: rgba(231, 237, 247, 0.06); }
  `;
  document.head.appendChild(style);
}

function numberField(field, label, value, min, max, step, disabled = false) {
  return `
    <label class="terrain-tools-field">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-field="${escapeHtml(field)}" value="${escapeHtml(String(value))}" min="${min}" max="${max}" step="${step}" ${disabled ? "disabled" : ""}>
    </label>
  `;
}

function sliderField(field, label, value, min, max, step) {
  return `
    <label class="terrain-tools-slider-field">
      <span>${escapeHtml(label)}</span>
      <input type="range" data-field="${escapeHtml(field)}" value="${escapeHtml(String(value))}" min="${min}" max="${max}" step="${step}">
      <output data-output-for="${escapeHtml(field)}">${escapeHtml(formatSliderValue(value))}</output>
    </label>
  `;
}

function formatSliderValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }
  if (Math.abs(number) >= 100) {
    return number.toFixed(0);
  }
  if (Math.abs(number) >= 10) {
    return number.toFixed(1).replace(/\.0$/, "");
  }
  return number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function checkboxField(field, label, checked) {
  return `
    <label class="terrain-tools-field">
      <span>${escapeHtml(label)}</span>
      <input type="checkbox" data-field="${escapeHtml(field)}"${checked ? " checked" : ""}>
    </label>
  `;
}

function selectField(field, label, value, options) {
  const optionHtml = options.map(([id, optionLabel]) => {
    const selected = id === value ? " selected" : "";
    return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(optionLabel)}</option>`;
  }).join("");
  return `
    <label class="terrain-tools-field">
      <span>${escapeHtml(label)}</span>
      <select data-field="${escapeHtml(field)}">${optionHtml}</select>
    </label>
  `;
}

function toolButton(tool, label, activeTool) {
  return `<button type="button" class="terrain-tools-tool${tool === activeTool ? " is-active" : ""}" data-brush-tool="${tool}">${escapeHtml(label)}</button>`;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function terrainSignature(terrain) {
  return terrain ? JSON.stringify(terrain) : "none";
}

function clampFinite(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clampIndex(value, count) {
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.round(value)));
}

function clampByte(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lerp(left, right, amount) {
  return left + (right - left) * clamp01(amount);
}

function fract(value) {
  return value - Math.floor(value);
}

function clampAtlasUv(value) {
  return clamp(value, 0.002, 0.998);
}

function resolveFallbackLayerColor(layerId) {
  let hash = 0;
  for (let index = 0; index < layerId.length; index += 1) {
    hash = ((hash << 5) - hash + layerId.charCodeAt(index)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 36%, 48%)`;
}

function toReadableLabel(filenameWithoutExtension) {
  return filenameWithoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fade(value) {
  return value * value * (3 - 2 * value);
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const runtime = new TerrainToolsPluginRuntime();

export const plugin = {
  manifest,
  activate: (context) => runtime.activate(context),
  deactivate: () => runtime.deactivate()
};

export default plugin;

//# sourceURL=edison-terrain-tools.js
