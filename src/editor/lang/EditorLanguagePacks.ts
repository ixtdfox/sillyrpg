import { dialogs as engDialogs } from "../../core/lang/eng/dialogs";
import { ui as engCoreUi } from "../../core/lang/eng/ui";
import type { LangManager } from "../../core/lang/LangManager";
import { dialogs as ruDialogs } from "../../core/lang/ru/dialogs";
import { ui as ruCoreUi } from "../../core/lang/ru/ui";

const EDITOR_ENG_UI: Record<string, string> = {
  "editor.title": "Level Editor",
  "editor.backToMenu": "Back to Menu",
  "editor.backToMenuShort": "Back",
  "editor.sceneSelector": "Scenes",
  "editor.buildingSelector": "Buildings",
  "editor.loadedScene": "Loaded Scene",
  "editor.loadedMeshesLabel": "Loaded meshes",
  "editor.noSceneLoaded": "No scene loaded",
  "editor.noSceneSelected": "Select a scene to inspect its descriptor.",
  "editor.noBuildingSelected": "Select a building asset to inspect it.",
  "editor.noBuildingSelectedShort": "None",
  "editor.loading": "Loading",
  "editor.ready": "Ready",
  "editor.error": "Error",
  "editor.frameScene": "Frame Scene",
  "editor.frameSceneShort": "Frame",
  "editor.reloadScene": "Reload Scene",
  "editor.reloadSceneShort": "Reload",
  "editor.showGrid": "Show Grid",
  "editor.showAxes": "Show Axes",
  "editor.gridShort": "Grid",
  "editor.axesShort": "Axes",
  "editor.scenePanelHelp": "Select a scene chunk to inspect its descriptor and imported content.",
  "editor.buildingPanelHelp": "Browse discovered building models. Selection only; placement is not enabled yet.",
  "editor.emptyRegistry": "No scenes found in location data.",
  "editor.emptyBuildings": "No building models found. Export .glb or .gltf files into assets/models/buildings and reload the editor.",
  "editor.sceneInspector": "Scene Inspector",
  "editor.buildingInspector": "Building Inspector",
  "editor.selectedBuilding": "Selected Building",
  "editor.descriptorLabel": "Descriptor",
  "editor.terrainLabel": "Terrain",
  "editor.objectsLabel": "Objects",
  "editor.renderableShort": "renderable",
  "editor.helpersShort": "helpers",
  "editor.noTags": "No tags",
  "editor.buildingSelectionOnly": "Selection only. Placement is disabled in this step."
};

const EDITOR_RU_UI: Record<string, string> = {
  "editor.title": "Редактор уровней",
  "editor.backToMenu": "В меню",
  "editor.backToMenuShort": "Назад",
  "editor.sceneSelector": "Сцены",
  "editor.buildingSelector": "Здания",
  "editor.loadedScene": "Загруженная сцена",
  "editor.loadedMeshesLabel": "Загружено мешей",
  "editor.noSceneLoaded": "Сцена не загружена",
  "editor.noSceneSelected": "Выберите сцену, чтобы посмотреть descriptor.",
  "editor.noBuildingSelected": "Выберите asset здания, чтобы посмотреть его данные.",
  "editor.noBuildingSelectedShort": "Нет",
  "editor.loading": "Загрузка",
  "editor.ready": "Готово",
  "editor.error": "Ошибка",
  "editor.frameScene": "Кадрировать сцену",
  "editor.frameSceneShort": "Кадр",
  "editor.reloadScene": "Перезагрузить сцену",
  "editor.reloadSceneShort": "Обновить",
  "editor.showGrid": "Показать сетку",
  "editor.showAxes": "Показать оси",
  "editor.gridShort": "Сетка",
  "editor.axesShort": "Оси",
  "editor.scenePanelHelp": "Выберите chunk сцены, чтобы посмотреть descriptor и загруженный контент.",
  "editor.buildingPanelHelp": "Просматривайте найденные модели зданий. Только выбор; placement пока не включен.",
  "editor.emptyRegistry": "В данных локаций не найдено сцен.",
  "editor.emptyBuildings": "Модели зданий не найдены. Экспортируйте .glb или .gltf в assets/models/buildings и перезагрузите редактор.",
  "editor.sceneInspector": "Инспектор сцены",
  "editor.buildingInspector": "Инспектор здания",
  "editor.selectedBuilding": "Выбранное здание",
  "editor.descriptorLabel": "Descriptor",
  "editor.terrainLabel": "Terrain",
  "editor.objectsLabel": "Объекты",
  "editor.renderableShort": "видимых",
  "editor.helpersShort": "helper",
  "editor.noTags": "Без тегов",
  "editor.buildingSelectionOnly": "Только выбор. Placement отключен на этом этапе."
};

/**
 * Регистратор editor-only ключей локализации.
 *
 * Core language packs намеренно содержат только runtime/main-menu строки.
 * EditorScene вызывает этот регистратор до создания UI, чтобы все `editor.*`
 * ключи оставались владением editor-пакета.
 */
export class EditorLanguagePackRegistrar {
  /**
   * Добавляет editor UI строки к встроенным языковым пакетам.
   */
  public register(langManager: LangManager): void {
    langManager.registerLanguage("eng", {
      ui: {
        ...engCoreUi,
        ...EDITOR_ENG_UI
      },
      dialogs: { ...engDialogs }
    });
    langManager.registerLanguage("ru", {
      ui: {
        ...ruCoreUi,
        ...EDITOR_RU_UI
      },
      dialogs: { ...ruDialogs }
    });
  }
}
