import { dialogs as engDialogs } from "./eng/dialogs";
import { ui as engUi } from "./eng/ui";
import { dialogs as ruDialogs } from "./ru/dialogs";
import { ui as ruUi } from "./ru/ui";

/**
 * Represents one full localization package with UI and dialog dictionaries.
 */
export interface LanguagePack {
  /** UI dictionary for labels and buttons. */
  ui: Record<string, string>;
  /** Dialog dictionary for narrative and messages. */
  dialogs: Record<string, string>;
}

/**
 * Maintains available languages and exposes current localized dictionaries.
 * This class centralizes language switching and retrieval to keep scenes
 * independent from concrete language file imports.
 */
export class LangManager {
  /** Registered language packs keyed by language code. */
  private readonly languagePacks: Map<string, LanguagePack>;

  /** Active language code currently used by the UI. */
  private currentLanguage: string;

  /**
   * Creates a new language manager with built-in English and Russian packs.
   */
  public constructor() {
    this.languagePacks = new Map<string, LanguagePack>([
      ["eng", { ui: { ...engUi }, dialogs: { ...engDialogs } }],
      ["ru", { ui: { ...ruUi }, dialogs: { ...ruDialogs } }]
    ]);
    this.currentLanguage = "eng";
  }

  /**
   * Sets the currently active language if it exists in the registry.
   *
   * @param language - Language code to activate.
   * @returns No return value.
   * @throws Error when the language code is not registered.
   */
  public setLanguage(language: string): void {
    if (!this.languagePacks.has(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    this.currentLanguage = language;
  }

  /**
   * Returns the active language code.
   *
   * @returns The current language code.
   */
  public getLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Returns a copy of the active UI dictionary.
   *
   * @returns Key-value collection for localized UI text.
   */
  public getUi(): Record<string, string> {
    return { ...this.getCurrentPack().ui };
  }

  /**
   * Returns a copy of the active dialogs dictionary.
   *
   * @returns Key-value collection for localized dialog text.
   */
  public getDialogs(): Record<string, string> {
    return { ...this.getCurrentPack().dialogs };
  }

  /**
   * Registers or replaces a language pack.
   *
   * @param code - Unique language code.
   * @param pack - Full language pack to register.
   * @returns No return value.
   */
  public registerLanguage(code: string, pack: LanguagePack): void {
    this.languagePacks.set(code, pack);
  }

  /**
   * Gets the active language pack.
   *
   * @returns The active language pack.
   */
  private getCurrentPack(): LanguagePack {
    const pack = this.languagePacks.get(this.currentLanguage);
    if (!pack) {
      throw new Error(`Language pack is missing for: ${this.currentLanguage}`);
    }

    return pack;
  }
}
