/**
 * Stores relationship metrics between two characters.
 */
export class CharacterRelations {
  /** Degree of hatred toward the related character. */
  public hate: number;

  /** Degree of trust toward the related character. */
  public trust: number;

  /** Degree of fear toward the related character. */
  public fear: number;

  /** Degree of guilt associated with the related character. */
  public guilt: number;

  /** Degree of affection toward the related character. */
  public affection: number;

  /** Degree of resentment toward the related character. */
  public resentment: number;

  /** Degree of love toward the related character. */
  public love: number;

  /** Degree of social boldness around the related character. */
  public boldness: number;

  /** Loyalty to official narrative regarding the related character. */
  public officialNarrativeLoyalty: number;

  /** Timestamp for the last interaction with the related character. */
  public lastInteractionAt: string | number | null;

  /**
   * Creates a relationship object with neutral defaults.
   */
  public constructor() {
    this.hate = 0;
    this.trust = 0;
    this.fear = 0;
    this.guilt = 0;
    this.affection = 0;
    this.resentment = 0;
    this.love = 0;
    this.boldness = 0;
    this.officialNarrativeLoyalty = 0;
    this.lastInteractionAt = null;
  }
}
