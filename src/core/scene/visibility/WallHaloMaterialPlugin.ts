import {
  Material,
  MaterialPluginBase,
  MultiMaterial,
  ShaderLanguage,
  Vector3,
  type UniformBuffer
} from "@babylonjs/core";
import { SHADER_SOURCE_IDS, ShaderSourceLoader } from "../../rendering/shaders/ShaderSourceLoader";

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

/**
 * Material plugin, который добавляет мягкое alpha-окно вокруг игрока.
 *
 * Класс оставляет Babylon material pipeline владельцем финального shader'а, но
 * все GLSL-фрагменты берет через ShaderSourceLoader. Так runtime visibility
 * логика остается в core, а сами shader source лежат в общей директории
 * `shaders/visibility/wall-halo`.
 */
export class WallHaloMaterialPlugin extends MaterialPluginBase {
  private readonly shaderSourceLoader: ShaderSourceLoader;
  private playerPosition: Vector3;
  private cameraPosition: Vector3;
  private settings: WallHaloSettings;

  public constructor(material: Material, shaderSourceLoader = ShaderSourceLoader.getShared()) {
    super(material, "WallHaloMaterialPlugin", 220, {}, false, false);
    this.shaderSourceLoader = shaderSourceLoader;
    this.playerPosition = Vector3.Zero();
    this.cameraPosition = Vector3.Zero();
    this.settings = DEFAULT_SETTINGS;
    this._pluginManager._addPlugin(this);
    this._enable(true);
    this.markAllDefinesAsDirty();
  }

  public override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  /**
   * Обновляет параметры, которые попадут в uniform buffer перед отрисовкой.
   */
  public update(playerPosition: Vector3, cameraPosition: Vector3, settings: Partial<WallHaloSettings> = {}): void {
    this.playerPosition.copyFrom(playerPosition);
    this.cameraPosition.copyFrom(cameraPosition);
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Регистрирует uniforms и fragment declarations для Babylon shader compiler.
   */
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
      fragment: this.shaderSourceLoader.load(SHADER_SOURCE_IDS.visibility.wallHalo.uniforms)
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

  /**
   * Возвращает GLSL snippets для стандартных Babylon injection points.
   */
  public override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): { [pointName: string]: string } | null {
    if (shaderType !== "fragment" || shaderLanguage !== ShaderLanguage.GLSL) {
      return null;
    }

    return {
      CUSTOM_FRAGMENT_EXTENSION: this.shaderSourceLoader.load(SHADER_SOURCE_IDS.visibility.wallHalo.fragmentExtension),
      CUSTOM_FRAGMENT_UPDATE_ALPHA: this.shaderSourceLoader.load(SHADER_SOURCE_IDS.visibility.wallHalo.updateAlpha),
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: this.shaderSourceLoader.load(
        SHADER_SOURCE_IDS.visibility.wallHalo.finalColorComposition
      ),
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: this.shaderSourceLoader.load(SHADER_SOURCE_IDS.visibility.wallHalo.beforeFragColor)
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
    targetMaterial.needDepthPrePass = true;
    plugins.push(new WallHaloMaterialPlugin(targetMaterial));
  }

  return plugins;
}

function isMaterial(material: Material | null): material is Material {
  return material instanceof Material;
}
