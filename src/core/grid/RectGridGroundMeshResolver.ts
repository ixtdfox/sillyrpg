import type { AbstractMesh, Node, Scene } from "@babylonjs/core";
import { NavigationMetadataParser } from "../navigation/BuildingNavigationMetadata";

/**
 * Результат выбора земли для размера RectGrid и picking.
 */
export interface RectGridGroundSelection {
  /** Основной меш земли, от которого начинается sizing/debug naming. */
  readonly groundMesh: AbstractMesh;

  /** Все meshes, которые участвуют в bounds и ground picking. */
  readonly groundMeshes: readonly AbstractMesh[];

  /** Предикат для Babylon picking: какие hits считаются попаданием в землю. */
  readonly isGroundPick: (mesh: AbstractMesh) => boolean;
}

/**
 * Политика отбраковки визуальных terrain meshes.
 *
 * Такие meshes нужны для картинки, но не должны становиться базой tactical grid:
 * их bounding box может быть шире логической земли, а picking должен идти по
 * настоящим navigation/floor surfaces.
 */
export class TerrainVisualOnlyMeshPolicy {
  public isVisualOnly(mesh: AbstractMesh): boolean {
    return (mesh.metadata as { terrainVisualOnly?: unknown } | null | undefined)?.terrainVisualOnly === true;
  }
}

/**
 * Политика имен для ground meshes.
 *
 * Сцены приходят из разных источников, поэтому resolver поддерживает несколько
 * naming conventions: строгие имена для авторской земли и keyword fallback для
 * generated/imported контента.
 */
export class GroundMeshNamePolicy {
  private static readonly EXACT_GROUND_NAMES = ["ground", "grid-ground", "terrain", "floor"];
  private static readonly KEYWORD_GROUND_NAMES = ["ground", "terrain", "floor", "walk", "tile"];

  public isExactGroundName(name: string): boolean {
    return GroundMeshNamePolicy.EXACT_GROUND_NAMES.includes(this.normalize(name));
  }

  public isKeywordGroundName(name: string): boolean {
    const normalizedName = this.normalize(name);
    return GroundMeshNamePolicy.KEYWORD_GROUND_NAMES.some((token) => normalizedName.includes(token));
  }

  /**
   * Убирает Blender-style suffix `.001`, чтобы дубликаты meshes не ломали convention.
   */
  public normalize(name: string): string {
    return name.toLowerCase().replace(/\.[0-9]+$/u, "");
  }
}

/**
 * Сортировщик meshes по горизонтальному footprint.
 *
 * Это отдельная стратегия выбора, потому что fallback "самый большой" должен
 * быть детерминированным и одинаковым для metadata/exact/keyword веток.
 */
export class GroundMeshFootprintRanker {
  public selectLargestHorizontalMesh(meshes: readonly AbstractMesh[]): AbstractMesh {
    const [bestMesh] = [...meshes].sort((left, right) => {
      const leftArea = this.measureHorizontalFootprint(left);
      const rightArea = this.measureHorizontalFootprint(right);

      if (leftArea !== rightArea) {
        return rightArea - leftArea;
      }

      return left.name.localeCompare(right.name);
    });

    return bestMesh;
  }

  public measureHorizontalFootprint(mesh: AbstractMesh): number {
    const bounds = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
    return (bounds.x * 2) * (bounds.z * 2);
  }
}

/**
 * Резолвер scene ground mesh для инициализации rect-grid.
 *
 * Класс работает как Chain of Responsibility: metadata -> exact name ->
 * keyword name -> largest footprint fallback. Каждый шаг явно отделен политиками,
 * чтобы правила можно было тестировать без создания полного RectGridRuntime.
 */
export class RectGridGroundMeshResolver {
  private readonly navigationMetadataParser: NavigationMetadataParser;
  private readonly visualOnlyPolicy: TerrainVisualOnlyMeshPolicy;
  private readonly namePolicy: GroundMeshNamePolicy;
  private readonly footprintRanker: GroundMeshFootprintRanker;

  public constructor(
    navigationMetadataParser = NavigationMetadataParser.getShared(),
    visualOnlyPolicy = new TerrainVisualOnlyMeshPolicy(),
    namePolicy = new GroundMeshNamePolicy(),
    footprintRanker = new GroundMeshFootprintRanker()
  ) {
    this.navigationMetadataParser = navigationMetadataParser;
    this.visualOnlyPolicy = visualOnlyPolicy;
    this.namePolicy = namePolicy;
    this.footprintRanker = footprintRanker;
  }

  /**
   * Выбирает стабильную ground selection по явным convention.
   *
   * Порядок:
   * 1) metadata marker `metadata.isGround === true`
   * 2) exact naming convention (`ground`, `terrain`, `floor`, `grid-ground`)
   * 3) keyword fallback (`ground`, `terrain`, `floor`, `walk`, `tile`)
   * 4) largest horizontal footprint как последний defensive fallback
   *
   * Первые три шага намеренно предпочтительнее "largest", потому что большие
   * декоративные meshes не всегда являются навигационной землей.
   */
  public resolve(scene: Scene, preferredMeshes: readonly AbstractMesh[] = []): RectGridGroundSelection {
    const scopeSource = preferredMeshes.length > 0 ? preferredMeshes : scene.meshes;
    const meshes = scopeSource.filter((mesh) =>
      mesh.getTotalVertices() > 0 && !mesh.isDisposed() && !this.visualOnlyPolicy.isVisualOnly(mesh)
    );
    console.debug(
      `[RectGridGroundMeshResolver] Ground resolution started meshCount=${meshes.length} preferredScope=${preferredMeshes.length > 0}.`
    );

    if (meshes.length === 0) {
      throw new Error("[RectGridGroundMeshResolver] No mesh candidates available for ground resolution.");
    }

    this.logCandidateMeshes(meshes);

    const metadataMatches = meshes.filter((mesh) => (mesh.metadata as { isGround?: unknown } | null | undefined)?.isGround === true);
    if (metadataMatches.length > 0) {
      return this.createSelection(this.footprintRanker.selectLargestHorizontalMesh(metadataMatches), metadataMatches, "metadata.isGround=true");
    }

    const exactNameMatches = meshes.filter((mesh) => this.namePolicy.isExactGroundName(mesh.name));
    if (exactNameMatches.length > 0) {
      return this.createSelection(this.footprintRanker.selectLargestHorizontalMesh(exactNameMatches), exactNameMatches, "exact-name-match");
    }

    const keywordMatches = meshes.filter((mesh) => this.namePolicy.isKeywordGroundName(mesh.name));
    if (keywordMatches.length > 0) {
      return this.createSelection(this.footprintRanker.selectLargestHorizontalMesh(keywordMatches), keywordMatches, "keyword-name-match");
    }

    const fallback = this.footprintRanker.selectLargestHorizontalMesh(meshes);
    if (fallback) {
      return this.createSelection(fallback, meshes, "largest-horizontal-footprint-fallback");
    }

    const inspectedMeshes = meshes.map((mesh) => `'${mesh.name}'(id='${mesh.id}')`).join(", ");
    throw new Error(
      `[RectGridGroundMeshResolver] Ground mesh was not resolved. Inspected candidates: ${inspectedMeshes}.`
    );
  }

  /**
   * Собирает DTO выбора и predicate для picking.
   */
  private createSelection(groundMesh: AbstractMesh, groundMeshes: readonly AbstractMesh[], reason: string): RectGridGroundSelection {
    console.debug(
      `[RectGridGroundMeshResolver] Ground selected mesh='${groundMesh.name}' id='${groundMesh.id}' reason=${reason}.`
    );

    return {
      groundMesh,
      groundMeshes,
      isGroundPick: (mesh: AbstractMesh): boolean =>
        groundMeshes.some((candidate) => this.isMeshInGroundHierarchy(mesh, candidate)) || this.isNavigationPickableSurface(mesh),
    };
  }

  /**
   * Делегирует navigation metadata parser политику pickable floor surfaces.
   */
  private isNavigationPickableSurface(mesh: AbstractMesh): boolean {
    return this.navigationMetadataParser.isNavigationPickableSurface(mesh);
  }

  /**
   * Проверяет, что hit mesh является выбранной землей или ее дочерним mesh.
   */
  private isMeshInGroundHierarchy(mesh: AbstractMesh, groundMesh: AbstractMesh): boolean {
    let current: AbstractMesh | null = mesh;

    while (current) {
      if (current === groundMesh) {
        return true;
      }

      const parent: Node | null = current.parent;
      current = parent && "getTotalVertices" in parent ? (parent as AbstractMesh) : null;
    }

    return false;
  }

  /**
   * Логирует кандидатов, чтобы ошибки импорта сцены было проще диагностировать.
   */
  private logCandidateMeshes(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      const area = this.footprintRanker.measureHorizontalFootprint(mesh);
      const metadataGround = (mesh.metadata as { isGround?: unknown } | null | undefined)?.isGround === true;
      console.debug(
        `[RectGridGroundMeshResolver] Candidate mesh='${mesh.name}' id='${mesh.id}' metadataGround=${metadataGround} footprint=${area.toFixed(2)}.`
      );
    }
  }
}
