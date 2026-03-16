import type { LangManager } from "../../lang/LangManager";
import type { District } from "./district/District";
import type { Location } from "./Location";

/**
 * Runtime location implementation holding localized metadata and districts.
 */
export class GameLocation implements Location {
  /** Unique location id. */
  private readonly id: string;

  /** Localization key for location title. */
  private readonly titleKey: string;

  /** District runtime list. */
  private readonly districts: District[];

  /** Shared language manager used for title localization. */
  private readonly langManager: LangManager;

  /**
   * Creates a new game location instance.
   *
   * @param id - Location unique identifier.
   * @param titleKey - Localization key for location title.
   * @param districts - Runtime districts contained in location.
   * @param langManager - Shared language manager instance.
   */
  public constructor(id: string, titleKey: string, districts: District[], langManager: LangManager) {
    this.id = id;
    this.titleKey = titleKey;
    this.districts = districts;
    this.langManager = langManager;
  }

  /**
   * Returns unique location id.
   *
   * @returns Location id.
   */
  public getId(): string {
    return this.id;
  }

  /**
   * Returns location title in active language.
   *
   * @returns Localized location title.
   */
  public getTitle(): string {
    return this.langManager.getUi()[this.titleKey] ?? this.titleKey;
  }

  /**
   * Returns location accessibility state for future rules.
   *
   * @returns Always true for current prototype.
   */
  public isAvailableFor(): boolean {
    return true;
  }

  /**
   * Returns a copy of districts collection.
   *
   * @returns District runtime list.
   */
  public getDistricts(): District[] {
    return [...this.districts];
  }
}
