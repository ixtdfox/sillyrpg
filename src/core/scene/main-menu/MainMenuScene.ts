import { Color4, Engine, HemisphericLight, KeyboardEventTypes, Scene as BabylonScene, FreeCamera, Vector3 } from "@babylonjs/core";
import type { LangManager } from "../../lang/LangManager";
import type { Scene } from "../Scene";
import type { MainMenuAction } from "./MainMenuAction";
import { MainMenuCommand } from "./MainMenuCommand";
import { MainMenuUi } from "./MainMenuUi";

/**
 * Implements the game's main menu scene with Babylon GUI.
 * It maps mouse and keyboard input to command strings and routes all actions
 * through the scene input handler.
 */
export class MainMenuScene implements Scene {
  /** Babylon engine reference used to create the scene. */
  private readonly engine: Engine;

  /** Canvas hosting Babylon rendering and input events. */
  private readonly canvas: HTMLCanvasElement;

  /** Shared localization service for menu texts. */
  private readonly langManager: LangManager;

  /** Ordered menu actions used for rendering and selection. */
  private readonly actions: MainMenuAction[];

  /** Babylon scene instance after creation. */
  private scene: BabylonScene | null;

  /** GUI wrapper managing menu controls. */
  private ui: MainMenuUi | null;

  /** Index of the currently selected action. */
  private selectedIndex: number;

  /**
   * Creates a new main menu scene with explicit runtime dependencies.
   *
   * @param engine - Babylon engine for scene creation.
   * @param canvas - Canvas element used by Babylon.
   * @param langManager - Localization manager for UI translations.
   */
  public constructor(engine: Engine, canvas: HTMLCanvasElement, langManager: LangManager) {
    this.engine = engine;
    this.canvas = canvas;
    this.langManager = langManager;
    this.scene = null;
    this.ui = null;
    this.selectedIndex = 0;
    this.actions = [
      { command: MainMenuCommand.NEW_GAME, labelKey: "newGame" },
      { command: MainMenuCommand.CONTINUE, labelKey: "continueGame" },
      { command: MainMenuCommand.LOAD_GAME, labelKey: "loadGame" },
      { command: MainMenuCommand.SETTINGS, labelKey: "settings" },
      { command: MainMenuCommand.TEST_COMBAT, labelKey: "testCombat" },
      { command: MainMenuCommand.EXIT, labelKey: "exit" }
    ];
  }

  /**
   * Creates the Babylon scene, camera/light defaults, and full menu UI.
   *
   * @returns Created Babylon scene ready to render.
   */
  public createScene(): BabylonScene {
    this.scene = new BabylonScene(this.engine);
    this.scene.clearColor = new Color4(0.03, 0.04, 0.09, 1.0);

    this.createEnvironment();

    this.ui = new MainMenuUi(
        this.scene,
        this.actions,
        (command) => this.processInput(command),
        (command) => this.handleHoveredAction(command)
    );


    this.refreshUiText();
    this.applySelection();
    this.attachKeyboardInput();

    this.scene.onDisposeObservable.add(() => {
      this.ui?.dispose();
      this.ui = null;
    });


    const camera = new FreeCamera("main-menu-camera", new Vector3(0, 0, -10), this.scene);
    camera.setTarget(Vector3.Zero());
    camera.attachControl(this.canvas, true);
    this.scene.activeCamera = camera;

    return this.scene;
  }

  /**
   * Synchronizes keyboard selection state with the menu item currently hovered by mouse.
   *
   * @param command - Hovered menu action command.
   * @returns No return value.
   */
  private handleHoveredAction(command: MainMenuCommand): void {
    const hoveredIndex = this.actions.findIndex((action) => action.command === command);
    if (hoveredIndex === -1) {
      return;
    }

    this.selectedIndex = hoveredIndex;
    this.applySelection();
  }

  /**
   * Handles all menu commands from keyboard and mouse interactions.
   *
   * @param input - Command string defining the requested action.
   * @returns No return value.
   * @throws Error if called before scene initialization.
   */
  public processInput(input: string): void {
    this.ensureInitialized();

    switch (input) {
      case MainMenuCommand.NAV_UP:
        this.selectedIndex = (this.selectedIndex - 1 + this.actions.length) % this.actions.length;
        this.applySelection();
        break;
      case MainMenuCommand.NAV_DOWN:
        this.selectedIndex = (this.selectedIndex + 1) % this.actions.length;
        this.applySelection();
        break;
      case MainMenuCommand.ACTIVATE_SELECTED:
        this.processInput(this.actions[this.selectedIndex].command);
        break;
      case MainMenuCommand.NEW_GAME:
      case MainMenuCommand.CONTINUE:
      case MainMenuCommand.LOAD_GAME:
      case MainMenuCommand.SETTINGS:
      case MainMenuCommand.TEST_COMBAT:
      case MainMenuCommand.EXIT:
        console.log(this.resolveActionLabel(input as MainMenuCommand));
        break;
      case MainMenuCommand.SET_LANG_ENG:
        this.langManager.setLanguage("eng");
        this.refreshUiText();
        break;
      case MainMenuCommand.SET_LANG_RU:
        this.langManager.setLanguage("ru");
        this.refreshUiText();
        break;
      default:
        console.log(`Unknown command: ${input}`);
        break;
    }
  }

  /**
   * Builds minimal 3D environment data to keep Babylon scene valid and lit.
   *
   * @returns No return value.
   */
  private createEnvironment(): void {
    if (!this.scene) {
      return;
    }

    const light = new HemisphericLight("menu-light", new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.8;
  }

  /**
   * Installs keyboard listeners that route key actions into processInput.
   *
   * @returns No return value.
   */
  private attachKeyboardInput(): void {
    this.scene?.onKeyboardObservable.add((keyboardInfo) => {
      if (keyboardInfo.type !== KeyboardEventTypes.KEYDOWN) {
        return;
      }

      switch (keyboardInfo.event.key) {
        case "ArrowUp":
          this.processInput(MainMenuCommand.NAV_UP);
          break;
        case "ArrowDown":
          this.processInput(MainMenuCommand.NAV_DOWN);
          break;
        case "Enter":
          this.processInput(MainMenuCommand.ACTIVATE_SELECTED);
          break;
        default:
          break;
      }
    });
  }

  /**
   * Updates all localized UI text controls from the active language.
   *
   * @returns No return value.
   */
  private refreshUiText(): void {
    const uiText = this.langManager.getUi();
    this.ui?.refreshTexts(uiText, this.actions);
  }

  /**
   * Applies selected-item highlighting in the GUI.
   *
   * @returns No return value.
   */
  private applySelection(): void {
    const currentAction = this.actions[this.selectedIndex];
    this.ui?.updateSelection(currentAction.command);
  }

  /**
   * Resolves the current localized label for an action command.
   *
   * @param command - Action command to translate.
   * @returns Localized menu label.
   */
  private resolveActionLabel(command: MainMenuCommand): string {
    const action = this.actions.find((candidate) => candidate.command === command);
    if (!action) {
      return command;
    }

    return this.langManager.getUi()[action.labelKey] ?? action.labelKey;
  }

  /**
   * Validates that scene and UI are initialized before input handling.
   *
   * @returns No return value.
   * @throws Error when scene has not been created yet.
   */
  private ensureInitialized(): void {
    if (!this.scene || !this.ui) {
      throw new Error("MainMenuScene is not initialized. Call createScene() first.");
    }
  }
}
