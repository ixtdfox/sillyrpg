import type {
  AbstractMesh,
  CascadedShadowGenerator,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator
} from "@babylonjs/core";

export type SceneShadowGenerator = ShadowGenerator | CascadedShadowGenerator;

export class LightingRig {
  private readonly shadowCasterIds: Set<number>;

  public constructor(
    private readonly ambientLight: HemisphericLight | null,
    private readonly sunLight: DirectionalLight | null,
    private readonly shadowGenerator: SceneShadowGenerator | null
  ) {
    this.shadowCasterIds = new Set();
  }

  public getAmbientLight(): HemisphericLight | null {
    return this.ambientLight;
  }

  public getSunLight(): DirectionalLight | null {
    return this.sunLight;
  }

  public getShadowGenerator(): SceneShadowGenerator | null {
    return this.shadowGenerator;
  }

  public hasShadows(): boolean {
    return this.shadowGenerator !== null;
  }

  public clearShadowCasters(): void {
    if (!this.shadowGenerator) {
      return;
    }

    const shadowCasterMeshes = this.shadowGenerator.getShadowMap()?.renderList ?? [];
    for (const mesh of shadowCasterMeshes) {
      this.shadowGenerator.removeShadowCaster(mesh, false);
    }

    this.shadowCasterIds.clear();
  }

  public registerShadowCaster(mesh: AbstractMesh): void {
    if (!this.shadowGenerator || this.shadowCasterIds.has(mesh.uniqueId)) {
      return;
    }

    this.shadowGenerator.addShadowCaster(mesh, false);
    this.shadowCasterIds.add(mesh.uniqueId);
  }

  public registerShadowCasters(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      this.registerShadowCaster(mesh);
    }
  }

  public dispose(): void {
    this.clearShadowCasters();
    this.shadowGenerator?.dispose();
    this.ambientLight?.dispose();
    this.sunLight?.dispose();
  }
}
