import type { LangManager } from "../../../lang/LangManager";
import type { District } from "./District";
import type { DistrictDefinition } from "./DistrictDefinition";
import type { DistrictSceneData } from "./DistrictSceneData";

/**
 * Runtime district implementation loaded from JSON definitions.
 */
export class GameDistrict implements District {
  /** Unique district id. */
  private readonly id: string;

  /** Localization key for district title. */
  private readonly titleKey: string;

  /** Babylon scene data. */
  private readonly sceneData: DistrictSceneData;

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
    this.sceneData = { model: definition.model };
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
  public getSceneData(): DistrictSceneData {
    return { ...this.sceneData };
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
