import { Color3, Color4, type AbstractMesh, type Scene as BabylonScene } from "@babylonjs/core";
import { LightingRig } from "./LightingRig";
import { LightingRigFactory } from "./LightingRigFactory";
import type { SceneLightingDescriptor } from "./LightingTypes";

export class SceneLightingController {
  private rig: LightingRig | null = null;

  public constructor(
    private readonly scene: BabylonScene,
    private readonly factory: LightingRigFactory = new LightingRigFactory()
  ) {}

  public apply(descriptor: SceneLightingDescriptor): void {
    this.disposeRig();
    this.scene.clearColor = this.toClearColor(descriptor.clearColor);
    this.rig = this.factory.create(this.scene, descriptor);
  }

  public getRig(): LightingRig | null {
    return this.rig;
  }

  public hasShadows(): boolean {
    return this.rig?.hasShadows() ?? false;
  }

  public clearShadowCasters(): void {
    this.rig?.clearShadowCasters();
  }

  public addShadowCaster(mesh: AbstractMesh): void {
    this.rig?.registerShadowCaster(mesh);
  }

  public setShadowReceiver(mesh: AbstractMesh, receive: boolean): void {
    if (!mesh.isDisposed()) {
      mesh.receiveShadows = receive;
    }
  }

  public registerShadowCasters(meshes: readonly AbstractMesh[]): void {
    this.rig?.registerShadowCasters(meshes);
  }

  public registerShadowReceivers(meshes: readonly AbstractMesh[]): void {
    if (!this.rig?.getShadowGenerator()) {
      for (const mesh of meshes) {
        this.setShadowReceiver(mesh, false);
      }
      return;
    }

    for (const mesh of meshes) {
      if (!mesh.isDisposed()) {
        mesh.receiveShadows = true;
      }
    }
  }

  public dispose(): void {
    this.disposeRig();
  }

  private disposeRig(): void {
    this.rig?.dispose();
    this.rig = null;
  }

  private toClearColor(value: string | undefined): Color4 {
    const color = this.toColor3(value, "#8DB7D6");
    return new Color4(color.r, color.g, color.b, 1);
  }

  private toColor3(value: string | undefined, fallback: string): Color3 {
    if (value) {
      try {
        return Color3.FromHexString(value);
      } catch {
        // Runtime descriptors can be assembled outside the JSON parser; keep scene setup resilient.
      }
    }

    return Color3.FromHexString(fallback);
  }
}
