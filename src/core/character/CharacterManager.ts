import { Archetype } from "./Archetype";
import type { CharacterTemplate } from "./CharacterTemplate";
import type { NormalizationConfig } from "../model/normalization";
import type { ModelDefinition } from "../model/ModelDefinition";

interface CharacterTemplateRecord {
  archetype: string;
  model: string;
  normalization?: NormalizationConfig;
}

/**
 * Provides managed access to character templates.
 */
export class CharacterManager {
  /** Relative URL to the JSON template data file. */
  private static readonly STORE_URL: string = "/assets/data/characters/store.json";

  /** Cached immutable template store after load. */
  private templates: Record<Archetype, CharacterTemplate> | null;

  /** Shared loading promise to prevent duplicate fetches. */
  private loadingPromise: Promise<Record<Archetype, CharacterTemplate>> | null;

  /**
   * Creates a manager instance.
   */
  public constructor() {
    this.templates = null;
    this.loadingPromise = null;
  }

  public async getTemplate(archetype: Archetype): Promise<CharacterTemplate> {
    const templates = await this.getTemplatesMap();
    const template = templates[archetype];

    if (!template) {
      throw new Error(`Missing character template for archetype: ${archetype}`);
    }

    return template;
  }

  public async listTemplates(): Promise<CharacterTemplate[]> {
    const templates = await this.getTemplatesMap();
    return Object.values(templates);
  }

  private async getTemplatesMap(): Promise<Record<Archetype, CharacterTemplate>> {
    if (this.templates) {
      return this.templates;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadTemplates();
    }

    this.templates = await this.loadingPromise;
    return this.templates;
  }

  private async loadTemplates(): Promise<Record<Archetype, CharacterTemplate>> {
    const response = await fetch(CharacterManager.STORE_URL);

    if (!response.ok) {
      throw new Error(`Failed to load character templates from ${CharacterManager.STORE_URL}`);
    }

    const records = (await response.json()) as CharacterTemplateRecord[];
    const mappedTemplates = {} as Record<Archetype, CharacterTemplate>;

    for (const record of records) {
      const archetype = this.parseArchetype(record.archetype);

      mappedTemplates[archetype] = {
        archetype,
        model: this.mapModelDefinition(record)
      };
    }

    return mappedTemplates;
  }

  private mapModelDefinition(record: CharacterTemplateRecord): ModelDefinition {
    return {
      assetPath: record.model,
      normalization: record.normalization
    };
  }

  private parseArchetype(value: string): Archetype {
    if (value === Archetype.HUMAN || value === Archetype.GOLEM) {
      return value;
    }

    throw new Error(`Unsupported archetype in character template store: ${value}`);
  }
}
