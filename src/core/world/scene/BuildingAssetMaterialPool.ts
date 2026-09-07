import {
  PBRMaterial,
  Texture,
  type AssetContainer,
  type BaseTexture,
  type Material
} from "@babylonjs/core";

export interface BuildingAssetMaterialPoolResult {
  readonly reusedMaterialCount: number;
  readonly disposedTextureCount: number;
}

/** Shares exporter-controlled building materials and textures across cached GLB containers. */
export class BuildingAssetMaterialPool {
  private readonly materialsByKey = new Map<string, Material>();

  public canonicalize(container: AssetContainer): BuildingAssetMaterialPoolResult {
    const replacements = new Map<Material, Material>();
    const materials = [...container.materials].sort(compareMaterialPriority);

    for (const material of materials) {
      const key = createBuildingMaterialKey(material);
      if (!key) {
        continue;
      }

      const canonical = this.materialsByKey.get(key);
      if (canonical && canonical !== material) {
        replacements.set(material, canonical);
      } else if (!canonical) {
        this.materialsByKey.set(key, material);
      }
    }

    if (replacements.size === 0) {
      return { reusedMaterialCount: 0, disposedTextureCount: 0 };
    }

    for (const multiMaterial of container.multiMaterials) {
      multiMaterial.subMaterials = multiMaterial.subMaterials.map((material) =>
        material ? replacements.get(material) ?? material : null
      );
    }

    for (const mesh of container.meshes) {
      const material = mesh.material;
      if (material) {
        mesh.material = replacements.get(material) ?? material;
      }
    }

    for (const redundant of replacements.keys()) {
      redundant.dispose(false, false);
    }

    let disposedTextureCount = 0;
    const retainedMaterials = collectRetainedMaterials(container, this.materialsByKey.values());
    for (const texture of [...container.textures]) {
      if (isTextureUsed(texture, retainedMaterials)) {
        continue;
      }

      texture.dispose();
      disposedTextureCount += 1;
    }

    return {
      reusedMaterialCount: replacements.size,
      disposedTextureCount
    };
  }
}

function createBuildingMaterialKey(material: Material): string | null {
  if (!(material instanceof PBRMaterial)) {
    return null;
  }

  const metadata = asRecord(material.metadata);
  const gltf = asRecord(metadata.gltf);
  const extras = asRecord(gltf.extras);
  const signature = createPbrRenderSignature(material);

  if (extras.atlas_material === true && typeof extras.atlas_image_path === "string") {
    const category = typeof extras.atlas_category === "string" ? extras.atlas_category : material.name;
    const family = extras.atlas_alpha === true ? `alpha:${category}` : "opaque";
    return `atlas:${extras.atlas_image_path}:${family}:${signature}`;
  }

  if (extras.decal_material === true && typeof extras.decal_image_path === "string") {
    return `decal:${extras.decal_image_path}:${signature}`;
  }

  if (material.name.startsWith("NAV_") && material.getActiveTextures().length === 0) {
    return `navigation:${material.name}:${signature}`;
  }

  return null;
}

function createPbrRenderSignature(material: PBRMaterial): string {
  return JSON.stringify({
    alpha: material.alpha,
    alphaMode: material.alphaMode,
    transparencyMode: material.transparencyMode,
    backFaceCulling: material.backFaceCulling,
    cullBackFaces: material.cullBackFaces,
    sideOrientation: material.sideOrientation,
    needDepthPrePass: material.needDepthPrePass,
    disableDepthWrite: material.disableDepthWrite,
    forceDepthWrite: material.forceDepthWrite,
    fillMode: material.fillMode,
    metallic: material.metallic,
    roughness: material.roughness,
    alphaCutOff: material.alphaCutOff,
    useAlphaFromAlbedoTexture: material.useAlphaFromAlbedoTexture,
    forceAlphaTest: material.forceAlphaTest,
    twoSidedLighting: material.twoSidedLighting,
    unlit: material.unlit,
    albedoColor: material.albedoColor.asArray(),
    emissiveColor: material.emissiveColor.asArray(),
    reflectivityColor: material.reflectivityColor.asArray(),
    textures: material.getActiveTextures().map(createTextureRenderSignature)
  });
}

function createTextureRenderSignature(texture: BaseTexture): readonly unknown[] {
  const transform = texture instanceof Texture
    ? [
        texture.uScale,
        texture.vScale,
        texture.uOffset,
        texture.vOffset,
        texture.uAng,
        texture.vAng,
        texture.wAng
      ]
    : null;

  return [
    texture.coordinatesIndex,
    texture.wrapU,
    texture.wrapV,
    texture.wrapR,
    texture.samplingMode,
    texture.hasAlpha,
    texture.gammaSpace,
    texture.level,
    transform
  ];
}

function collectRetainedMaterials(
  container: AssetContainer,
  canonicalMaterials: Iterable<Material>
): readonly Material[] {
  return Array.from(new Set([
    ...container.scene.materials,
    ...container.materials,
    ...container.multiMaterials,
    ...canonicalMaterials
  ]));
}

function isTextureUsed(texture: BaseTexture, materials: readonly Material[]): boolean {
  return materials.some((material) => material.hasTexture(texture));
}

function compareMaterialPriority(left: Material, right: Material): number {
  return getMaterialPriority(left) - getMaterialPriority(right);
}

function getMaterialPriority(material: Material): number {
  const extras = asRecord(asRecord(asRecord(material.metadata).gltf).extras);
  return extras.atlas_category === "walls" ? 0 : 1;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
