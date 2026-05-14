import { Color3, Color4, type AbstractMesh, type Scene as BabylonScene } from "@babylonjs/core";
import { LightingRig } from "./LightingRig";
import { LightingRigFactory } from "./LightingRigFactory";
import type { SceneLightingDescriptor, ShadowGeneratorKind } from "./LightingTypes";

/**
 * Контроллер, который применяет lighting descriptor к Babylon-сцене.
 *
 * Он владеет текущим `LightingRig`, обновляет clear color сцены и предоставляет
 * узкий API для registry: добавить caster, переключить receiver и получить
 * диагностику shadow generator'а.
 */
export class SceneLightingController {
  private rig: LightingRig | null = null;

  public constructor(
    private readonly scene: BabylonScene,
    private readonly factory: LightingRigFactory = new LightingRigFactory()
  ) {}

  /** Полностью заменяет текущее освещение сцены новым rig, созданным factory. */
  public apply(descriptor: SceneLightingDescriptor): void {
    this.disposeRig();
    this.scene.clearColor = this.toClearColor(descriptor.clearColor);
    this.rig = this.factory.create(this.scene, descriptor);
  }

  /** Возвращает текущий rig для тестов, диагностики и низкоуровневых интеграций. */
  public getRig(): LightingRig | null {
    return this.rig;
  }

  /** Показывает, создан ли shadow generator для текущего descriptor'а. */
  public hasShadows(): boolean {
    return this.rig?.hasShadows() ?? false;
  }

  /** Возвращает тип shadow generator'а в доменных терминах, без утечки Babylon-классов наружу. */
  public getShadowGeneratorKind(): ShadowGeneratorKind | "none" {
    return this.rig?.getShadowGeneratorKind() ?? "none";
  }

  /** Возвращает количество caster meshes, известных текущему rig. */
  public getShadowCasterCount(): number {
    return this.rig?.getShadowCasterCount() ?? 0;
  }

  /** Делегирует очистку caster render list текущему rig, если он существует. */
  public clearShadowCasters(): void {
    this.rig?.clearShadowCasters();
  }

  /** Делегирует регистрацию caster mesh текущему rig. */
  public addShadowCaster(mesh: AbstractMesh): void {
    this.rig?.registerShadowCaster(mesh);
  }

  /** Безопасно переключает `receiveShadows`, не трогая уже disposed mesh. */
  public setShadowReceiver(mesh: AbstractMesh, receive: boolean): void {
    if (!mesh.isDisposed()) {
      mesh.receiveShadows = receive;
    }
  }

  /** Batch-метод для внешних интеграций, которым не нужен registry. */
  public registerShadowCasters(meshes: readonly AbstractMesh[]): void {
    this.rig?.registerShadowCasters(meshes);
  }

  /**
   * Помечает meshes как receivers только если в текущем rig есть shadow generator.
   *
   * При отключенных тенях метод явно сбрасывает `receiveShadows`, чтобы meshes не
   * несли устаревшее состояние после смены lighting descriptor'а.
   */
  public registerShadowReceivers(meshes: readonly AbstractMesh[]): void {
    if (!this.rig?.getShadowGenerator()) {
      for (const mesh of meshes) {
        this.setShadowReceiver(mesh, false);
      }
      return;
    }

    for (const mesh of meshes) {
      if (!mesh.isDisposed()) {
        mesh.receiveShadows = true;
      }
    }
  }

  /** Освобождает текущий rig и оставляет controller в пустом состоянии. */
  public dispose(): void {
    this.disposeRig();
  }

  /** Общая точка dispose для смены descriptor'а и полного уничтожения controller'а. */
  private disposeRig(): void {
    this.rig?.dispose();
    this.rig = null;
  }

  /** Переводит hex clear color в Babylon Color4 с полной alpha. */
  private toClearColor(value: string | undefined): Color4 {
    const color = this.toColor3(value, "#8DB7D6");
    return new Color4(color.r, color.g, color.b, 1);
  }

  /** Создает Color3 с fallback, потому что runtime descriptor может прийти не из JSON parser. */
  private toColor3(value: string | undefined, fallback: string): Color3 {
    if (value) {
      try {
        return Color3.FromHexString(value);
      } catch {
        // Runtime descriptor может быть собран в обход JSON-парсера, поэтому сцена получает безопасный fallback.
      }
    }

    return Color3.FromHexString(fallback);
  }
}
