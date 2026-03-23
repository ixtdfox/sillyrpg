import type { Scene } from "@babylonjs/core";
import { Control, Image, Rectangle } from "@babylonjs/gui";

const MAP_IMAGE_URL = "assets/map.png";
const MAP_WIDTH = 1536;
const MAP_HEIGHT = 1024;

export class PhoneMapView {
  private readonly viewportWidth: number;
  private readonly viewportHeight: number;
  private readonly root: Rectangle;
  private readonly viewport: Rectangle;
  private readonly mapImage: Image;
  private isDragging = false;
  private dragStartPointerX = 0;
  private dragStartPointerY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;
  private offsetX = 0;
  private offsetY = 0;

  public constructor(_scene: Scene, viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    this.root = new Rectangle("phone-map-root");
    this.root.width = "100%";
    this.root.height = "100%";
    this.root.thickness = 0;
    this.root.isPointerBlocker = true;

    this.viewport = new Rectangle("phone-map-viewport");
    this.viewport.width = `${viewportWidth}px`;
    this.viewport.height = `${viewportHeight}px`;
    this.viewport.thickness = 0;
    this.viewport.background = "transparent";
    this.viewport.clipChildren = true;
    this.viewport.isPointerBlocker = true;
    this.root.addControl(this.viewport);

    this.mapImage = new Image("phone-map-image", MAP_IMAGE_URL);
    this.mapImage.width = `${MAP_WIDTH}px`;
    this.mapImage.height = `${MAP_HEIGHT}px`;
    this.mapImage.stretch = Image.STRETCH_FILL;
    this.mapImage.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.mapImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.mapImage.isPointerBlocker = false;
    this.viewport.addControl(this.mapImage);

    this.initializeOffsets();
    this.registerDragInteractions();
    this.applyMapOffset();
  }

  public getRootControl(): Control {
    return this.root;
  }

  public setVisible(isVisible: boolean): void {
    this.root.isVisible = isVisible;
    if (!isVisible) {
      this.isDragging = false;
    }
  }

  public dispose(): void {
    this.root.dispose();
  }

  private registerDragInteractions(): void {
    this.viewport.onPointerDownObservable.add((pointerInfo) => {
      if (!this.root.isVisible || pointerInfo.buttonIndex !== 0) {
        return;
      }

      this.isDragging = true;
      this.dragStartPointerX = pointerInfo.x;
      this.dragStartPointerY = pointerInfo.y;
      this.dragStartOffsetX = this.offsetX;
      this.dragStartOffsetY = this.offsetY;
    });

    this.viewport.onPointerMoveObservable.add((pointerInfo) => {
      if (!this.isDragging || !this.root.isVisible) {
        return;
      }

      const deltaX = pointerInfo.x - this.dragStartPointerX;
      const deltaY = pointerInfo.y - this.dragStartPointerY;
      this.setOffset(this.dragStartOffsetX + deltaX, this.dragStartOffsetY + deltaY);
    });

    const endDrag = (): void => {
      this.isDragging = false;
    };

    this.viewport.onPointerUpObservable.add(endDrag);
    this.viewport.onPointerOutObservable.add(endDrag);
  }

  private initializeOffsets(): void {
    this.offsetX = this.getAxisInitialOffset(MAP_WIDTH, this.viewportWidth);
    this.offsetY = this.getAxisInitialOffset(MAP_HEIGHT, this.viewportHeight);
    this.clampOffset();
  }

  private setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
    this.clampOffset();
    this.applyMapOffset();
  }

  private clampOffset(): void {
    this.offsetX = this.clampAxisOffset(this.offsetX, MAP_WIDTH, this.viewportWidth);
    this.offsetY = this.clampAxisOffset(this.offsetY, MAP_HEIGHT, this.viewportHeight);
  }

  private clampAxisOffset(offset: number, mapSize: number, viewportSize: number): number {
    if (mapSize <= viewportSize) {
      return (viewportSize - mapSize) * 0.5;
    }

    const minOffset = viewportSize - mapSize;
    const maxOffset = 0;
    return Math.min(Math.max(offset, minOffset), maxOffset);
  }

  private getAxisInitialOffset(mapSize: number, viewportSize: number): number {
    if (mapSize <= viewportSize) {
      return (viewportSize - mapSize) * 0.5;
    }

    return 0;
  }

  private applyMapOffset(): void {
    this.mapImage.left = `${this.offsetX}px`;
    this.mapImage.top = `${this.offsetY}px`;
  }
}
