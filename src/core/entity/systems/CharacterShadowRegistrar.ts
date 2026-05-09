import type { SceneShadowRegistry } from "../../lighting/SceneShadowRegistry";
import { RenderableMeshResolver } from "../../rendering/RenderableMeshResolver";
import type { RenderTransformBinding } from "../components/RenderableComponent";

export interface CharacterShadowRegistration {
  readonly ownerId: string;
  readonly totalMeshes: number;
  readonly registeredMeshes: number;
}

export class CharacterShadowRegistrar {
  public constructor(private readonly meshResolver = new RenderableMeshResolver()) {}

  public register(
    entityId: string,
    binding: RenderTransformBinding,
    shadowRegistry: SceneShadowRegistry
  ): CharacterShadowRegistration {
    const meshes = this.meshResolver.resolve(binding, {
      includeInvisible: false,
      requireVertices: true,
      skipHelperMeshes: true
    });
    const ownerId = `entity:${entityId}`;

    shadowRegistry.registerBatch({
      ownerId,
      source: "character",
      meshes
    });

    return {
      ownerId,
      totalMeshes: meshes.length,
      registeredMeshes: meshes.length
    };
  }
}
