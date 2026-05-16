import { normalizeAssetPath } from "../../core/model/SceneAssetPath";
import type { LangManager } from "../../core/lang/LangManager";
import { LocationManager } from "../../core/world/location/LocationManager";
import { loadSceneDescriptor } from "../../core/world/scene/SceneDescriptorLoader";
import type { SceneDescriptor } from "../../core/world/scene/SceneDescriptor";

export interface EdisonSceneOption {
  readonly id: string;
  readonly label: string;
  readonly rawDescriptorPath: string;
  readonly descriptorUrl: string;
  readonly locationId?: string;
  readonly districtId?: string;
  readonly sceneId?: string;
  readonly chunkCoord?: readonly [number, number];
}

export interface EdisonLoadedSceneDescriptor {
  readonly option: EdisonSceneOption;
  readonly descriptor: SceneDescriptor;
}

export class SceneDescriptorAdapter {
  private readonly locationManager: LocationManager;

  public constructor(langManager: LangManager) {
    this.locationManager = new LocationManager(langManager);
  }

  public async loadSceneOptions(): Promise<readonly EdisonSceneOption[]> {
    await this.locationManager.loadLocations();

    const options: EdisonSceneOption[] = [];
    for (const location of this.locationManager.getLocations()) {
      for (const district of location.getDistricts()) {
        for (const sceneData of district.getModelData().scenes) {
          options.push({
            id: `${location.getId()}:${district.getId()}:${sceneData.id}`,
            label: `${location.getTitle()} / ${district.getTitle()} / ${sceneData.id}`,
            rawDescriptorPath: sceneData.scene,
            descriptorUrl: normalizeAssetPath(sceneData.scene),
            locationId: location.getId(),
            districtId: district.getId(),
            sceneId: sceneData.id,
            chunkCoord: sceneData.coord
          });
        }
      }
    }

    return options;
  }

  public async load(option: EdisonSceneOption): Promise<EdisonLoadedSceneDescriptor> {
    const loaded = await loadSceneDescriptor(option.rawDescriptorPath);
    return {
      option,
      descriptor: loaded.descriptor
    };
  }
}
