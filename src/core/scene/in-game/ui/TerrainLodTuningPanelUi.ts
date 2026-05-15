import { AdvancedDynamicTexture, Control, Rectangle, Slider, StackPanel, TextBlock } from "@babylonjs/gui";
import type { TerrainQuadtreeLodRuntimeTuning } from "../../../world/terrain/lod/TerrainQuadtreeLodTypes";

export interface TerrainLodTuningPanelUiOptions {
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly step?: number;
}

/**
 * Runtime terrain LOD distance tuning panel.
 */
export class TerrainLodTuningPanelUi {
  private readonly texture: AdvancedDynamicTexture;
  private readonly root: Rectangle;
  private readonly lod0Value: TextBlock;
  private readonly lod1Value: TextBlock;
  private readonly lod0Slider: Slider;
  private readonly lod1Slider: Slider;
  private readonly onChange: (tuning: TerrainQuadtreeLodRuntimeTuning) => void;
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly step: number;
  private currentTuning: TerrainQuadtreeLodRuntimeTuning;
  private isSyncing: boolean;
  private isDisposed: boolean;

  public constructor(
    texture: AdvancedDynamicTexture,
    initialTuning: TerrainQuadtreeLodRuntimeTuning,
    onChange: (tuning: TerrainQuadtreeLodRuntimeTuning) => void,
    options: TerrainLodTuningPanelUiOptions = {}
  ) {
    this.texture = texture;
    this.onChange = onChange;
    this.minDistance = Math.max(0.0001, options.minDistance ?? 8);
    this.maxDistance = Math.max(this.minDistance + 1, options.maxDistance ?? 320);
    this.step = Math.max(0.0001, options.step ?? 4);
    this.currentTuning = this.normalizeTuning(initialTuning);
    this.isSyncing = false;
    this.isDisposed = false;

    this.root = new Rectangle("terrain-lod-tuning-panel");
    this.root.width = "330px";
    this.root.height = "190px";
    this.root.thickness = 1;
    this.root.cornerRadius = 6;
    this.root.color = "#4B5563";
    this.root.background = "#111827E6";
    this.root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.root.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.root.left = "16px";
    this.root.top = "72px";
    this.root.zIndex = 18;
    this.root.isVisible = false;
    this.root.isPointerBlocker = true;

    const content = new StackPanel("terrain-lod-tuning-panel-content");
    content.isVertical = true;
    content.width = "100%";
    content.height = "100%";
    content.paddingLeft = "12px";
    content.paddingTop = "10px";
    content.paddingRight = "12px";
    this.root.addControl(content);

    const title = new TextBlock("terrain-lod-tuning-title", "Terrain LOD distances");
    title.height = "24px";
    title.color = "#F9FAFB";
    title.fontSize = 15;
    title.fontFamily = "monospace";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    content.addControl(title);

    const lod0Controls = this.createSliderControls("lod0", "LOD0 full-res", this.currentTuning.lod0Distance);
    this.lod0Value = lod0Controls.value;
    this.lod0Slider = lod0Controls.slider;
    content.addControl(lod0Controls.root);

    const lod1Controls = this.createSliderControls("lod1", "LOD1 starts", this.currentTuning.lod1Distance);
    this.lod1Value = lod1Controls.value;
    this.lod1Slider = lod1Controls.slider;
    content.addControl(lod1Controls.root);

    this.lod0Slider.onValueChangedObservable.add(() => {
      this.handleSliderChanged();
    });
    this.lod1Slider.onValueChangedObservable.add(() => {
      this.handleSliderChanged();
    });
    this.applyTuning(this.currentTuning, false);
    this.texture.addControl(this.root);
  }

  public toggle(): boolean {
    this.setVisible(!this.root.isVisible);
    return this.root.isVisible;
  }

  public setVisible(isVisible: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.root.isVisible = isVisible;
  }

  public setTuning(tuning: TerrainQuadtreeLodRuntimeTuning): void {
    this.applyTuning(tuning, false);
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.texture.removeControl(this.root);
    this.root.dispose();
    this.isDisposed = true;
  }

  private createSliderControls(
    id: string,
    label: string,
    value: number
  ): { readonly root: StackPanel; readonly value: TextBlock; readonly slider: Slider } {
    const root = new StackPanel(`terrain-lod-tuning-${id}-root`);
    root.isVertical = true;
    root.height = "62px";
    root.width = "100%";
    root.paddingTop = "8px";

    const header = new StackPanel(`terrain-lod-tuning-${id}-header`);
    header.isVertical = false;
    header.height = "22px";
    header.width = "100%";
    root.addControl(header);

    const labelBlock = new TextBlock(`terrain-lod-tuning-${id}-label`, label);
    labelBlock.width = "190px";
    labelBlock.height = "22px";
    labelBlock.color = "#D1D5DB";
    labelBlock.fontSize = 13;
    labelBlock.fontFamily = "monospace";
    labelBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.addControl(labelBlock);

    const valueBlock = new TextBlock(`terrain-lod-tuning-${id}-value`, this.formatDistance(value));
    valueBlock.width = "90px";
    valueBlock.height = "22px";
    valueBlock.color = "#F9FAFB";
    valueBlock.fontSize = 13;
    valueBlock.fontFamily = "monospace";
    valueBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    header.addControl(valueBlock);

    const slider = new Slider(`terrain-lod-tuning-${id}-slider`);
    slider.minimum = this.minDistance;
    slider.maximum = this.maxDistance;
    slider.step = this.step;
    slider.value = value;
    slider.width = "280px";
    slider.height = "24px";
    slider.color = "#38BDF8";
    slider.background = "#374151";
    slider.borderColor = "#6B7280";
    slider.thumbColor = "#F9FAFB";
    slider.displayThumb = true;
    root.addControl(slider);

    return {
      root,
      value: valueBlock,
      slider
    };
  }

  private handleSliderChanged(): void {
    if (this.isSyncing) {
      return;
    }

    this.applyTuning({
      lod0Distance: this.lod0Slider.value,
      lod1Distance: this.lod1Slider.value
    }, true);
  }

  private applyTuning(tuning: TerrainQuadtreeLodRuntimeTuning, emit: boolean): void {
    const normalized = this.normalizeTuning(tuning);
    this.currentTuning = normalized;
    this.isSyncing = true;
    this.lod0Slider.value = normalized.lod0Distance;
    this.lod1Slider.value = normalized.lod1Distance;
    this.isSyncing = false;
    this.lod0Value.text = this.formatDistance(normalized.lod0Distance);
    this.lod1Value.text = this.formatDistance(normalized.lod1Distance);
    if (emit) {
      this.onChange(normalized);
    }
  }

  private normalizeTuning(tuning: TerrainQuadtreeLodRuntimeTuning): TerrainQuadtreeLodRuntimeTuning {
    const maxLod0Distance = Math.max(this.minDistance, this.maxDistance - this.step);
    const lod0Distance = this.snapDistance(this.clamp(tuning.lod0Distance, this.minDistance, maxLod0Distance));
    const lod1Distance = this.snapDistance(this.clamp(tuning.lod1Distance, lod0Distance + this.step, this.maxDistance));
    return {
      lod0Distance,
      lod1Distance
    };
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, value));
  }

  private snapDistance(value: number): number {
    return Math.round(value / this.step) * this.step;
  }

  private formatDistance(value: number): string {
    return `${value.toFixed(0)}m`;
  }
}
