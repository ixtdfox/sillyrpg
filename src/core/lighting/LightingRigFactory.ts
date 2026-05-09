import {
  CascadedShadowGenerator,
  Color3,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  Vector3,
  type Scene
} from "@babylonjs/core";
import { LightingRig } from "./LightingRig";
import type { SceneShadowGenerator } from "./LightingRig";
import type { LightingVector3Tuple, SceneLightingDescriptor, ShadowFilterMode } from "./LightingTypes";

const AMBIENT_LIGHT_NAME = "global-ambient-light";
const SUN_LIGHT_NAME = "global-sun-light";
const DEFAULT_AMBIENT_DIRECTION: LightingVector3Tuple = [0, 1, 0];
const DEFAULT_SUN_DIRECTION: LightingVector3Tuple = [-0.55, -1.0, -0.35];
const DEFAULT_SUN_POSITION: LightingVector3Tuple = [60, 90, 40];

export class LightingRigFactory {
  public create(scene: Scene, descriptor: SceneLightingDescriptor): LightingRig {
    const ambientLight = descriptor.ambient?.enabled === false ? null : this.createAmbientLight(scene, descriptor);
    const sunLight = descriptor.sun?.enabled === false ? null : this.createSunLight(scene, descriptor);
    const shadowGenerator = this.createShadowGenerator(descriptor, sunLight);

    return new LightingRig(ambientLight, sunLight, shadowGenerator);
  }

  private createAmbientLight(scene: Scene, descriptor: SceneLightingDescriptor): HemisphericLight {
    const ambient = descriptor.ambient;
    const light = new HemisphericLight(
      AMBIENT_LIGHT_NAME,
      this.toDirectionVector3(ambient?.direction, DEFAULT_AMBIENT_DIRECTION),
      scene
    );
    light.intensity = this.clampIntensity(ambient?.intensity, 0.55);
    light.diffuse = this.toColor3(ambient?.diffuse, "#FFFFFF");
    light.specular = this.toColor3(ambient?.specular, "#DDEEFF");
    light.groundColor = this.toColor3(ambient?.groundColor, "#6E7565");
    return light;
  }

  private createSunLight(scene: Scene, descriptor: SceneLightingDescriptor): DirectionalLight {
    const sun = descriptor.sun;
    const light = new DirectionalLight(
      SUN_LIGHT_NAME,
      this.toDirectionVector3(sun?.direction, DEFAULT_SUN_DIRECTION),
      scene
    );
    light.position = this.toVector3(sun?.position, DEFAULT_SUN_POSITION);
    light.intensity = this.clampIntensity(sun?.intensity, 1.05);
    light.diffuse = this.toColor3(sun?.diffuse, "#FFF4D6");
    light.specular = this.toColor3(sun?.specular, "#FFFFFF");
    return light;
  }

  private createShadowGenerator(
    descriptor: SceneLightingDescriptor,
    sunLight: DirectionalLight | null
  ): SceneShadowGenerator | null {
    if (descriptor.shadows?.enabled !== true || !sunLight) {
      return null;
    }

    const mapSize = this.toShadowMapSize(descriptor.shadows.mapSize);
    const generator =
      descriptor.shadows.generator !== "standard" && CascadedShadowGenerator.IsSupported
        ? new CascadedShadowGenerator(mapSize, sunLight)
        : new ShadowGenerator(mapSize, sunLight);

    this.configureShadowGenerator(generator, descriptor);
    return generator;
  }

  private configureShadowGenerator(generator: SceneShadowGenerator, descriptor: SceneLightingDescriptor): void {
    const shadows = descriptor.shadows;
    if (!shadows) {
      return;
    }

    const filter = this.resolveShadowFilterMode(shadows);
    generator.darkness = this.clampNumber(shadows.darkness, 0.45, 0, 1);
    generator.usePercentageCloserFiltering = false;
    generator.useExponentialShadowMap = false;
    generator.useBlurExponentialShadowMap = false;
    if (filter === "pcf") {
      generator.usePercentageCloserFiltering = true;
    } else if (filter === "esm") {
      generator.useExponentialShadowMap = true;
    } else if (filter === "blurEsm") {
      generator.useBlurExponentialShadowMap = true;
    }
    generator.blurKernel = this.clampNumber(shadows.blurKernel, 0, 0, 128);
    generator.bias = this.clampNumber(shadows.bias, 0.0005, 0, 0.1);
    generator.normalBias = this.clampNumber(shadows.normalBias, 0.02, 0, 10);
    generator.depthScale = this.clampNumber(shadows.depthScale, 60, 1, 1000);

    if (generator instanceof CascadedShadowGenerator) {
      generator.lambda = this.clampNumber(shadows.lambda, 0.65, 0, 1);
    }
  }

  private resolveShadowFilterMode(shadows: NonNullable<SceneLightingDescriptor["shadows"]>): ShadowFilterMode {
    if (shadows.filter === "none" || shadows.filter === "pcf" || shadows.filter === "esm" || shadows.filter === "blurEsm") {
      return shadows.filter;
    }

    if (shadows.usePercentageCloserFiltering === true) {
      return "pcf";
    }

    if (shadows.useBlurExponentialShadowMap === true) {
      return "blurEsm";
    }

    return "none";
  }

  private toVector3(value: LightingVector3Tuple | undefined, fallback: LightingVector3Tuple): Vector3 {
    const source = value ?? fallback;
    return new Vector3(source[0], source[1], source[2]);
  }

  private toDirectionVector3(value: LightingVector3Tuple | undefined, fallback: LightingVector3Tuple): Vector3 {
    const vector = this.toVector3(value, fallback);
    if (vector.lengthSquared() <= 0.000001) {
      return this.toVector3(fallback, DEFAULT_AMBIENT_DIRECTION).normalize();
    }

    return vector.normalize();
  }

  private toColor3(value: string | undefined, fallback: string): Color3 {
    if (value) {
      try {
        return Color3.FromHexString(value);
      } catch {
        // Runtime descriptors can be assembled outside the JSON parser; keep Babylon resource creation resilient.
      }
    }

    return Color3.FromHexString(fallback);
  }

  private clampIntensity(value: number | undefined, fallback: number): number {
    return this.clampNumber(value, fallback, 0, 10);
  }

  private toShadowMapSize(value: number | undefined): number {
    const parsed = this.clampNumber(value, 2048, 512, 4096);
    return Math.round(parsed);
  }

  private clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, value));
  }
}
