import { Archetype } from "./Archetype";
import type { Character } from "./Character";
import { CharacterManager } from "./CharacterManager";
import { GameCharacter } from "./GameCharacter";
import { Vitals } from "../entity/components/Vitals";
import { VitalsComponent } from "../entity/components/VitalsComponent";
import { TransformComponent } from "../entity/components/TransformComponent";
import { SpawnComponent } from "../entity/components/SpawnComponent";
import { Vector3 } from "@babylonjs/core";
import { AIComponent } from "../entity/components/AIComponent";
import { LocalPlayerComponent } from "../entity/components/LocalPlayerComponent";
import { HexPathMovementComponent } from "../entity/components/HexPathMovementComponent";
import { DetectableComponent } from "../entity/components/DetectableComponent";
import { VisionComponent } from "../entity/components/VisionComponent";
import { DetectionStateComponent } from "../entity/components/DetectionStateComponent";
import { DetectableKinds } from "../entity/components/DetectableKinds";
import { PatrolComponent } from "../entity/components/PatrolComponent";
import { VisionDebugComponent } from "../entity/components/VisionDebugComponent";

/**
 * Builds concrete character instances from templates.
 */
export class CharacterFactory {
  /** Template manager used to resolve archetype data. */
  private readonly characterManager: CharacterManager;

  /** Source pool for generated human names. */
  private readonly humanNames: string[];

  /** Source pool for generated golem names. */
  private readonly golemNames: string[];

  /**
   * Creates a factory with explicit dependencies.
   *
   * @param characterManager - Template manager dependency.
   */
  public constructor(characterManager: CharacterManager) {
    this.characterManager = characterManager;
    this.humanNames = ["Ari", "Nora", "Milo", "Kira", "Tobin", "Lina"];
    this.golemNames = ["Basalt-9", "Granite-3", "Obsidian-7", "Slate-1", "Ironcore-5"];
  }

  /**
   * Creates a local-player controlled human character.
   *
   * @returns Promise with a new player character instance.
   */
  public async createPlayer(): Promise<Character> {
    const template = await this.characterManager.getTemplate(Archetype.HUMAN);

    const player = new GameCharacter(
      this.getRandomName(this.humanNames),
      template.model,
      Archetype.HUMAN,
      new VitalsComponent(new Vitals(100, 100), new Vitals(100, 100), 50),
      new TransformComponent(Vector3.Zero()),
      new SpawnComponent(new Vector3(-8, 0, -8))
    );

    player.addComponent(LocalPlayerComponent, new LocalPlayerComponent());
    player.addComponent(HexPathMovementComponent, new HexPathMovementComponent(3.5));
    player.addComponent(DetectableComponent, new DetectableComponent(DetectableKinds.PLAYER));

    return player;
  }

  /**
   * Creates an AI-controlled golem character.
   *
   * @returns Promise with a new golem character instance.
   */
  public async createGolem(): Promise<Character> {
    const template = await this.characterManager.getTemplate(Archetype.GOLEM);

    const golem = new GameCharacter(
      this.getRandomName(this.golemNames),
      template.model,
      Archetype.GOLEM,
      new VitalsComponent(new Vitals(140, 140), new Vitals(60, 60), 120),
      new TransformComponent(Vector3.Zero()),
      new SpawnComponent(new Vector3(8, 0, 8), new Vector3(0, -Math.PI * 0.75, 0))
    );

    golem.addComponent(AIComponent, new AIComponent());
    golem.addComponent(HexPathMovementComponent, new HexPathMovementComponent(2.5));
    golem.addComponent(VisionComponent, new VisionComponent(6, 75));
    golem.addComponent(DetectionStateComponent, new DetectionStateComponent());
    golem.addComponent(PatrolComponent, new PatrolComponent(5));
    golem.addComponent(VisionDebugComponent, new VisionDebugComponent());
    golem.addComponent(DetectableComponent, new DetectableComponent(DetectableKinds.GOLEM));

    return golem;
  }

  /**
   * Returns a random name from a configured pool.
   *
   * @param pool - Source names.
   * @returns Selected name string.
   */
  public getRandomName(pool: string[]): string {
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }
}
