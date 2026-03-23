import type { Scene } from "@babylonjs/core";
import { Button, Control, Image, Rectangle, TextBlock } from "@babylonjs/gui";

interface SpriteRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface PhoneRuntimeDataSource {
  readonly getMoneyLabel: () => string;
}

enum PhoneTab {
  Map = "Map",
  Inv = "Inv",
  Log = "Log",
  Msg = "Msg"
}

interface TabButtonState {
  readonly defaultRegion: SpriteRegion;
  readonly pushedRegion: SpriteRegion;
  readonly image: Image;
}

const SPRITES_URL = "assets/sprites.png";
const FRAME_REGION: SpriteRegion = { x: 978, y: 0, w: 556, h: 916 };
const INFO_PANEL_REGION: SpriteRegion = { x: 0, y: 369, w: 478, h: 80 };

const TAB_LAYOUT: ReadonlyArray<{ readonly tab: PhoneTab; readonly x: number; readonly y: number; readonly w: number; readonly h: number }> = [
  { tab: PhoneTab.Map, x: 8, y: 181, w: 52, h: 38 },
  { tab: PhoneTab.Inv, x: 8, y: 226, w: 52, h: 38 },
  { tab: PhoneTab.Log, x: 8, y: 267, w: 52, h: 38 },
  { tab: PhoneTab.Msg, x: 8, y: 310, w: 52, h: 38 }
];

const TAB_SPRITES: Readonly<Record<PhoneTab, { readonly defaultRegion: SpriteRegion; readonly pushedRegion: SpriteRegion }>> = {
  [PhoneTab.Map]: {
    defaultRegion: { x: 0, y: 0, w: 164, h: 93 },
    pushedRegion: { x: 164, y: 0, w: 164, h: 93 }
  },
  [PhoneTab.Inv]: {
    defaultRegion: { x: 0, y: 94, w: 164, h: 93 },
    pushedRegion: { x: 164, y: 94, w: 164, h: 93 }
  },
  [PhoneTab.Log]: {
    defaultRegion: { x: 0, y: 185, w: 164, h: 93 },
    pushedRegion: { x: 164, y: 185, w: 164, h: 93 }
  },
  [PhoneTab.Msg]: {
    defaultRegion: { x: 0, y: 279, w: 164, h: 93 },
    pushedRegion: { x: 164, y: 279, w: 164, h: 93 }
  }
};

const CALL_BUTTON_DEFAULT_REGION: SpriteRegion = { x: 0, y: 701, w: 313, h: 158 };
const CALL_BUTTON_PUSHED_REGION: SpriteRegion = { x: 314, y: 701, w: 313, h: 158 };
const HANGUP_BUTTON_DEFAULT_REGION: SpriteRegion = { x: 0, y: 862, w: 313, h: 158 };
const HANGUP_BUTTON_PUSHED_REGION: SpriteRegion = { x: 314, y: 862, w: 313, h: 158 };
const PHONE_SCREEN_WIDTH = 405;
const PHONE_SCREEN_HEIGHT = 494;

/**
 * Stateful smartphone dialog widget for in-game UI.
 */
export class PhoneDialogUi {
  private readonly dialogRoot: Rectangle;
  private readonly phoneContainer: Rectangle;
  private readonly tabButtons: Map<PhoneTab, TabButtonState>;
  private readonly tabContentLabel: TextBlock;
  private readonly mapView: PhoneMapView;
  private readonly moneyText: TextBlock;
  private readonly dataSource: PhoneRuntimeDataSource;
  private activeTab: PhoneTab;

  public constructor(_scene: Scene, dataSource?: Partial<PhoneRuntimeDataSource>) {
    this.dataSource = {
      getMoneyLabel: dataSource?.getMoneyLabel ?? (() => "$1,250")
    };
    this.activeTab = PhoneTab.Inv;
    this.tabButtons = new Map<PhoneTab, TabButtonState>();

    this.dialogRoot = new Rectangle("phone-dialog-root");
    this.dialogRoot.width = "100%";
    this.dialogRoot.height = "100%";
    this.dialogRoot.thickness = 0;
    this.dialogRoot.isVisible = false;
    this.dialogRoot.isPointerBlocker = false;

    this.phoneContainer = new Rectangle("phone-dialog-container");
    this.phoneContainer.width = `${FRAME_REGION.w}px`;
    this.phoneContainer.height = `${FRAME_REGION.h}px`;
    this.phoneContainer.thickness = 0;
    this.phoneContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.phoneContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.phoneContainer.isPointerBlocker = true;
    this.dialogRoot.addControl(this.phoneContainer);

    const frameImage = this.createSpriteImage("phone-frame", FRAME_REGION, FRAME_REGION.w, FRAME_REGION.h);
    frameImage.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    frameImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.phoneContainer.addControl(frameImage);

    for (const tabLayout of TAB_LAYOUT) {
      const sprite = TAB_SPRITES[tabLayout.tab];
      const { button, image } = this.createSpriteButton(
        `phone-tab-${tabLayout.tab.toLowerCase()}`,
        tabLayout,
        sprite.defaultRegion,
        sprite.pushedRegion,
        () => this.setActiveTab(tabLayout.tab)
      );

      this.phoneContainer.addControl(button);
      this.tabButtons.set(tabLayout.tab, {
        image,
        defaultRegion: sprite.defaultRegion,
        pushedRegion: sprite.pushedRegion
      });
    }

    const infoPanel = this.createSpriteImage("phone-info-panel", INFO_PANEL_REGION, 465, 56);
    infoPanel.left = "48px";
    infoPanel.top = "682px";
    infoPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    infoPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.phoneContainer.addControl(infoPanel);

    this.moneyText = new TextBlock("phone-money-text", "");
    this.moneyText.left = "84px";
    this.moneyText.top = "701px";
    this.moneyText.width = "220px";
    this.moneyText.height = "72px";
    this.moneyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.moneyText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.moneyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.moneyText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.moneyText.color = "#D8C88E";
    this.moneyText.fontSize = 52;
    //this.phoneContainer.addControl(this.moneyText);

    const tabContentBackground = new Rectangle("phone-tab-content-background");
    tabContentBackground.left = "76px";
    tabContentBackground.top = "160px";
    tabContentBackground.width = `${PHONE_SCREEN_WIDTH}px`;
    tabContentBackground.height = `${PHONE_SCREEN_HEIGHT}px`;
    tabContentBackground.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tabContentBackground.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tabContentBackground.color = "#263146";
    tabContentBackground.background = "#101827CC";
    tabContentBackground.thickness = 1;
    tabContentBackground.cornerRadius = 8;
    tabContentBackground.isPointerBlocker = false;
    this.phoneContainer.addControl(tabContentBackground);

    this.tabContentLabel = new TextBlock("phone-tab-content-label", "");
    this.tabContentLabel.width = 0.92;
    this.tabContentLabel.height = 0.9;
    this.tabContentLabel.textWrapping = true;
    this.tabContentLabel.color = "#C5D0E8";
    this.tabContentLabel.fontSize = 28;
    tabContentBackground.addControl(this.tabContentLabel);

    this.mapView = new PhoneMapView();
    tabContentBackground.addControl(this.mapView.getRootControl());

    const { button: callButton } = this.createSpriteButton(
      "phone-call-button",
      { x: 43, y: 749, w: 130, h: 60 },
      CALL_BUTTON_DEFAULT_REGION,
      CALL_BUTTON_PUSHED_REGION,
      () => {
        // TODO: integrate outgoing call flow.
      },
      false
    );
    this.phoneContainer.addControl(callButton);

    const { button: hangupButton } = this.createSpriteButton(
      "phone-hangup-button",
      { x: 386, y: 749, w: 130, h: 60 },
      HANGUP_BUTTON_DEFAULT_REGION,
      HANGUP_BUTTON_PUSHED_REGION,
      () => {
        // TODO: integrate hangup / call cancellation flow.
      },
      false
    );
    this.phoneContainer.addControl(hangupButton);

    this.setActiveTab(this.activeTab);
    this.refreshRuntimeData();
  }

  public getRootControl(): Control {
    return this.dialogRoot;
  }

  public toggleVisibility(): void {
    this.setVisible(!this.dialogRoot.isVisible);
  }

  public setVisible(isVisible: boolean): void {
    this.dialogRoot.isVisible = isVisible;

    if (isVisible) {
      this.refreshRuntimeData();
    }
  }

  public dispose(): void {
    this.mapView.dispose();
    this.dialogRoot.dispose();
  }

  private setActiveTab(tab: PhoneTab): void {
    this.activeTab = tab;

    for (const [tabKey, tabState] of this.tabButtons.entries()) {
      const region = tabKey === tab ? tabState.pushedRegion : tabState.defaultRegion;
      this.applySpriteRegion(tabState.image, region);
    }

    const isMapTab = tab === PhoneTab.Map;
    this.tabContentLabel.isVisible = !isMapTab;
    this.mapView.setVisible(isMapTab);

    if (!isMapTab) {
      this.tabContentLabel.text = `${tab} tab placeholder`;
    }
  }

  private createSpriteImage(name: string, region: SpriteRegion, width: number, height: number): Image {
    const image = new Image(name, SPRITES_URL);
    image.width = `${width}px`;
    image.height = `${height}px`;
    image.stretch = Image.STRETCH_FILL;
    image.isHitTestVisible = false;
    this.applySpriteRegion(image, region);
    return image;
  }

  private createSpriteButton(
    name: string,
    layout: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
    defaultRegion: SpriteRegion,
    pushedRegion: SpriteRegion,
    onClick: () => void,
    isSticky = true
  ): { readonly button: Button; readonly image: Image } {
    const button = new Button(name);
    button.width = `${layout.w}px`;
    button.height = `${layout.h}px`;
    button.left = `${layout.x}px`;
    button.top = `${layout.y}px`;
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    button.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    button.thickness = 0;
    button.background = "transparent";

    const image = this.createSpriteImage(`${name}-image`, defaultRegion, layout.w, layout.h);
    button.addControl(image);

    if (isSticky) {
      button.onPointerUpObservable.add(() => {
        onClick();
      });
      return { button, image };
    }

    button.onPointerDownObservable.add(() => {
      this.applySpriteRegion(image, pushedRegion);
    });
    button.onPointerOutObservable.add(() => {
      this.applySpriteRegion(image, defaultRegion);
    });
    button.onPointerUpObservable.add(() => {
      this.applySpriteRegion(image, defaultRegion);
      onClick();
    });

    return { button, image };
  }

  private applySpriteRegion(image: Image, region: SpriteRegion): void {
    image.sourceLeft = region.x;
    image.sourceTop = region.y;
    image.sourceWidth = region.w;
    image.sourceHeight = region.h;
  }

  private refreshRuntimeData(): void {
    this.moneyText.text = this.dataSource.getMoneyLabel();
  }


}

const MAP_IMAGE_URL = "assets/map.png";
const MAP_WIDTH = 1536;
const MAP_HEIGHT = 1024;

class PhoneMapView {
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

  public constructor() {
    this.root = new Rectangle("phone-map-root");
    this.root.width = "100%";
    this.root.height = "100%";
    this.root.thickness = 0;
    this.root.isPointerBlocker = true;

    this.viewport = new Rectangle("phone-map-viewport");
    this.viewport.width = `${PHONE_SCREEN_WIDTH}px`;
    this.viewport.height = `${PHONE_SCREEN_HEIGHT}px`;
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
    this.mapImage.isPointerBlocker = true;
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
    this.offsetX = this.getAxisInitialOffset(MAP_WIDTH, this.getViewportWidth());
    this.offsetY = this.getAxisInitialOffset(MAP_HEIGHT, this.getViewportHeight());
    this.clampOffset();
  }

  private setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
    this.clampOffset();
    this.applyMapOffset();
  }

  private clampOffset(): void {
    this.offsetX = this.clampAxisOffset(this.offsetX, MAP_WIDTH, this.getViewportWidth());
    this.offsetY = this.clampAxisOffset(this.offsetY, MAP_HEIGHT, this.getViewportHeight());
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

  private getViewportWidth(): number {
    return PHONE_SCREEN_WIDTH;
  }

  private getViewportHeight(): number {
    return PHONE_SCREEN_HEIGHT;
  }
}
