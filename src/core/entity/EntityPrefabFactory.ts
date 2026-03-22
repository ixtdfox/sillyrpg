import { Vector3 } from "@babylonjs/core";
import { Archetype } from "../character/Archetype";
import type { NormalizationConfig } from "../model/normalization";
import type { Component, ComponentCtor } from "./Component";
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

export interface PrefabDefinition {
  id: string;
  extendsId: string | null;
  components: PrefabComponentDefinition[];
}

export interface PrefabComponentDefinition {
  type: string;
  data: unknown;
}

interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

interface IdentityComponentData {
  name?: string;
  namePool?: string[];
  archetype: string;
}

interface ModelComponentData {
  assetPath: string;
  normalization?: NormalizationConfig;
}

interface VitalsData {
  current: number;
  max: number;
}

interface VitalsComponentData {
  hp: VitalsData;
  energy: VitalsData;
  carryCapacityWeight: number;
}

interface TransformComponentData {
  position: Vector3Data;
  rotation?: Vector3Data;
}

interface SpawnComponentData {
  position: Vector3Data;
  rotation?: Vector3Data;
}

interface HexPathMovementData {
  speed: number;
}

interface DetectableData {
  kind: string;
  isVisible?: boolean;
}

interface VisionData {
  rangeCells: number;
  fovDegrees: number;
  forward?: Vector3Data | null;
}

interface PatrolData {
  radiusCells: number;
  maxCandidateAttempts?: number;
}

interface CombatStatsData {
  initiative: number;
  apPerTurn: number;
  mpPerTurn: number;
  armor: number;
}

interface RelationsData {
  relationships?: Record<string, Partial<Relations>>;
}

export interface ComponentOverrideMap {
  identity?: Partial<IdentityComponentData>;
  model?: Partial<ModelComponentData>;
  vitals?: Partial<VitalsComponentData>;
  transform?: Partial<TransformComponentData>;
  spawn?: Partial<SpawnComponentData>;
  ai?: Record<string, never>;
  localPlayer?: Record<string, never>;
  hexPathMovement?: Partial<HexPathMovementData>;
  vision?: Partial<VisionData>;
  detectionState?: Record<string, never>;
  patrol?: Partial<PatrolData>;
  visionDebug?: Record<string, never>;
  detectable?: Partial<DetectableData>;
  combatStats?: Partial<CombatStatsData>;
  relations?: Partial<RelationsData>;
}

export interface EntityInstantiationOptions {
  id?: string;
  name?: string;
  position?: Vector3;
  rotation?: Vector3;
  componentOverrides?: ComponentOverrideMap;
  addComponents?: PrefabComponentDefinition[];
  removeComponents?: string[];
}

interface HydratedComponent {
  ctor: ComponentCtor<Component>;
  instance: Component;
}

type ComponentFactory = (definition: PrefabComponentDefinition, context: ComponentHydrationContext) => HydratedComponent;

interface ComponentHydrationContext {
  prefabId: string;
  runtimeEntityId: string;
  explicitName: string | null;
}

/**
 * Prefab-driven entity instantiation service.
 */
export class EntityPrefabFactory {
  private static readonly STORE_URL = "/assets/data/entity/characters/store.json";

  private prefabs: Map<string, PrefabDefinition> | null;
  private loadingPromise: Promise<Map<string, PrefabDefinition>> | null;
  private readonly componentRegistry: Map<string, ComponentFactory>;

  public constructor() {
    this.prefabs = null;
    this.loadingPromise = null;
    this.componentRegistry = this.createComponentRegistry();
  }

  public async instantiate(prefabId: string, options: EntityInstantiationOptions = {}): Promise<Entity> {
    const prefab = await this.getPrefab(prefabId);
    const runtimeEntityId = options.id ?? EntityPrefabFactory.generateUuid();
    const effectiveDefinitions = this.applyInstantiationOverrides(prefab.components, prefab.id, options);

    const entity = new Entity(runtimeEntityId);
    const context: ComponentHydrationContext = {
      prefabId,
      runtimeEntityId,
      explicitName: options.name ?? null
    };

    for (const componentDefinition of effectiveDefinitions) {
      const hydrated = this.hydrateComponent(componentDefinition, context);
      entity.addComponent(hydrated.ctor, hydrated.instance);
    }

    return entity;
  }

  public async getPrefab(prefabId: string): Promise<PrefabDefinition> {
    const prefabs = await this.getPrefabMap();
    const prefab = prefabs.get(prefabId);

    if (!prefab) {
      throw new Error(`Prefab definition not found: prefab id=${prefabId}`);
    }

    return prefab;
  }

  private async getPrefabMap(): Promise<Map<string, PrefabDefinition>> {
    if (this.prefabs) {
      return this.prefabs;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadPrefabs();
    }

    this.prefabs = await this.loadingPromise;
    return this.prefabs;
  }

  private async loadPrefabs(): Promise<Map<string, PrefabDefinition>> {
    const response = await fetch(EntityPrefabFactory.STORE_URL);

    if (!response.ok) {
      throw new Error(`Failed to load prefab store from ${EntityPrefabFactory.STORE_URL}`);
    }

    const rawStore = (await response.json()) as unknown;

    if (!Array.isArray(rawStore)) {
      throw new Error("Invalid prefab store payload: expected top-level array");
    }

    const rawPrefabs = new Map<string, PrefabDefinition>();

    for (const rawPrefab of rawStore) {
      const parsedPrefab = this.parsePrefabRecord(rawPrefab);
      rawPrefabs.set(parsedPrefab.id, parsedPrefab);
    }

    return this.resolvePrefabInheritance(rawPrefabs);
  }

  private parsePrefabRecord(rawPrefab: unknown): PrefabDefinition {
    if (!this.isRecord(rawPrefab)) {
      throw new Error("Invalid prefab definition payload: expected object");
    }

    const id = this.readString(rawPrefab.id, "id", "<unknown-prefab>");
    const extendsId =
      typeof rawPrefab.extends === "undefined" ? null : this.readString(rawPrefab.extends, "extends", id);
    const rawComponents = rawPrefab.components;

    if (!Array.isArray(rawComponents)) {
      throw new Error(`Invalid prefab definition: prefab id=${id}, missing array field components`);
    }

    const components: PrefabComponentDefinition[] = rawComponents.map((rawComponent, index) => {
      if (!this.isRecord(rawComponent)) {
        throw new Error(`Invalid prefab component payload: prefab id=${id}, index=${index}`);
      }

      return {
        type: this.readString(rawComponent.type, "type", id),
        data: "data" in rawComponent ? rawComponent.data : {}
      };
    });

    return { id, extendsId, components };
  }

  private resolvePrefabInheritance(prefabs: Map<string, PrefabDefinition>): Map<string, PrefabDefinition> {
    const resolved = new Map<string, PrefabDefinition>();

    const resolveOne = (prefabId: string, visiting: Set<string>): PrefabDefinition => {
      const existing = resolved.get(prefabId);

      if (existing) {
        return existing;
      }

      const prefab = prefabs.get(prefabId);

      if (!prefab) {
        throw new Error(`Prefab inheritance target not found: prefab id=${prefabId}`);
      }

      if (visiting.has(prefabId)) {
        throw new Error(`Prefab inheritance cycle detected: prefab id=${prefabId}`);
      }

      visiting.add(prefabId);

      const mergedComponents = prefab.extendsId
        ? this.mergeComponentDefinitions(resolveOne(prefab.extendsId, visiting).components, prefab.components)
        : prefab.components.map((component) => this.cloneComponentDefinition(component));

      visiting.delete(prefabId);

      const hydratedPrefab: PrefabDefinition = {
        id: prefab.id,
        extendsId: prefab.extendsId,
        components: mergedComponents
      };

      resolved.set(prefabId, hydratedPrefab);
      return hydratedPrefab;
    };

    for (const prefabId of prefabs.keys()) {
      resolveOne(prefabId, new Set<string>());
    }

    return resolved;
  }

  private applyInstantiationOverrides(
    components: PrefabComponentDefinition[],
    prefabId: string,
    options: EntityInstantiationOptions
  ): PrefabComponentDefinition[] {
    const componentMap = new Map<string, PrefabComponentDefinition>();

    for (const component of components) {
      componentMap.set(component.type, this.cloneComponentDefinition(component));
    }

    const positionOverride = options.position ? this.vectorToData(options.position) : null;
    const rotationOverride = options.rotation ? this.vectorToData(options.rotation) : null;

    if (positionOverride || rotationOverride) {
      this.applyTransformLikeOverride(componentMap, prefabId, "spawn", positionOverride, rotationOverride);
      this.applyTransformLikeOverride(componentMap, prefabId, "transform", positionOverride, rotationOverride);
    }

    if (options.componentOverrides) {
      for (const [componentType, overrideData] of Object.entries(options.componentOverrides)) {
        if (typeof overrideData === "undefined") {
          continue;
        }

        const existing = componentMap.get(componentType);

        if (!existing) {
          throw new Error(
            `Component override target not found: prefab id=${prefabId}, component type=${componentType}`
          );
        }

        if (!this.isRecord(existing.data) || !this.isRecord(overrideData)) {
          existing.data = overrideData;
          continue;
        }

        existing.data = this.mergeDataObjects(existing.data, overrideData);
      }
    }

    if (options.removeComponents) {
      for (const componentType of options.removeComponents) {
        componentMap.delete(componentType);
      }
    }

    if (options.addComponents) {
      for (const component of options.addComponents) {
        componentMap.set(component.type, this.cloneComponentDefinition(component));
      }
    }

    return Array.from(componentMap.values());
  }

  private applyTransformLikeOverride(
    componentMap: Map<string, PrefabComponentDefinition>,
    prefabId: string,
    componentType: "spawn" | "transform",
    position: Vector3Data | null,
    rotation: Vector3Data | null
  ): void {
    const existing = componentMap.get(componentType);

    if (!existing) {
      throw new Error(
        `Instantiation override requires component: prefab id=${prefabId}, component type=${componentType}`
      );
    }

    const dataRecord = this.assertRecord(existing.data, prefabId, componentType, "data");
    const mergedData: Record<string, unknown> = { ...dataRecord };

    if (position) {
      mergedData.position = position;
    }

    if (rotation) {
      mergedData.rotation = rotation;
    }

    existing.data = mergedData;
  }

  private hydrateComponent(definition: PrefabComponentDefinition, context: ComponentHydrationContext): HydratedComponent {
    const factory = this.componentRegistry.get(definition.type);

    if (!factory) {
      throw new Error(`Unknown component type: prefab id=${context.prefabId}, component type=${definition.type}`);
    }

    return factory(definition, context);
  }

  private createComponentRegistry(): Map<string, ComponentFactory> {
    return new Map<string, ComponentFactory>([
      [
        "identity",
        (definition, context) => {
          const data = this.parseIdentityData(definition.data, context.prefabId);
          const resolvedName = this.resolveName(data, context);

          return {
            ctor: IdentityComponent,
            instance: new IdentityComponent(context.runtimeEntityId, resolvedName, this.parseArchetype(data.archetype, context.prefabId))
          };
        }
      ],
      [
        "model",
        (definition, context) => {
          const data = this.parseModelData(definition.data, context.prefabId);
          return { ctor: ModelComponent, instance: new ModelComponent(data) };
        }
      ],
      [
        "vitals",
        (definition, context) => {
          const data = this.parseVitalsData(definition.data, context.prefabId);
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
        (definition, context) => {
          const data = this.parseTransformData(definition.data, context.prefabId, "transform");
          return { ctor: TransformComponent, instance: new TransformComponent(data.position, data.rotation) };
        }
      ],
      [
        "spawn",
        (definition, context) => {
          const data = this.parseSpawnData(definition.data, context.prefabId, "spawn");
          return { ctor: SpawnComponent, instance: new SpawnComponent(data.position, data.rotation) };
        }
      ],
      ["ai", () => ({ ctor: AIComponent, instance: new AIComponent() })],
      ["localPlayer", () => ({ ctor: LocalPlayerComponent, instance: new LocalPlayerComponent() })],
      [
        "hexPathMovement",
        (definition, context) => {
          const data = this.parseHexPathMovementData(definition.data, context.prefabId);
          return { ctor: HexPathMovementComponent, instance: new HexPathMovementComponent(data.speed) };
        }
      ],
      [
        "vision",
        (definition, context) => {
          const data = this.parseVisionData(definition.data, context.prefabId);
          return { ctor: VisionComponent, instance: new VisionComponent(data.rangeCells, data.fovDegrees, data.forward) };
        }
      ],
      ["detectionState", () => ({ ctor: DetectionStateComponent, instance: new DetectionStateComponent() })],
      [
        "patrol",
        (definition, context) => {
          const data = this.parsePatrolData(definition.data, context.prefabId);
          return { ctor: PatrolComponent, instance: new PatrolComponent(data.radiusCells, data.maxCandidateAttempts) };
        }
      ],
      ["visionDebug", () => ({ ctor: VisionDebugComponent, instance: new VisionDebugComponent() })],
      [
        "detectable",
        (definition, context) => {
          const data = this.parseDetectableData(definition.data, context.prefabId);
          return { ctor: DetectableComponent, instance: new DetectableComponent(data.kind, data.isVisible ?? true) };
        }
      ],
      [
        "combatStats",
        (definition, context) => {
          const data = this.parseCombatStatsData(definition.data, context.prefabId);
          return {
            ctor: CombatStatsComponent,
            instance: new CombatStatsComponent(data.initiative, data.apPerTurn, data.mpPerTurn, data.armor)
          };
        }
      ],
      [
        "relations",
        (definition, context) => {
          const data = this.parseRelationsData(definition.data, context.prefabId);
          return { ctor: RelationsComponent, instance: new RelationsComponent(data.relationships) };
        }
      ]
    ]);
  }

  private resolveName(identityData: IdentityComponentData, context: ComponentHydrationContext): string {
    if (context.explicitName) {
      return context.explicitName;
    }

    if (identityData.name && identityData.name.trim().length > 0) {
      return identityData.name;
    }

    if (identityData.namePool && identityData.namePool.length > 0) {
      return this.pickRandomName(identityData.namePool, context.prefabId);
    }

    throw new Error(`Identity name is unresolved: prefab id=${context.prefabId}, component type=identity, field=name`);
  }

  private parseIdentityData(data: unknown, prefabId: string): IdentityComponentData {
    const parsed = this.assertRecord(data, prefabId, "identity", "data") as Partial<IdentityComponentData>;

    if (typeof parsed.archetype !== "string") {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=identity, field=archetype`);
    }

    if (typeof parsed.name !== "undefined" && (typeof parsed.name !== "string" || parsed.name.trim().length === 0)) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=identity, field=name`);
    }

    if (typeof parsed.namePool !== "undefined") {
      if (!Array.isArray(parsed.namePool) || parsed.namePool.some((name) => typeof name !== "string" || name.trim().length === 0)) {
        throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=identity, field=namePool`);
      }
    }

    return {
      archetype: parsed.archetype,
      name: parsed.name,
      namePool: parsed.namePool
    };
  }

  private parseModelData(data: unknown, prefabId: string): ModelComponentData {
    const parsed = this.assertRecord(data, prefabId, "model", "data") as Partial<ModelComponentData>;

    if (typeof parsed.assetPath !== "string" || parsed.assetPath.length === 0) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=model, field=assetPath`);
    }

    return { assetPath: parsed.assetPath, normalization: parsed.normalization };
  }

  private parseVitalsData(data: unknown, prefabId: string): VitalsComponentData {
    const parsed = this.assertRecord(data, prefabId, "vitals", "data") as Partial<VitalsComponentData>;

    this.assertVitalsRecord(parsed.hp, prefabId, "hp");
    this.assertVitalsRecord(parsed.energy, prefabId, "energy");
    this.assertNumber(parsed.carryCapacityWeight, prefabId, "vitals", "carryCapacityWeight");

    return {
      hp: parsed.hp,
      energy: parsed.energy,
      carryCapacityWeight: parsed.carryCapacityWeight
    };
  }

  private parseTransformData(data: unknown, prefabId: string, componentType: "transform" | "spawn"): { position: Vector3; rotation: Vector3 } {
    const parsed = this.assertRecord(data, prefabId, componentType, "data") as Partial<TransformComponentData>;

    return {
      position: this.parseVector3(parsed.position, prefabId, componentType, "position"),
      rotation: parsed.rotation
        ? this.parseVector3(parsed.rotation, prefabId, componentType, "rotation")
        : Vector3.Zero()
    };
  }

  private parseSpawnData(data: unknown, prefabId: string, componentType: "spawn"): { position: Vector3; rotation: Vector3 } {
    return this.parseTransformData(data, prefabId, componentType);
  }

  private parseHexPathMovementData(data: unknown, prefabId: string): HexPathMovementData {
    const parsed = this.assertRecord(data, prefabId, "hexPathMovement", "data") as Partial<HexPathMovementData>;
    this.assertNumber(parsed.speed, prefabId, "hexPathMovement", "speed");
    return { speed: parsed.speed };
  }

  private parseDetectableData(data: unknown, prefabId: string): DetectableData {
    const parsed = this.assertRecord(data, prefabId, "detectable", "data") as Partial<DetectableData>;

    if (typeof parsed.kind !== "string" || parsed.kind.length === 0) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=detectable, field=kind`);
    }

    if (typeof parsed.isVisible !== "undefined" && typeof parsed.isVisible !== "boolean") {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=detectable, field=isVisible`);
    }

    return { kind: parsed.kind, isVisible: parsed.isVisible };
  }

  private parseVisionData(data: unknown, prefabId: string): { rangeCells: number; fovDegrees: number; forward: Vector3 | null } {
    const parsed = this.assertRecord(data, prefabId, "vision", "data") as Partial<VisionData>;

    this.assertNumber(parsed.rangeCells, prefabId, "vision", "rangeCells");
    this.assertNumber(parsed.fovDegrees, prefabId, "vision", "fovDegrees");

    if (!parsed.forward) {
      return { rangeCells: parsed.rangeCells, fovDegrees: parsed.fovDegrees, forward: null };
    }

    return {
      rangeCells: parsed.rangeCells,
      fovDegrees: parsed.fovDegrees,
      forward: this.parseVector3(parsed.forward, prefabId, "vision", "forward")
    };
  }

  private parsePatrolData(data: unknown, prefabId: string): PatrolData {
    const parsed = this.assertRecord(data, prefabId, "patrol", "data") as Partial<PatrolData>;

    this.assertNumber(parsed.radiusCells, prefabId, "patrol", "radiusCells");

    if (typeof parsed.maxCandidateAttempts !== "undefined") {
      this.assertNumber(parsed.maxCandidateAttempts, prefabId, "patrol", "maxCandidateAttempts");
    }

    return { radiusCells: parsed.radiusCells, maxCandidateAttempts: parsed.maxCandidateAttempts };
  }

  private parseCombatStatsData(data: unknown, prefabId: string): CombatStatsData {
    const parsed = this.assertRecord(data, prefabId, "combatStats", "data") as Partial<CombatStatsData>;

    this.assertNumber(parsed.initiative, prefabId, "combatStats", "initiative");
    this.assertNumber(parsed.apPerTurn, prefabId, "combatStats", "apPerTurn");
    this.assertNumber(parsed.mpPerTurn, prefabId, "combatStats", "mpPerTurn");
    this.assertNumber(parsed.armor, prefabId, "combatStats", "armor");

    return {
      initiative: parsed.initiative,
      apPerTurn: parsed.apPerTurn,
      mpPerTurn: parsed.mpPerTurn,
      armor: parsed.armor
    };
  }

  private parseRelationsData(data: unknown, prefabId: string): { relationships: Record<string, Relations> } {
    const parsed = this.assertRecord(data, prefabId, "relations", "data") as Partial<RelationsData>;
    const relationshipsRaw = parsed.relationships ?? {};

    if (!this.isRecord(relationshipsRaw)) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=relations, field=relationships`);
    }

    const relationships: Record<string, Relations> = {};

    for (const [targetId, relationRaw] of Object.entries(relationshipsRaw)) {
      if (!this.isRecord(relationRaw)) {
        throw new Error(
          `Invalid component payload: prefab id=${prefabId}, component type=relations, field=relationships.${targetId}`
        );
      }

      const relation = new Relations();
      Object.assign(relation, relationRaw);
      relationships[targetId] = relation;
    }

    return { relationships };
  }

  private parseVector3(value: unknown, prefabId: string, componentType: string, fieldName: string): Vector3 {
    const record = this.assertRecord(value, prefabId, componentType, fieldName);

    this.assertNumber(record.x, prefabId, componentType, `${fieldName}.x`);
    this.assertNumber(record.y, prefabId, componentType, `${fieldName}.y`);
    this.assertNumber(record.z, prefabId, componentType, `${fieldName}.z`);

    return new Vector3(record.x, record.y, record.z);
  }

  private parseArchetype(value: string, prefabId: string): Archetype {
    if (value === Archetype.HUMAN || value === Archetype.GOLEM) {
      return value;
    }

    throw new Error(`Invalid archetype: prefab id=${prefabId}, component type=identity, field=archetype, value=${value}`);
  }

  private assertVitalsRecord(value: unknown, prefabId: string, fieldName: "hp" | "energy"): asserts value is VitalsData {
    const record = this.assertRecord(value, prefabId, "vitals", fieldName);
    this.assertNumber(record.current, prefabId, "vitals", `${fieldName}.current`);
    this.assertNumber(record.max, prefabId, "vitals", `${fieldName}.max`);
  }

  private assertNumber(value: unknown, prefabId: string, componentType: string, fieldName: string): asserts value is number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=${componentType}, field=${fieldName}`);
    }
  }

  private assertRecord(
    value: unknown,
    prefabId: string,
    componentType: string,
    fieldName: string
  ): Record<string, unknown> {
    if (!this.isRecord(value)) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=${componentType}, field=${fieldName}`);
    }

    return value;
  }

  private readString(value: unknown, fieldName: string, prefabId: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Invalid prefab definition: prefab id=${prefabId}, invalid string field ${fieldName}`);
    }

    return value;
  }

  private pickRandomName(pool: string[], prefabId: string): string {
    if (pool.length === 0) {
      throw new Error(`Invalid component payload: prefab id=${prefabId}, component type=identity, field=namePool`);
    }

    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  private mergeComponentDefinitions(
    baseComponents: PrefabComponentDefinition[],
    overrideComponents: PrefabComponentDefinition[]
  ): PrefabComponentDefinition[] {
    const merged = new Map<string, PrefabComponentDefinition>();

    for (const component of baseComponents) {
      merged.set(component.type, this.cloneComponentDefinition(component));
    }

    for (const component of overrideComponents) {
      const existing = merged.get(component.type);

      if (!existing) {
        merged.set(component.type, this.cloneComponentDefinition(component));
        continue;
      }

      if (!this.isRecord(existing.data) || !this.isRecord(component.data)) {
        merged.set(component.type, this.cloneComponentDefinition(component));
        continue;
      }

      merged.set(component.type, {
        type: component.type,
        data: this.mergeDataObjects(existing.data, component.data)
      });
    }

    return Array.from(merged.values());
  }

  private mergeDataObjects(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(override)) {
      const baseValue = result[key];

      if (this.isRecord(baseValue) && this.isRecord(value)) {
        result[key] = this.mergeDataObjects(baseValue, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private cloneComponentDefinition(component: PrefabComponentDefinition): PrefabComponentDefinition {
    return {
      type: component.type,
      data: this.cloneUnknown(component.data)
    };
  }

  private cloneUnknown<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.cloneUnknown(item)) as T;
    }

    if (this.isRecord(value)) {
      const cloned: Record<string, unknown> = {};

      for (const [key, nested] of Object.entries(value)) {
        cloned[key] = this.cloneUnknown(nested);
      }

      return cloned as T;
    }

    return value;
  }

  private vectorToData(value: Vector3): Vector3Data {
    return { x: value.x, y: value.y, z: value.z };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
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
