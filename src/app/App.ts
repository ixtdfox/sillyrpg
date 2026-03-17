import { Engine } from "@babylonjs/core";
import { GameManager } from "../core/game/GameManager";
import { LangManager } from "../core/lang/LangManager";

/**
 * Bootstraps Babylon runtime for SillyRPG.
 * This class owns engine setup, canvas wiring, render loop, and resize handling,
 * while delegating scene flow to GameManager.
 */
export class App {
  /** Canvas element used by Babylon engine. */
  private readonly canvas: HTMLCanvasElement;

  /** Babylon rendering engine instance. */
  private readonly engine: Engine;

  /** Shared language manager for the game session. */
  private readonly langManager: LangManager;

  /** Central game flow manager. */
  private readonly gameManager: GameManager;

  /**
   * Creates the application bootstrapper.
   *
   * @param canvasId - DOM id of the canvas element to bind Babylon to.
   */
  public constructor(canvasId: string) {
    const element = document.getElementById(canvasId);
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error(`Canvas with id '${canvasId}' was not found.`);
    }

    this.canvas = element;
    this.engine = new Engine(this.canvas, true);
    this.langManager = new LangManager();
    this.gameManager = new GameManager(this.engine, this.canvas, this.langManager);
  }

  /**
   * Starts game initialization and begins the Babylon render loop.
   *
   * @returns Promise that resolves when initial scene flow is started.
   */
  public async run(): Promise<void> {
    await this.gameManager.start();

    this.engine.runRenderLoop(() => {
      const deltaSeconds = this.engine.getDeltaTime() / 1000;
      this.gameManager.update(deltaSeconds);
      this.gameManager.getCurrentScene()?.render();
    });

    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }
}
