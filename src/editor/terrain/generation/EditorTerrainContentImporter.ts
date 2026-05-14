import { TransformNode, type Scene } from "@babylonjs/core";
import {
  applyTransform,
  importSceneTerrainContent,
  type ImportedSceneTerrainContent
} from "../../../core/world/scene/SceneContentLoader";
import type {
  SceneGeneratedTerrainDescriptor,
  SceneTerrainDescriptor
} from "../../../core/world/scene/SceneDescriptor";
import { TerrainGenerator } from "./TerrainGenerator";
import { TerrainMeshBuilder } from "../../../core/world/terrain/TerrainMeshBuilder";

/**
 * Adapter импорта terrain для редактора.
 *
 * Core loader больше не генерирует procedural terrain, поэтому editor держит
 * отдельный importer: готовые plane/model terrain делегируются core loader'у,
 * а generated terrain строится здесь через editor-only generator pipeline.
 */
export class EditorTerrainContentImporter {
  private readonly generator: TerrainGenerator;
  private readonly meshBuilder: TerrainMeshBuilder;

  public constructor(
    generator = new TerrainGenerator(),
    meshBuilder = new TerrainMeshBuilder()
  ) {
    this.generator = generator;
    this.meshBuilder = meshBuilder;
  }

  /**
   * Импортирует terrain descriptor в Babylon nodes для editor scene.
   */
  public async import(
    scene: Scene,
    descriptor: SceneTerrainDescriptor,
    parent: TransformNode,
    rootNamePrefix: string
  ): Promise<ImportedSceneTerrainContent> {
    if (descriptor.kind !== "generated") {
      return importSceneTerrainContent(scene, descriptor, parent, rootNamePrefix);
    }

    return this.importGenerated(scene, descriptor, parent, rootNamePrefix);
  }

  /**
   * Создает generated terrain mesh и сохраняет heightfield metadata для tools.
   */
  private importGenerated(
    scene: Scene,
    descriptor: SceneGeneratedTerrainDescriptor,
    parent: TransformNode,
    rootNamePrefix: string
  ): ImportedSceneTerrainContent {
    const terrainRoot = new TransformNode(`${rootNamePrefix}-terrain-root:${descriptor.id}`, scene);
    terrainRoot.setParent(parent, false);
    applyTransform(terrainRoot, descriptor);

    const heightField = this.generator.generate(descriptor);
    const mesh = this.meshBuilder.build(scene, descriptor, heightField);
    mesh.setParent(terrainRoot, false);
    mesh.metadata = {
      ...(mesh.metadata as Record<string, unknown> | undefined),
      generatedTerrainDescriptor: descriptor,
      generatedTerrainHeightField: heightField,
      terrainSurfaceCanonical: true
    };

    return {
      root: terrainRoot,
      descriptor,
      heightField,
      meshes: [mesh],
      renderableMeshes: [mesh],
      terrainSurfaceMeshes: [mesh],
      terrainLodControllers: [],
      helperMeshes: [],
      transformNodes: [],
      skeletons: [],
      animationGroups: [],
      particleSystems: []
    };
  }
}
