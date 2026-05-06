import type { LangManager } from "../../../lang/LangManager";
import type { District } from "./District";
import type { DistrictDefinition, DistrictSceneCoord } from "./DistrictDefinition";
import type { DistrictModelData, DistrictSceneData } from "./DistrictModelData";

/**
 * Runtime district implementation loaded from JSON definitions.
 */
export class GameDistrict implements District {
  /** Unique district id. */
  private readonly id: string;

  /** Localization key for district title. */
  private readonly titleKey: string;

  /** Babylon scene data. */
  private readonly modelData: DistrictModelData;

  /** Shared language manager used for title localization. */
  private readonly langManager: LangManager;

  /**
   * Creates a game district from raw JSON data.
   *
   * @param definition - District definition parsed from storage.
   * @param langManager - Shared language manager instance.
   */
  public constructor(definition: DistrictDefinition, langManager: LangManager) {
    this.id = definition.id;
    this.titleKey = definition.title;
    this.modelData = {
      chunkSize: { ...definition.chunkSize },
      streaming: {
        enabled: definition.streaming?.enabled ?? false,
        loadMargin: definition.streaming?.loadMargin ?? 8,
        unloadDistance: definition.streaming?.unloadDistance ?? 2
      },
      scenes: definition.scenes.map((scene) => ({
        id: scene.id,
        coord: [scene.coord[0], scene.coord[1]] as const,
        model: scene.model
      }))
    };
    this.langManager = langManager;
  }

  /**
   * Returns district unique id.
   *
   * @returns District id.
   */
  public getId(): string {
    return this.id;
  }

  /**
   * Returns district title in active language.
   *
   * @returns Localized district title.
   */
  public getTitle(): string {
    return this.langManager.getUi()[this.titleKey] ?? this.titleKey;
  }

  /**
   * Returns district accessibility state for future rules.
   *
   * @returns Always true for current prototype.
   */
  public isAvailableFor(): boolean {
    return true;
  }

  /**
   * Returns scene data needed to load district visuals.
   *
   * @returns District scene configuration.
   */
  public getModelData(): DistrictModelData {
    return {
      chunkSize: { ...this.modelData.chunkSize },
      streaming: { ...this.modelData.streaming },
      scenes: this.modelData.scenes.map((scene) => ({
        id: scene.id,
        coord: [scene.coord[0], scene.coord[1]] as const,
        model: scene.model
      }))
    };
  }

  public getSceneByCoord(coord: DistrictSceneCoord): DistrictSceneData | undefined {
    return this.modelData.scenes.find((scene) => scene.coord[0] === coord[0] && scene.coord[1] === coord[1]);
  }

  public getInitialScene(): DistrictSceneData {
    const initialScene = this.getSceneByCoord([0, 0]);
    if (initialScene) {
      return initialScene;
    }

    const fallbackScene = this.modelData.scenes[0];
    if (!fallbackScene) {
      throw new Error(`District '${this.id}' does not contain any scenes.`);
    }

    return fallbackScene;
  }

  /**
   * Returns district characters list placeholder.
   *
   * @returns Empty list for current prototype.
   */
  public getCharacters(): unknown[] {
    return [];
  }
}
