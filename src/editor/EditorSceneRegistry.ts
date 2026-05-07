import { normalizeSceneAssetPath } from "../core/model/SceneAssetPath";
import type { LangManager } from "../core/lang/LangManager";
import { LocationManager } from "../core/world/location/LocationManager";
import type { EditorSceneOption } from "./types";

/**
 * Discovers editor-visible scenes from the location data store.
 */
export class EditorSceneRegistry {
  private readonly locationManager: LocationManager;

  public constructor(langManager: LangManager) {
    this.locationManager = new LocationManager(langManager);
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
            assetUrl: normalizeSceneAssetPath(sceneData.model),
            rawAssetPath: sceneData.model,
            chunkCoord: sceneData.coord
          });
        }
      }
    }

    return options;
  }
}
