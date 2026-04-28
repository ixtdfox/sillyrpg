import {
  Material,
  MaterialPluginBase,
  MultiMaterial,
  ShaderLanguage,
  Vector3,
  type UniformBuffer
} from "@babylonjs/core";

export type WallHaloShape = "cylinder" | "sphere";

export interface WallHaloSettings {
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly minAlpha: number;
  readonly shape: WallHaloShape;
  readonly insideBuilding: boolean;
}

const DEFAULT_SETTINGS: WallHaloSettings = {
  innerRadius: 1.2,
  outerRadius: 2.8,
  minAlpha: 0.9,
  shape: "cylinder",
  insideBuilding: false
};

export class WallHaloMaterialPlugin extends MaterialPluginBase {
  private playerPosition: Vector3;
  private cameraPosition: Vector3;
  private settings: WallHaloSettings;

  public constructor(material: Material) {
    super(material, "WallHaloMaterialPlugin", 220, {}, true, true);
    this.playerPosition = Vector3.Zero();
    this.cameraPosition = Vector3.Zero();
    this.settings = DEFAULT_SETTINGS;
  }

  public override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  public update(playerPosition: Vector3, cameraPosition: Vector3, settings: Partial<WallHaloSettings> = {}): void {
    this.playerPosition.copyFrom(playerPosition);
    this.cameraPosition.copyFrom(cameraPosition);
    this.settings = { ...this.settings, ...settings };
  }

  public override getUniforms(): {
    ubo?: Array<{ name: string; size?: number; type?: string; arraySize?: number }>;
    fragment?: string;
  } {
    return {
      ubo: [
        { name: "wallHaloPlayerPosition", size: 3, type: "vec3" },
        { name: "wallHaloCameraPosition", size: 3, type: "vec3" },
        { name: "wallHaloParams", size: 4, type: "vec4" },
        { name: "wallHaloState", size: 1, type: "float" }
      ],
      fragment: `
        uniform vec3 wallHaloPlayerPosition;
        uniform vec3 wallHaloCameraPosition;
        uniform vec4 wallHaloParams;
        uniform float wallHaloState;
      `
    };
  }

  public override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateVector3("wallHaloPlayerPosition", this.playerPosition);
    uniformBuffer.updateVector3("wallHaloCameraPosition", this.cameraPosition);
    uniformBuffer.updateFloat4(
      "wallHaloParams",
      this.settings.innerRadius,
      this.settings.outerRadius,
      this.settings.minAlpha,
      this.settings.shape === "sphere" ? 1 : 0
    );
    uniformBuffer.updateFloat("wallHaloState", this.settings.insideBuilding ? 1 : 0);
  }

  public override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): { [pointName: string]: string } | null {
    if (shaderType !== "fragment" || shaderLanguage !== ShaderLanguage.GLSL) {
      return null;
    }

    return {
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
        float wallHaloDistanceCylinder = distance(vPositionW.xz, wallHaloPlayerPosition.xz);
        float wallHaloDistanceSphere = distance(vPositionW.xyz, wallHaloPlayerPosition.xyz);
        float wallHaloDistance = mix(wallHaloDistanceCylinder, wallHaloDistanceSphere, wallHaloParams.w);
        float wallHaloFade = smoothstep(wallHaloParams.x, wallHaloParams.y, wallHaloDistance);
        float wallHaloAlpha = mix(wallHaloParams.z, 1.0, wallHaloFade);
        float wallHaloWallCameraDist = distance(vPositionW.xyz, wallHaloCameraPosition.xyz);
        float wallHaloPlayerCameraDist = distance(wallHaloPlayerPosition.xyz, wallHaloCameraPosition.xyz);
        float wallHaloInFrontOfPlayer = 1.0 - step(wallHaloPlayerCameraDist, wallHaloWallCameraDist);
        float wallHaloMask = mix(wallHaloInFrontOfPlayer, 1.0, wallHaloState);
        alpha *= mix(1.0, wallHaloAlpha, wallHaloMask);
      `
    };
  }
}

export interface WallHaloMaterialBinding {
  readonly originalMaterial: Material | null;
  readonly haloMaterial: Material;
  readonly haloPlugins: WallHaloMaterialPlugin[];
}

export function installWallHaloMaterial(meshMaterial: Material | null): WallHaloMaterialBinding | null {
  if (!meshMaterial) {
    return null;
  }

  const clonedMaterial = cloneMaterialForHalo(meshMaterial);
  if (!clonedMaterial) {
    return null;
  }

  const haloPlugins = installPluginsOnMaterial(clonedMaterial);
  if (haloPlugins.length === 0) {
    clonedMaterial.dispose(false, false);
    return null;
  }

  return {
    originalMaterial: meshMaterial,
    haloMaterial: clonedMaterial,
    haloPlugins
  };
}

export function updateWallHaloPlugins(
  plugins: readonly WallHaloMaterialPlugin[],
  playerPosition: Vector3,
  cameraPosition: Vector3,
  settings: Partial<WallHaloSettings>
): void {
  for (const plugin of plugins) {
    plugin.update(playerPosition, cameraPosition, settings);
  }
}

function cloneMaterialForHalo(material: Material): Material | null {
  if (material instanceof MultiMaterial) {
    return material.clone(`${material.name}-wall-halo`, true);
  }

  return material.clone(`${material.name}-wall-halo`);
}

function installPluginsOnMaterial(material: Material): WallHaloMaterialPlugin[] {
  const targetMaterials = material instanceof MultiMaterial ? material.subMaterials.filter(isMaterial) : [material];
  const plugins: WallHaloMaterialPlugin[] = [];

  for (const targetMaterial of targetMaterials) {
    targetMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
    targetMaterial.needDepthPrePass = false;
    plugins.push(new WallHaloMaterialPlugin(targetMaterial));
  }

  return plugins;
}

function isMaterial(material: Material | null): material is Material {
  return material instanceof Material;
}
