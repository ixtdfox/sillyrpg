import { normalizeAssetPath } from "../core/model/SceneAssetPath";
import type { LangManager } from "../core/lang/LangManager";
import { LocationManager } from "../core/world/location/LocationManager";
import { EditorBuildingAssetRegistry } from "./assets/EditorBuildingAssetRegistry";
import type { EditorBuildingAssetOption, EditorSceneOption } from "./types";

/**
 * Discovers editor-visible scenes from the location data store.
 */
export class EditorSceneRegistry {
  private readonly locationManager: LocationManager;
  private readonly buildingAssetRegistry: EditorBuildingAssetRegistry;

  public constructor(langManager: LangManager) {
    this.locationManager = new LocationManager(langManager);
    this.buildingAssetRegistry = new EditorBuildingAssetRegistry();
  }

  public async loadSceneOptions(): Promise<readonly EditorSceneOption[]> {
    await this.locationManager.loadLocations();

    const options: EditorSceneOption[] = [];
    for (const location of this.locationManager.getLocations()) {
      const locationId = location.getId();
      const locationLabel = location.getTitle();

      for (const district of location.getDistricts()) {
        const districtId = district.getId();
        const districtLabel = district.getTitle();

        for (const sceneData of district.getModelData().scenes) {
          options.push({
            id: `${locationId}:${districtId}:${sceneData.id}`,
            label: `${locationLabel} / ${districtLabel} / ${sceneData.id}`,
            locationId,
            locationLabel,
            districtId,
            districtLabel,
            sceneId: sceneData.id,
            descriptorUrl: normalizeAssetPath(sceneData.scene),
            rawDescriptorPath: sceneData.scene,
            chunkCoord: sceneData.coord
          });
        }
      }
    }

    return options;
  }

  public async loadBuildingOptions(): Promise<readonly EditorBuildingAssetOption[]> {
    return this.buildingAssetRegistry.getBuildingOptions();
  }
}
