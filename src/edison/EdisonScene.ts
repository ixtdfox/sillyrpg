import { Color4, Engine, Scene as BabylonScene } from "@babylonjs/core";
import type { LangManager } from "../core/lang/LangManager";
import type { Scene } from "../core/scene/Scene";
import { EdisonRuntime } from "./EdisonRuntime";
import { EdisonUi } from "./ui/EdisonUi";

export class EdisonScene implements Scene {
  private runtime: EdisonRuntime | null = null;
  private ui: EdisonUi | null = null;

  public constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    private readonly langManager: LangManager,
    private readonly onBackToMenu: () => void
  ) {}

  public async createScene(): Promise<BabylonScene> {
    const scene = new BabylonScene(this.engine);
    scene.clearColor = new Color4(0.03, 0.06, 0.11, 1);

    this.runtime = new EdisonRuntime(this.engine, scene, this.canvas, this.langManager, this.onBackToMenu);
    this.ui = new EdisonUi();
    this.ui.bind(this.runtime.getContext());
    await this.runtime.initialize();

    scene.onBeforeRenderObservable.add(() => {
      this.runtime?.update(this.engine.getDeltaTime() / 1000);
    });

    scene.onDisposeObservable.addOnce(() => {
      this.runtime?.dispose();
      this.runtime = null;
      this.ui?.dispose();
      this.ui = null;
    });

    return scene;
  }

  public processInput(input: string): void {
    console.log(`Edison input received: ${input}`);
  }
}
