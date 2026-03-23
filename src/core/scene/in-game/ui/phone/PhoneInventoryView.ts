import { Button, Control, Image, Rectangle, Slider, TextBlock } from "@babylonjs/gui";

interface SpriteRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const SPRITES_URL = "assets/sprites.png";
const CELL_REGION: SpriteRegion = { x: 333, y: 0, w: 133, h: 135 };

const GRID_COLUMNS = 3;
const GRID_ROWS = 10;
const CELL_WIDTH = 133;
const CELL_HEIGHT = 135;
const GRID_X = 5;
const GRID_Y = 0;
const VIEWPORT_WIDTH = 399;
const VIEWPORT_HEIGHT = 494;
const GRID_CONTENT_HEIGHT = GRID_ROWS * CELL_HEIGHT;
const SCROLLBAR_WIDTH = 6;
const SCROLLBAR_HEIGHT = 482;

export class PhoneInventoryView {
  private readonly root: Rectangle;
  private readonly viewport: Rectangle;
  private readonly gridContent: Rectangle;
  private readonly contextMenu: Rectangle;
  private readonly selectionFrame: Rectangle;
  private readonly scrollBar: Slider;
  private pointerStartedInsideCell = false;
  private scrollOffset = 0;
  private selectedCellIndex: number | null = null;

  public constructor(viewportWidth: number, viewportHeight: number) {
    this.root = new Rectangle("phone-inventory-root");
    this.root.width = "100%";
    this.root.height = "100%";
    this.root.thickness = 0;
    this.root.isPointerBlocker = true;

    this.viewport = new Rectangle("phone-inventory-viewport");
    this.viewport.width = `${Math.min(viewportWidth, VIEWPORT_WIDTH)}px`;
    this.viewport.height = `${Math.min(viewportHeight, VIEWPORT_HEIGHT)}px`;
    this.viewport.thickness = 0;
    this.viewport.background = "transparent";
    this.viewport.clipChildren = true;
    this.viewport.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.viewport.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.viewport.isPointerBlocker = true;
    this.root.addControl(this.viewport);

    this.viewport.onPointerDownObservable.add(() => {
      if (!this.pointerStartedInsideCell) {
        this.clearSelection();
      }
      this.pointerStartedInsideCell = false;
    });

    this.gridContent = new Rectangle("phone-inventory-grid-content");
    this.gridContent.width = `${VIEWPORT_WIDTH}px`;
    this.gridContent.height = `${GRID_CONTENT_HEIGHT}px`;
    this.gridContent.thickness = 0;
    this.gridContent.background = "transparent";
    this.gridContent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.gridContent.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.gridContent.left = `${GRID_X}px`;
    this.gridContent.top = `${GRID_Y}px`;
    this.gridContent.isPointerBlocker = false;
    this.viewport.addControl(this.gridContent);

    this.selectionFrame = new Rectangle("phone-inventory-selection-frame");
    this.selectionFrame.width = `${CELL_WIDTH}px`;
    this.selectionFrame.height = `${CELL_HEIGHT}px`;
    this.selectionFrame.thickness = 3;
    this.selectionFrame.color = "#F2D95C";
    this.selectionFrame.background = "transparent";
    this.selectionFrame.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.selectionFrame.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.selectionFrame.isVisible = false;
    this.selectionFrame.isPointerBlocker = false;
    this.gridContent.addControl(this.selectionFrame);

    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLUMNS; col += 1) {
        const cellIndex = row * GRID_COLUMNS + col;
        const cellButton = new Button(`phone-inventory-cell-${cellIndex}`);
        cellButton.width = `${CELL_WIDTH}px`;
        cellButton.height = `${CELL_HEIGHT}px`;
        cellButton.left = `${col * CELL_WIDTH}px`;
        cellButton.top = `${row * CELL_HEIGHT}px`;
        cellButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        cellButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        cellButton.thickness = 0;
        cellButton.background = "transparent";
        cellButton.onPointerDownObservable.add(() => {
          this.pointerStartedInsideCell = true;
        });

        const cellImage = new Image(`phone-inventory-cell-image-${cellIndex}`, SPRITES_URL);
        cellImage.width = `${CELL_WIDTH}px`;
        cellImage.height = `${CELL_HEIGHT}px`;
        cellImage.stretch = Image.STRETCH_FILL;
        cellImage.sourceLeft = CELL_REGION.x;
        cellImage.sourceTop = CELL_REGION.y;
        cellImage.sourceWidth = CELL_REGION.w;
        cellImage.sourceHeight = CELL_REGION.h;
        cellImage.isPointerBlocker = false;
        cellButton.addControl(cellImage);

        cellButton.onPointerUpObservable.add(() => {
          this.selectCell(cellIndex, row, col);
        });

        this.gridContent.addControl(cellButton);
      }
    }

    this.scrollBar = new Slider("phone-inventory-scrollbar");
    this.scrollBar.minimum = 0;
    this.scrollBar.maximum = GRID_CONTENT_HEIGHT - VIEWPORT_HEIGHT;
    this.scrollBar.value = 0;
    this.scrollBar.isVertical = true;
    this.scrollBar.height = `${SCROLLBAR_HEIGHT}px`;
    this.scrollBar.width = `${SCROLLBAR_WIDTH}px`;
    this.scrollBar.left = "398px";
    this.scrollBar.top = "6px";
    this.scrollBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.scrollBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scrollBar.background = "#1B1A18CC";
    this.scrollBar.color = "#D8C88E";
    this.scrollBar.borderColor = "#7B6B3A";
    this.scrollBar.isThumbClamped = true;
    this.scrollBar.displayThumb = true;
    this.scrollBar.step = 1;
    this.scrollBar.onValueChangedObservable.add((value) => {
      this.setScrollOffset(value);
    });
    this.viewport.addControl(this.scrollBar);

    this.contextMenu = this.createContextMenu();
    this.viewport.addControl(this.contextMenu);

    this.setVisible(false);
  }

  public getRootControl(): Control {
    return this.root;
  }

  public setVisible(isVisible: boolean): void {
    this.root.isVisible = isVisible;
    this.pointerStartedInsideCell = false;
    if (!isVisible) {
      this.clearSelection();
    }
  }

  public dispose(): void {
    this.root.dispose();
  }

  private setScrollOffset(offset: number): void {
    this.scrollOffset = Math.max(0, Math.min(offset, GRID_CONTENT_HEIGHT - VIEWPORT_HEIGHT));
    this.gridContent.top = `${GRID_Y - this.scrollOffset}px`;

    if (this.selectedCellIndex !== null) {
      this.updateMenuPosition(this.selectedCellIndex);
    }
  }

  private selectCell(cellIndex: number, row: number, col: number): void {
    this.selectedCellIndex = cellIndex;
    this.selectionFrame.isVisible = true;
    this.selectionFrame.left = `${col * CELL_WIDTH}px`;
    this.selectionFrame.top = `${row * CELL_HEIGHT}px`;

    this.contextMenu.isVisible = true;
    this.updateMenuPosition(cellIndex);
  }

  private clearSelection(): void {
    this.selectedCellIndex = null;
    this.selectionFrame.isVisible = false;
    this.contextMenu.isVisible = false;
  }

  private createContextMenu(): Rectangle {
    const menu = new Rectangle("phone-inventory-context-menu");
    menu.width = "112px";
    menu.height = "52px";
    menu.thickness = 1;
    menu.color = "#6B5C2C";
    menu.background = "#18140DEB";
    menu.cornerRadius = 4;
    menu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    menu.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    menu.isVisible = false;
    menu.isPointerBlocker = true;

    const dropButton = new Button("phone-inventory-drop-button");
    dropButton.width = "100%";
    dropButton.height = "100%";
    dropButton.thickness = 0;
    dropButton.background = "transparent";

    const dropText = new TextBlock("phone-inventory-drop-text", "Drop");
    dropText.color = "#F1D271";
    dropText.fontSize = 24;
    dropButton.addControl(dropText);

    dropButton.onPointerUpObservable.add(() => {
      // TODO: wire inventory actions once item data exists.
    });

    menu.addControl(dropButton);
    return menu;
  }

  private updateMenuPosition(cellIndex: number): void {
    const row = Math.floor(cellIndex / GRID_COLUMNS);
    const col = cellIndex % GRID_COLUMNS;
    const cellLeft = GRID_X + col * CELL_WIDTH;
    const cellTop = GRID_Y + row * CELL_HEIGHT - this.scrollOffset;
    const menuWidth = 112;
    const menuHeight = 52;

    let menuLeft = cellLeft + CELL_WIDTH - menuWidth;
    let menuTop = cellTop + 8;

    menuLeft = Math.max(0, Math.min(menuLeft, VIEWPORT_WIDTH - menuWidth));
    menuTop = Math.max(0, Math.min(menuTop, VIEWPORT_HEIGHT - menuHeight));

    this.contextMenu.left = `${menuLeft}px`;
    this.contextMenu.top = `${menuTop}px`;
  }
}
