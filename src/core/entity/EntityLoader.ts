import { Vector3 } from "@babylonjs/core";
import { Archetype } from "../character/Archetype";
import { Entity } from "./Entity";
import { AIComponent } from "./components/AIComponent";
import { CombatStatsComponent } from "./components/CombatStatsComponent";
import { DetectableComponent } from "./components/DetectableComponent";
import { DetectionStateComponent } from "./components/DetectionStateComponent";
import { HexPathMovementComponent } from "./components/HexPathMovementComponent";
import { IdentityComponent } from "./components/IdentityComponent";
import { LocalPlayerComponent } from "./components/LocalPlayerComponent";
import { ModelComponent } from "./components/ModelComponent";
import { PatrolComponent } from "./components/PatrolComponent";
import { Relations } from "./components/Relations";
import { RelationsComponent } from "./components/RelationsComponent";
import { SpawnComponent } from "./components/SpawnComponent";
import { TransformComponent } from "./components/TransformComponent";
import { Vitals } from "./components/Vitals";
import { VitalsComponent } from "./components/VitalsComponent";
import { VisionComponent } from "./components/VisionComponent";
import { VisionDebugComponent } from "./components/VisionDebugComponent";
import type { Component, ComponentCtor } from "./Component";
import type { NormalizationConfig } from "../model/normalization";

interface EntityStoreRecord {
  id: string;
  components: EntityComponentDefinition[];
}

interface EntityComponentDefinition {
  type: string;
  data: unknown;
}

interface Vector3Dto {
  x: number;
  y: number;
  z: number;
}

interface NamedPoolIdentityDto {
  namePool: string[];
  archetype: string;
}

interface VitalsDto {
  current: number;
  max: number;
}

interface VitalsComponentDto {
  hp: VitalsDto;
  energy: VitalsDto;
  carryCapacityWeight: number;
}

interface ModelComponentDto {
  assetPath: string;
  normalization?: NormalizationConfig;
}

interface TransformDto {
  position: Vector3Dto;
  rotation?: Vector3Dto;
}

interface SpawnDto {
  position: Vector3Dto;
  rotation?: Vector3Dto;
}

interface HexPathMovementDto {
  speed: number;
}

interface DetectableDto {
  kind: string;
  isVisible?: boolean;
}

interface VisionDto {
  rangeCells: number;
  fovDegrees: number;
  forward?: Vector3Dto | null;
}

interface PatrolDto {
  radiusCells: number;
  maxCandidateAttempts?: number;
}

interface CombatStatsDto {
  initiative: number;
  apPerTurn: number;
  mpPerTurn: number;
  armor: number;
}

interface RelationsDto {
  relationships?: Record<string, Partial<Relations>>;
}

type ComponentFactory = (
  definition: EntityComponentDefinition,
  entityId: string,
  runtimeEntityId: string
) => HydratedComponent;

interface HydratedComponent {
  ctor: ComponentCtor<Component>;
  instance: Component;
}

/**
 * Loads declarative entity definitions and hydrates runtime ECS entities.
 */
export class EntityLoader {
  private static readonly STORE_URL = "/assets/data/entity/characters/store.json";

  private definitions: Map<string, EntityStoreRecord> | null;
  private loadingPromise: Promise<Map<string, EntityStoreRecord>> | null;
  private readonly componentRegistry: Map<string, ComponentFactory>;

  public constructor() {
    this.definitions = null;
    this.loadingPromise = null;
    this.componentRegistry = this.createComponentRegistry();
  }

  public async createEntity(definitionId: string): Promise<Entity> {
    const definition = await this.getDefinition(definitionId);
    const runtimeEntityId = EntityLoader.generateUuid();
    const entity = new Entity(runtimeEntityId);

    for (const componentDefinition of definition.components) {
      const component = this.hydrateComponent(definition.id, componentDefinition, runtimeEntityId);
      entity.addComponent(component.ctor, component.instance);
    }

    return entity;
  }

  public async getDefinition(definitionId: string): Promise<EntityStoreRecord> {
    const definitions = await this.getDefinitionsMap();
    const definition = definitions.get(definitionId);

    if (!definition) {
      throw new Error(`Entity definition not found: id=${definitionId}`);
    }

    return definition;
  }

  private async getDefinitionsMap(): Promise<Map<string, EntityStoreRecord>> {
    if (this.definitions) {
      return this.definitions;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadDefinitions();
    }

    this.definitions = await this.loadingPromise;
    return this.definitions;
  }

  private async loadDefinitions(): Promise<Map<string, EntityStoreRecord>> {
    const response = await fetch(EntityLoader.STORE_URL);

    if (!response.ok) {
      throw new Error(`Failed to load entity store from ${EntityLoader.STORE_URL}`);
    }

    const records = (await response.json()) as unknown;

    if (!Array.isArray(records)) {
      throw new Error("Invalid entity store payload: expected top-level array");
    }

    const definitions = new Map<string, EntityStoreRecord>();

    for (const rawRecord of records) {
      const record = this.parseStoreRecord(rawRecord);
      definitions.set(record.id, record);
    }

    return definitions;
  }

  private parseStoreRecord(rawRecord: unknown): EntityStoreRecord {
    if (!this.isObject(rawRecord)) {
      throw new Error("Invalid entity definition payload: expected object");
    }

    const id = this.readStringField(rawRecord, "id", "<unknown-entity>");
    const rawComponents = rawRecord.components;

    if (!Array.isArray(rawComponents)) {
      throw new Error(`Invalid entity definition: entity id=${id}, missing array field components`);
    }

    const components: EntityComponentDefinition[] = rawComponents.map((rawComponent, index) => {
      if (!this.isObject(rawComponent)) {
        throw new Error(`Invalid entity component payload: entity id=${id}, index=${index}`);
      }

      const type = this.readStringField(rawComponent, "type", id);
      const data = "data" in rawComponent ? rawComponent.data : {};

      return { type, data };
    });

    return { id, components };
  }

  private hydrateComponent(
    definitionId: string,
    componentDefinition: EntityComponentDefinition,
    runtimeEntityId: string
  ): HydratedComponent {
    const factory = this.componentRegistry.get(componentDefinition.type);

    if (!factory) {
      throw new Error(
        `Unknown component type: entity id=${definitionId}, component type=${componentDefinition.type}`
      );
    }

    return factory(componentDefinition, definitionId, runtimeEntityId);
  }

  private createComponentRegistry(): Map<string, ComponentFactory> {
    const registryEntries: Array<[string, ComponentFactory]> = [
      [
        "identity",
        (definition, entityId, runtimeEntityId) => {
          const data = this.parseIdentityData(definition.data, entityId);
          const resolvedName = this.pickRandomName(data.namePool, entityId);

          return {
            ctor: IdentityComponent,
            instance: new IdentityComponent(runtimeEntityId, resolvedName, data.archetype)
          };
        }
      ],
      [
        "model",
        (definition, entityId) => {
          const data = this.parseModelData(definition.data, entityId);
          return { ctor: ModelComponent, instance: new ModelComponent(data) };
        }
      ],
      [
        "vitals",
        (definition, entityId) => {
          const data = this.parseVitalsData(definition.data, entityId);
          return {
            ctor: VitalsComponent,
            instance: new VitalsComponent(
              new Vitals(data.hp.current, data.hp.max),
              new Vitals(data.energy.current, data.energy.max),
              data.carryCapacityWeight
            )
          };
        }
      ],
      [
        "transform",
        (definition, entityId) => {
          const data = this.parseTransformData(definition.data, entityId, definition.type);
          return { ctor: TransformComponent, instance: new TransformComponent(data.position, data.rotation) };
        }
      ],
      [
        "spawn",
        (definition, entityId) => {
          const data = this.parseSpawnData(definition.data, entityId, definition.type);
          return { ctor: SpawnComponent, instance: new SpawnComponent(data.position, data.rotation) };
        }
      ],
      ["ai", () => ({ ctor: AIComponent, instance: new AIComponent() })],
      ["localPlayer", () => ({ ctor: LocalPlayerComponent, instance: new LocalPlayerComponent() })],
      [
        "hexPathMovement",
        (definition, entityId) => {
          const data = this.parseHexPathMovementData(definition.data, entityId);
          return { ctor: HexPathMovementComponent, instance: new HexPathMovementComponent(data.speed) };
        }
      ],
      [
        "vision",
        (definition, entityId) => {
          const data = this.parseVisionData(definition.data, entityId);
          return {
            ctor: VisionComponent,
            instance: new VisionComponent(data.rangeCells, data.fovDegrees, data.forward)
          };
        }
      ],
      [
        "detectionState",
        () => ({ ctor: DetectionStateComponent, instance: new DetectionStateComponent() })
      ],
      [
        "patrol",
        (definition, entityId) => {
          const data = this.parsePatrolData(definition.data, entityId);
          return {
            ctor: PatrolComponent,
            instance: new PatrolComponent(data.radiusCells, data.maxCandidateAttempts)
          };
        }
      ],
      ["visionDebug", () => ({ ctor: VisionDebugComponent, instance: new VisionDebugComponent() })],
      [
        "detectable",
        (definition, entityId) => {
          const data = this.parseDetectableData(definition.data, entityId);
          return {
            ctor: DetectableComponent,
            instance: new DetectableComponent(data.kind, data.isVisible ?? true)
          };
        }
      ],
      [
        "combatStats",
        (definition, entityId) => {
          const data = this.parseCombatStatsData(definition.data, entityId);
          return {
            ctor: CombatStatsComponent,
            instance: new CombatStatsComponent(data.initiative, data.apPerTurn, data.mpPerTurn, data.armor)
          };
        }
      ],
      [
        "relations",
        (definition, entityId) => {
          const data = this.parseRelationsData(definition.data, entityId);
          return { ctor: RelationsComponent, instance: new RelationsComponent(data.relationships) };
        }
      ]
    ];

    return new Map<string, ComponentFactory>(registryEntries);
  }

  private parseIdentityData(data: unknown, entityId: string): { namePool: string[]; archetype: Archetype } {
    const parsed = this.assertObjectData<NamedPoolIdentityDto>(data, entityId, "identity");

    if (!Array.isArray(parsed.namePool) || parsed.namePool.length === 0) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=identity, field=namePool`);
    }

    const allNamesAreStrings = parsed.namePool.every((name) => typeof name === "string" && name.trim().length > 0);

    if (!allNamesAreStrings) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=identity, field=namePool`);
    }

    return { namePool: parsed.namePool, archetype: this.parseArchetype(parsed.archetype, entityId) };
  }

  private parseModelData(data: unknown, entityId: string): ModelComponentDto {
    const parsed = this.assertObjectData<ModelComponentDto>(data, entityId, "model");

    if (typeof parsed.assetPath !== "string" || parsed.assetPath.length === 0) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=model, field=assetPath`);
    }

    return {
      assetPath: parsed.assetPath,
      normalization: parsed.normalization
    };
  }

  private parseVitalsData(data: unknown, entityId: string): VitalsComponentDto {
    const parsed = this.assertObjectData<VitalsComponentDto>(data, entityId, "vitals");

    this.assertVitalsDto(parsed.hp, entityId, "hp");
    this.assertVitalsDto(parsed.energy, entityId, "energy");
    this.assertNumber(parsed.carryCapacityWeight, entityId, "vitals", "carryCapacityWeight");

    return parsed;
  }

  private parseTransformData(data: unknown, entityId: string, componentType: string): { position: Vector3; rotation: Vector3 } {
    const parsed = this.assertObjectData<TransformDto>(data, entityId, componentType);

    return {
      position: this.parseVector3(parsed.position, entityId, componentType, "position"),
      rotation: parsed.rotation
        ? this.parseVector3(parsed.rotation, entityId, componentType, "rotation")
        : Vector3.Zero()
    };
  }

  private parseSpawnData(data: unknown, entityId: string, componentType: string): { position: Vector3; rotation: Vector3 } {
    const parsed = this.assertObjectData<SpawnDto>(data, entityId, componentType);

    return {
      position: this.parseVector3(parsed.position, entityId, componentType, "position"),
      rotation: parsed.rotation
        ? this.parseVector3(parsed.rotation, entityId, componentType, "rotation")
        : Vector3.Zero()
    };
  }

  private parseHexPathMovementData(data: unknown, entityId: string): HexPathMovementDto {
    const parsed = this.assertObjectData<HexPathMovementDto>(data, entityId, "hexPathMovement");
    this.assertNumber(parsed.speed, entityId, "hexPathMovement", "speed");
    return parsed;
  }

  private parseDetectableData(data: unknown, entityId: string): DetectableDto {
    const parsed = this.assertObjectData<DetectableDto>(data, entityId, "detectable");

    if (typeof parsed.kind !== "string" || parsed.kind.length === 0) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=detectable, field=kind`);
    }

    if (typeof parsed.isVisible !== "undefined" && typeof parsed.isVisible !== "boolean") {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=detectable, field=isVisible`);
    }

    return parsed;
  }

  private parseVisionData(data: unknown, entityId: string): { rangeCells: number; fovDegrees: number; forward: Vector3 | null } {
    const parsed = this.assertObjectData<VisionDto>(data, entityId, "vision");

    this.assertNumber(parsed.rangeCells, entityId, "vision", "rangeCells");
    this.assertNumber(parsed.fovDegrees, entityId, "vision", "fovDegrees");

    if (typeof parsed.forward === "undefined") {
      return { rangeCells: parsed.rangeCells, fovDegrees: parsed.fovDegrees, forward: null };
    }

    if (parsed.forward === null) {
      return { rangeCells: parsed.rangeCells, fovDegrees: parsed.fovDegrees, forward: null };
    }

    return {
      rangeCells: parsed.rangeCells,
      fovDegrees: parsed.fovDegrees,
      forward: this.parseVector3(parsed.forward, entityId, "vision", "forward")
    };
  }

  private parsePatrolData(data: unknown, entityId: string): PatrolDto {
    const parsed = this.assertObjectData<PatrolDto>(data, entityId, "patrol");

    this.assertNumber(parsed.radiusCells, entityId, "patrol", "radiusCells");

    if (typeof parsed.maxCandidateAttempts !== "undefined") {
      this.assertNumber(parsed.maxCandidateAttempts, entityId, "patrol", "maxCandidateAttempts");
    }

    return parsed;
  }

  private parseCombatStatsData(data: unknown, entityId: string): CombatStatsDto {
    const parsed = this.assertObjectData<CombatStatsDto>(data, entityId, "combatStats");

    this.assertNumber(parsed.initiative, entityId, "combatStats", "initiative");
    this.assertNumber(parsed.apPerTurn, entityId, "combatStats", "apPerTurn");
    this.assertNumber(parsed.mpPerTurn, entityId, "combatStats", "mpPerTurn");
    this.assertNumber(parsed.armor, entityId, "combatStats", "armor");

    return parsed;
  }

  private parseRelationsData(data: unknown, entityId: string): { relationships: Record<string, Relations> } {
    const parsed = this.assertObjectData<RelationsDto>(data, entityId, "relations");
    const relationships = parsed.relationships ?? {};

    if (!this.isObject(relationships)) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=relations, field=relationships`);
    }

    const hydratedRelationships: Record<string, Relations> = {};

    for (const [targetId, rawRelations] of Object.entries(relationships)) {
      if (!rawRelations || typeof rawRelations !== "object") {
        throw new Error(
          `Invalid component payload: entity id=${entityId}, component type=relations, field=relationships.${targetId}`
        );
      }

      const relation = new Relations();
      Object.assign(relation, rawRelations);
      hydratedRelationships[targetId] = relation;
    }

    return { relationships: hydratedRelationships };
  }

  private assertVitalsDto(value: unknown, entityId: string, fieldName: "hp" | "energy"): asserts value is VitalsDto {
    if (!this.isObject(value)) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=vitals, field=${fieldName}`);
    }

    this.assertNumber(value.current, entityId, "vitals", `${fieldName}.current`);
    this.assertNumber(value.max, entityId, "vitals", `${fieldName}.max`);
  }

  private parseVector3(value: unknown, entityId: string, componentType: string, fieldName: string): Vector3 {
    if (!this.isObject(value)) {
      throw new Error(
        `Invalid component payload: entity id=${entityId}, component type=${componentType}, field=${fieldName}`
      );
    }

    this.assertNumber(value.x, entityId, componentType, `${fieldName}.x`);
    this.assertNumber(value.y, entityId, componentType, `${fieldName}.y`);
    this.assertNumber(value.z, entityId, componentType, `${fieldName}.z`);

    return new Vector3(value.x, value.y, value.z);
  }

  private assertObjectData<T>(value: unknown, entityId: string, componentType: string): T {
    if (!this.isObject(value)) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=${componentType}, field=data`);
    }

    return value as T;
  }

  private assertNumber(value: unknown, entityId: string, componentType: string, fieldName: string): asserts value is number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(
        `Invalid component payload: entity id=${entityId}, component type=${componentType}, field=${fieldName}`
      );
    }
  }

  private readStringField(source: Record<string, unknown>, fieldName: string, entityId: string): string {
    const value = source[fieldName];

    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Invalid entity definition: entity id=${entityId}, invalid string field ${fieldName}`);
    }

    return value;
  }

  private parseArchetype(value: string, entityId: string): Archetype {
    if (value === Archetype.HUMAN || value === Archetype.GOLEM) {
      return value;
    }

    throw new Error(`Invalid archetype: entity id=${entityId}, component type=identity, field=archetype, value=${value}`);
  }

  private pickRandomName(namePool: string[], entityId: string): string {
    if (namePool.length === 0) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=identity, field=namePool`);
    }

    const index = Math.floor(Math.random() * namePool.length);
    const selected = namePool[index];

    if (typeof selected !== "string" || selected.length === 0) {
      throw new Error(`Invalid component payload: entity id=${entityId}, component type=identity, field=namePool`);
    }

    return selected;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private static generateUuid(): string {
    if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character: string) => {
      const random = Math.floor(Math.random() * 16);
      const mapped = character === "x" ? random : (random & 0x3) | 0x8;

      return mapped.toString(16);
    });
  }
}
