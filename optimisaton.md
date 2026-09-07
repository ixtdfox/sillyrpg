# План оптимизации рендеринга SillyRPG

## 0. Цели и ограничения

### Цели

- Достичь стабильных 60 FPS на целевой машине: бюджет кадра не более 16.7 ms.
- Не держать в основном render pass интерьер зданий, если игрок находится далеко.
- Не отправлять дальний интерьер в shadow render list.
- Рендерить только объекты, попавшие в камеру, без лишнего обхода всей сцены.
- Сократить количество renderable meshes, материалов, текстур и shadow casters.
- Сохранить текущие игровые контракты: navigation, inside volumes, story visibility, cutaway стен и scene streaming.
- Сделать оптимизацию детерминированной и воспроизводимой при повторном экспорте одного и того же здания.

### Нельзя делать

- Нельзя отключать navigation metadata и `inside_volume`: они нужны игровой логике, даже если не видны.
- Нельзя использовать один общий флаг `isVisible` для LOD, cutaway, frustum culling и debug visibility. Эти состояния должны быть независимыми, иначе одно переключение будет затирать другое.
- Нельзя собирать atlas или LOD во время каждого runtime-кадра.
- Нельзя полагаться только на имена mesh-ов для определения интерьера. Имена должны остаться fallback-механизмом, а основной контракт должен быть через GLTF extras.
- Нельзя оптимизировать только main camera pass и считать задачу решённой: shadow pass является отдельным рендерингом.

### Основные результаты, которых нужно достичь

- Основной render pass: не более 500 renderable scene meshes в типичной сцене.
- Scene objects вне frustum: не участвуют в active mesh traversal на уровне object/chunk root.
- Shadow casters: не более 200 в обычном кадре, включая roads, buildings и characters.
- На дальней дистанции здание представлено только внешним LOD.
- На дальней дистанции интерьер не участвует ни в основном рендере, ни в тенях.
- Материалы и текстуры одинакового типа переиспользуются, а не создаются заново для каждого импортированного GLB.
- Для текущей сцены из скриншота: минимум 2x улучшение FPS после отключения основной причины и последующей оптимизации геометрии.

Цифры выше являются стартовыми acceptance targets. Их нужно подтвердить на целевой видеокарте и не считать абсолютной гарантией для любого hardware.

## 1. Зафиксировать baseline и исправить профилирование

### 1.1. Сделать воспроизводимые performance-сцены

Создать набор фиксированных тестовых положений камеры и игрока:

1. `city_overview`: текущий вид с высокой камерой, видна большая часть квартала.
2. `city_street`: камера на уровне улицы, видны несколько зданий и дороги.
3. `building_far`: игрок находится дальше порога интерьера, здание видно камерой.
4. `building_near`: игрок находится около входа, включён полный интерьер.
5. `building_inside`: игрок находится внутри здания на каждом story.
6. `city_edge`: камера смотрит к границе загруженного chunk.
7. `city_streaming`: игрок пересекает границу chunk и соседний chunk загружается/выгружается.

Для каждой сцены записывать минимум 120 кадров после прогрева shader/material caches.

### 1.2. Не смешивать overhead профайлера с результатом

Текущий PERF-панельный instrumentation включается только для измерений и сам может добавлять overhead. Каждый benchmark запускать в двух режимах:

- обычный runtime без PERF UI;
- runtime с PERF UI для диагностики.

Панель не должна использоваться как единственный источник FPS.

### 1.3. Разделить время кадра

Добавить отдельные значения:

- ECS/update time;
- active mesh evaluation time;
- main camera render time;
- shadow map render time по каждому cascade;
- post-process/render target time;
- GUI/debug time;
- загрузка и обработка LOD/streaming вне кадра.

Сейчас `draw calls: 0` нельзя принимать за отсутствие draw calls. Для Babylon 7 нужно добавить собственный draw-call counter через доступный engine/scene observable либо корректно пометить значение как unavailable.

### 1.4. Проверка baseline по текущему скриншоту

Исходные признаки:

- FPS: около 15.8;
- frame: около 63-70 ms;
- main geometry: около 237k видимых triangles;
- allocated geometry: около 1.1M triangles;
- active meshes: `2183 / 2660`;
- materials: `600`;
- textures: `495`;
- shadow casters: `1706` scene-object meshes;
- terrain LOD: около 7.6k visible triangles.

Вывод baseline: terrain не является первичной причиной. Главный кандидат — cascaded shadows с большим render list, затем количество материалов/mesh parts. Frustum-culling уже работает, но текущая камера видит большую часть города и он не отсекает достаточно объектов.

## 2. Немедленная оптимизация теней

Это отдельный приоритетный этап, потому что текущая сцена рендерит слишком большой shadow list.

### 2.1. Проверочный A/B эксперимент

По очереди измерить:

1. `shadows.enabled = false`;
2. `includeSceneObjects = false`;
3. `casterMode = "none"`;
4. `generator = "standard"`;
5. CSM с двумя каскадами вместо четырёх.

Каждый эксперимент запускать на одинаковом camera/player checkpoint. Разница между пунктами покажет долю времени, которую занимает shadow pass.

### 2.2. Настройки CSM для outdoor-сцены

Изменить lighting descriptor и factory так, чтобы для обычного outdoor режима использовать:

- 2 cascades вместо default 4;
- shadow map 1024 как базовый размер;
- 2048 только для специального high-quality режима;
- ограниченный `shadowMaxZ`, например 60-90 world units;
- PCF только если он нужен визуально;
- `freezeShadowCastersBoundingInfo = true` для статичных buildings/roads;
- пересчёт bounding info только после изменения LOD, scene chunk или набора casters.

В `LightingRigFactory` нужно не задавать настройки вслепую, а конфигурировать CSM явно и покрыть это тестами.

### 2.3. Shadow caster policy

Текущий `casterMode: "all"` нужно заменить на metadata-driven policy:

- внешний shell здания может быть caster;
- дальний `LOD1_Exterior` может быть caster;
- интерьер не caster на дальней дистанции;
- внутренние полы, лестницы, мебель и декоративные элементы по умолчанию не caster;
- roads могут быть caster только если это действительно заметно на земле;
- metadata/helper/navigation meshes никогда не caster;
- characters сохраняют отдельную небольшую policy.

Добавить явные extras/property:

```text
game_shadow_role: "caster" | "receiver" | "both" | "none"
game_shadow_priority: "near" | "far" | "always" | "never"
```

`ShadowMeshPolicy` должен учитывать эти значения до общих fallback-правил.

### 2.4. Динамический shadow render list

`SceneShadowRegistry` сейчас синхронизирует все scene-object meshes и получает около 1706 casters. Нужно перейти к списку оптимизированных render groups:

- registry хранит не все исходные meshes, а только текущие shadow proxies/shell groups;
- список пересобирается при смене LOD здания;
- список пересобирается при загрузке/выгрузке chunk;
- список не пересобирается каждый кадр;
- при обновлении используется hysteresis, чтобы LOD и shadow list не переключались на границе;
- caster должен попадать в shadow list только если он находится в допустимой области света/камеры и в shadow distance.

После изменения списка:

1. очистить старые casters;
2. добавить новые casters;
3. пересчитать CSM caster bounds;
4. снова заморозить bounds для статичной конфигурации.

### 2.5. Shadow proxy

Для каждого здания предусмотреть отдельную упрощённую shadow geometry:

- без оконного стекла;
- без interior walls;
- без мелких railings и декалей;
- с минимальным количеством material slots;
- с сохранением внешнего силуэта.

Если shadow proxy визуально достаточен, именно он используется как caster даже когда на экране включён более подробный LOD.

## 3. Доработка Blender-плагина: подготовка здания

Основная точка изменений: `/home/tony/pets/sillyrpg-extras/procedural_floorplan_ru_v2`.

### 3.1. Не путать сохранение `.blend` и сохранение game scene

Сейчас есть два разных процесса:

- Blender plugin генерирует/подготавливает building asset;
- Edison сохраняет game scene descriptor с позициями и ссылками на assets.

Edison browser runtime не может напрямую запустить Python-код Blender при сохранении descriptor. Поэтому тяжёлую генерацию нужно выполнять в Blender во время подготовки/export building asset. В game scene descriptor должны попадать уже готовые ссылки на оптимизированный asset.

Не рекомендуется молча запускать долгий GLB export на каждый обычный `Ctrl+S` Blender-файла. Нужен явный оператор `Prepare Runtime Assets` или отдельный экспортный шаг, который можно вызвать из save/export pipeline.

### 3.2. Стабильная структура коллекций

Генератор должен создавать предсказуемую структуру:

```text
BuildingRoot
├── Render
│   ├── LOD0_Full
│   │   ├── Exterior
│   │   ├── Interior
│   │   └── Decorative
│   ├── LOD1_Exterior
│   └── ShadowProxy
├── Navigation
├── Visibility
│   └── InsideVolumes
└── Debug
```

`Navigation`, `Visibility` и `Debug` не должны входить в render collections. Они могут экспортироваться в тот же GLB как hidden/helper nodes, если runtime-контракт этого требует.

### 3.3. Явные metadata contracts

Каждому render object и root назначить Blender custom properties, которые попадут в GLTF extras:

```text
game_building_id
game_story_index
game_part
game_visibility_role
game_visibility_behavior
game_lod_group
game_lod_level
game_lod_role
game_shadow_role
game_nav
```

Рекомендуемые значения:

- `game_lod_group = "building_render"`;
- `game_lod_level = 0` для полного здания;
- `game_lod_level = 1` для внешнего LOD;
- `game_lod_role = "full"`, `"exterior"` или `"shadow_proxy"`;
- `game_interior = true` для interior geometry;
- `game_interior = false` для shell;
- `game_shadow_role = "none"` для interior geometry дальнего LOD.

Имена `InnerWall`, `Room`, `Interior` остаются fallback для старых assets, но новые assets обязаны иметь metadata.

### 3.4. LOD0

LOD0 предназначен для близкого здания и игрока внутри:

- внешние стены;
- окна, двери и фасадные детали;
- внутренние стены;
- floor/ceiling/stairs;
- story-specific geometry;
- материалы с нужной детализацией;
- visibility metadata;
- inside volumes;
- navigation metadata.

Для LOD0 нужно сохранить разделение по story там, где оно требуется текущей cutaway-логике. Объединять можно только объекты, имеющие совместимые story/visibility/shadow свойства.

### 3.5. LOD1 Exterior

LOD1 предназначен для здания дальше игрока:

- только внешний силуэт;
- outer walls;
- roof;
- необходимые facade windows/doors;
- крупные roof/terrace elements, если они видимы снаружи;
- один или несколько объединённых opaque meshes;
- отдельный alpha mesh только если окна действительно требуют прозрачности;
- упрощённые normals и UV;
- без inner walls;
- без комнат, мебели, внутренних полов, внутренних лестниц и внутренних дверей;
- без навигации в render collection;
- без внутренних shadow casters.

LOD1 нельзя делать простым включением/выключением случайных mesh-ов. Он должен быть отдельным подготовленным результатом, чтобы не оставались тысячи мелких объектов.

### 3.6. ShadowProxy

ShadowProxy строится из LOD1 или из ещё более простой оболочки:

- 1-2 mesh groups на здание;
- только opaque material;
- без alpha geometry, если она не нужна для силуэта;
- без UV-detail, если shadow material его не использует;
- отдельные metadata `game_lod_role = "shadow_proxy"` и `game_shadow_role = "caster"`.

### 3.7. Использовать существующий `GeneratedMeshOptimizer`

Текущий `optimization/mesh_optimizer.py` уже умеет:

- группировать generated parts;
- удалять дубли;
- удалять внутренние противоположные faces стен;
- удалять нижние faces стен;
- сохранять часть game metadata.

Его нужно расширить:

1. Разделить исходные объекты по render role: exterior/interior/shadow/debug.
2. Сначала построить нормализованный LOD0.
3. Из exterior-подмножества построить LOD1.
4. Из LOD1 построить ShadowProxy.
5. Применить decimation только к LOD1/ShadowProxy, не к LOD0 без проверки.
6. Проверить world-space bbox исходного и результата.
7. Проверить, что LOD1 не содержит `game_interior = true`.
8. Проверить, что navigation/visibility helper objects не потеряны.
9. Сделать операцию idempotent: повторный запуск обновляет сгенерированные коллекции, а не создаёт копии.

### 3.8. Контроль качества LOD

Для каждого building asset экспортировать отчёт:

- число objects по LOD;
- vertex/triangle count по LOD;
- число material slots;
- число текстур;
- bbox LOD0/LOD1/ShadowProxy;
- список interior objects, попавших в LOD1;
- список shadow casters;
- список пропущенных/невалидных объектов.

Стартовые ориентиры:

- LOD1: 20-35% triangle count от визуального LOD0;
- ShadowProxy: 5-15% triangle count от LOD0;
- LOD1: не более 2-4 render mesh groups на здание без необходимости сохранять story separation;
- ShadowProxy: 1-2 mesh groups на здание.

## 4. Atlas и material sharing

### 4.1. Решение по atlas

Не нужно создавать отдельный atlas для каждой размещённой копии здания или каждый кадр.

Правильное разделение:

- atlas создаётся для asset/style family;
- несколько экземпляров одного building asset используют один и тот же atlas;
- разные стили могут иметь разные atlas;
- roads могут иметь отдельный road atlas;
- scene-level atlas нужен только если в одной сцене много уникальных исходных текстур и asset-level atlas недостаточен.

### 4.2. Исправить текущий `atlas.py`

Сейчас `apply_atlas_to_collection()` создаёт material cache по ключу `(category, use_alpha)`, хотя категории используют одну atlas image. В результате появляются отдельные materials для `walls`, `floors`, `roofs`, `stairs` и других категорий.

Изменить cache:

```text
opaque atlas material: один material
alpha atlas material: один material
```

Категория должна определять UV region, но не создавать новый material, если shader features одинаковые.

Не объединять opaque и alpha в один material, если это ломает blend mode, depth write или alpha clipping.

### 4.3. Atlas quality requirements

При генерации atlas:

- добавить gutter/padding вокруг каждого tile;
- генерировать mipmaps;
- учитывать цвет/alpha bleed при padding;
- сохранять одинаковую систему координат Blender и GLTF;
- валидировать `tile_width_m` и `tile_height_m`;
- не включать helper/debug textures;
- проверить визуально окна на mip levels и под углом.

### 4.4. Runtime material cache

Даже один material внутри исходного GLB может дублироваться при каждом `SceneLoader.ImportMeshAsync()`.

Добавить runtime cache:

- ключ: atlas URL + shader mode + alpha mode + relevant material flags;
- общие textures переиспользуются по URL;
- общие opaque/alpha materials переиспользуются между экземплярами;
- нельзя бездумно вызывать `dispose()` для shared material при выгрузке одного объекта;
- нужен reference count или owner registry.

Для статичных зданий рассмотреть `AssetContainer`/asset instance pipeline:

- геометрия и materials загружаются один раз на уникальный asset;
- экземпляры получают собственные transform roots;
- metadata и visibility state хранятся на instance/root, а не копируются в каждую геометрию;
- проверить совместимость с GLTF animations/skeletons, если они появятся.

### 4.5. Ожидаемый эффект

После atlas material sharing:

- materials должны уменьшиться с сотен до небольшого числа shared materials;
- textures должны быть близки к числу уникальных atlas/road/terrain textures;
- не должно быть 10-20 копий одной и той же `house_atlas.png` в runtime.

## 5. Формат экспорта и scene descriptor

### 5.1. Первый безопасный вариант: один GLB с LOD roots

Для первой реализации экспортировать один GLB с внутренними roots `LOD0_Full`, `LOD1_Exterior` и `ShadowProxy`.

Плюсы:

- не требуется сложная async загрузка при приближении;
- LOD переключается мгновенно;
- metadata/inside volumes остаются в одном asset;
- проще сохранить совместимость с текущим `descriptor.asset`.

Минус: полная геометрия загружается в память даже если LOD0 отключён. Это приемлемо для первого этапа, потому что текущая проблема прежде всего render cost.

### 5.2. Второй вариант: отдельные GLB

После стабилизации render LOD можно перейти к:

```text
building-silent-1.full.glb
building-silent-1.exterior.glb
building-silent-1.shadow.glb
```

Тогда scene descriptor должен поддержать:

```json
{
  "asset": "assets/models/buildings/silent_1.full.glb",
  "lod": {
    "exterior": "assets/models/buildings/silent_1.exterior.glb",
    "shadow": "assets/models/buildings/silent_1.shadow.glb"
  }
}
```

Этот вариант уменьшает память, но требует async loading, placeholder shell, cancellation и lifecycle для загрузки полного интерьера.

### 5.3. Runtime loader contract

Изменить `SceneContentLoader` так, чтобы `ImportedSceneObjectContent` возвращал:

- root объекта;
- LOD roots/groups;
- renderable meshes по каждому LOD;
- metadata/visibility meshes;
- shadow proxy meshes;
- bounds, рассчитанные один раз после import.

Не вычислять bounding box каждого объекта заново на каждом кадре.

Добавить валидацию:

- если LOD metadata отсутствует, безопасный fallback — полный asset;
- если LOD1 повреждён, не скрывать здание полностью;
- если LOD0 ещё грузится, показывать LOD1;
- helper metadata не должен попадать в main render list.

## 6. Runtime LOD зданий

### 6.1. Выделить отдельный controller

Текущая `BuildingVisibilitySystem` уже отвечает за wall halo и story cutaway. LOD и общий object culling лучше вынести в отдельный модуль:

```text
src/core/scene/visibility/SceneObjectVisibilityController.ts
src/core/scene/visibility/BuildingLodController.ts
```

`BuildingVisibilitySystem` оставить ответственным за:

- определение текущего здания/story игрока;
- wall halo;
- скрытие верхних этажей.

`BuildingLodController` отвечает за:

- LOD distance;
- переключение LOD roots;
- interior state;
- shadow proxy state;
- уведомление shadow registry о смене caster set.

### 6.2. Правила переключения

Для каждого здания хранить состояние:

```text
FULL_NEAR
EXTERIOR_FAR
LOADING_FULL
```

Дистанцию считать от player position до world-space footprint/AABB, а не до центра здания.

Стартовые thresholds:

- включить LOD0 при distance `<= 16`;
- вернуться к LOD1 при distance `> 20`;
- если игрок внутри `inside_volume`, принудительно включить LOD0;
- при отсутствии footprint использовать conservative fallback и не скрывать asset.

Два порога обязательны, чтобы не было flicker на границе.

### 6.3. Частота обновления

Не проверять все здания на каждом render frame без необходимости.

- обновлять LOD 5-10 раз в секунду;
- немедленно обновлять при перемещении игрока больше movement threshold;
- немедленно обновлять при смене story;
- немедленно обновлять при chunk load/unload;
- camera frustum culling обновлять при изменении camera transform или с небольшим throttling.

### 6.4. Раздельные roots

Нужно переключать render roots, а не весь building root:

- `Render/LOD0_Full`;
- `Render/LOD1_Exterior`;
- `ShadowProxy`;
- `Visibility/InsideVolumes`;
- `Navigation`.

Отключение LOD0 не должно выключать volume и navigation.

### 6.5. Совместимость с cutaway

Порядок обновления:

1. определить player/building/story;
2. выбрать LOD;
3. применить LOD root visibility;
4. применить shadow role/list;
5. применить story cutaway только к активному LOD0;
6. применить wall halo.

Один controller должен быть владельцем конечного render state либо использовать независимые state channels. Нельзя восстанавливать mesh из одного сохранённого `isVisible`, если его одновременно меняли LOD и cutaway.

## 7. Main-camera frustum и scene object culling

### 7.1. Что уже работает

`scene.getActiveMeshes()` показывает результат Babylon selection/frustum pass. Значение `2183 / 2660` означает, что в текущем camera volume попадает около 82% mesh-ов. Это не ошибка frustum-culling.

### 7.2. Почему этого недостаточно

- camera в screenshot видит большую часть квартала;
- Babylon всё равно хранит и проверяет bounds всех scene meshes;
- mesh-level culling не уменьшает shadow render list;
- внутренние части здания могут иметь свои mesh/material checks, даже если визуально закрыты внешней оболочкой;
- большое число мелких mesh-ов создаёт CPU overhead и material state changes.

### 7.3. Object/chunk hierarchy

Добавить два уровня broad-phase:

1. chunk root;
2. scene-object/building/road root.

Для каждого root один раз вычислять world AABB/sphere. Если root полностью вне camera frustum, отключать его render root. Если root пересекает frustum, оставлять включённым и использовать обычный Babylon mesh culling внутри.

Не отключать gameplay roots, содержащие navigation/trigger/inside metadata.

### 7.4. Spatial index

Для большого числа scene objects использовать spatial index:

- grid по chunk coordinates как первый простой вариант;
- quadtree/BVH для крупных сцен;
- обновлять только buckets, пересекающие camera frustum;
- обновлять bounds только при transform/chunk changes.

Не добавлять сложный BVH до измерения. Для текущих 15 зданий основной выигрыш даст LOD и shadows, но index нужен для роста карты.

### 7.5. Culling flags audit

Проверить все meshes, у которых:

- `alwaysSelectAsActiveMesh = true`;
- `skipFrustumClipping = true`;
- специальные debug/line flags.

Оставить такие флаги только для маленьких debug meshes и UI helpers. Большой building/road mesh не должен обходить frustum culling.

## 8. Roads и статическая геометрия

### 8.1. Дороги

Текущие connected road GLB-объекты состоят из повторяющихся вариантов. Для runtime:

- сгруппировать roads по chunk и preset/variant;
- объединять дороги в несколько chunk-level meshes либо использовать instances/thin instances;
- сохранить collision/navigation footprint отдельно;
- использовать общий road material/atlas;
- исключить мелкие дорожные детали из shadows или использовать chunk-level shadow proxy.

### 8.2. Здания

Для дальнего LOD не сохранять разбиение по каждому tile и story, если оно не нужно для внешнего силуэта. Story separation нужна только LOD0, когда игрок рядом/внутри.

### 8.3. Static batching

После LOD и atlas проверить batching по группам:

- одинаковый material;
- одинаковый render role;
- одинаковые shadow flags;
- один chunk или один building instance.

Не объединять в один mesh объекты, которым нужна разная visibility/cutaway логика.

## 9. Chunk streaming и lifecycle

### 9.1. Текущая проблема

`DistrictSceneStreamingController` загружает соседние chunks по близости к границе, но `unloadDistance` фактически не завершает lifecycle выгрузки всех дальних chunks.

### 9.2. Целевое поведение

- текущий chunk всегда загружен;
- соседние chunks загружаются с load margin;
- дальние chunks выгружаются с большим unload margin;
- load/unload имеют hysteresis;
- текущий chunk и chunk с игроком никогда не выгружаются;
- pending async loads можно отменить или безопасно игнорировать после смены location;
- после chunk change обновляются grid, triggers, LOD registry, shadow registry и material ownership.

### 9.3. Уровни загрузки

Для больших карт предусмотреть:

- shell/exterior chunk загружается первым;
- полный интерьер здания загружается только при приближении;
- при удалении full asset выгружается, но lightweight inside volume/navigation остаётся в chunk metadata.

Это второй этап после варианта с одним GLB и двумя LOD roots.

## 10. Memory и asset lifecycle

Сокращение draw calls не равно сокращению памяти. После render optimization проверить:

- duplicate vertex buffers от повторного импорта одинаковых GLB;
- duplicate materials;
- duplicate textures;
- неосвобождённые LOD0 после ухода игрока;
- shadow proxy, который остаётся в сцене после unload;
- stale receiver/caster flags.

Ввести owner/reference lifecycle:

- asset cache владеет shared geometry/material/texture;
- scene object владеет instance/root;
- chunk владеет scene object instances;
- unload освобождает только ресурсы, на которые больше нет ссылок.

## 11. Изменения в TypeScript runtime

### Файлы, которые потребуется изменить

- `src/core/world/scene/SceneDescriptor.ts` — metadata/LOD descriptor, если выбран вариант с отдельными GLB;
- `src/core/world/scene/SceneContentLoader.ts` — обнаружение LOD roots, bounds и render groups;
- `src/core/world/location/LocationManager.ts` — выдача scene object content и lifecycle;
- `src/core/scene/visibility/BuildingVisibilitySystem.ts` — оставить cutaway/halo и интегрировать новый controller;
- `src/core/scene/visibility/BuildingVisibilityRegistry.ts` — хранение interior/exterior/shadow records;
- новый `BuildingLodController.ts`;
- новый `SceneObjectVisibilityController.ts`;
- `src/core/lighting/ShadowMeshPolicy.ts` — metadata roles;
- `src/core/lighting/SceneShadowRegistry.ts` — dynamic caster groups;
- `src/core/lighting/LightingRigFactory.ts` — CSM settings, cascades, frozen bounds;
- `src/core/scene/in-game/performance/RuntimePerformanceSampler.ts` — main/shadow instrumentation;
- `src/core/scene/in-game/performance/RuntimePerformancePanelUi.ts` — display LOD/culling/shadow diagnostics;
- `src/core/world/location/district/DistrictSceneStreamingController.ts` — unload lifecycle.

### Runtime diagnostics to add

- total scene objects;
- objects inside camera frustum;
- objects culled by root;
- active LOD0 count;
- active LOD1 count;
- hidden interior mesh count;
- shadow proxy count;
- shadow caster count by role;
- shadow casters inside/outside camera/light range;
- shared material count;
- shared texture count;
- loaded/full/interior asset count;
- chunk load/unload counts and timings.

## 12. Изменения в Blender plugin

### Файлы, которые потребуется изменить

- `optimization/mesh_optimizer.py` — LOD0/LOD1/ShadowProxy generation;
- `atlas.py` — два shared materials вместо одного material на категорию;
- `building_stories_manager.py` — передача render roles и явного interior metadata;
- `navigation.py` — сохранение Navigation/Visibility отдельно от render collections;
- `state.py` — поля build/export result и LOD statistics;
- `ui/operators.py` — операторы prepare/export runtime assets;
- `ui/panel.py` — настройки LOD/atlas/export и отчёт;
- `config.py` и `ui/props.py` — LOD distance/export settings;
- новый модуль `optimization/lod_builder.py`;
- новый модуль `optimization/gltf_exporter.py`, если встроенного export workflow недостаточно.

### Настройки plugin

Добавить:

- включение runtime LOD;
- LOD1 decimation ratio или target triangle budget;
- ShadowProxy decimation ratio;
- включение/выключение interior в LOD0;
- atlas output path;
- generated asset output path;
- export format GLB;
- validate-only mode;
- deterministic seed/hash;
- auto prepare before explicit runtime export.

## 13. Тестирование

### 13.1. Unit tests TypeScript

Добавить тесты на:

- parsing `game_lod_level`, `game_lod_role`, `game_interior`;
- grouping LOD meshes by building instance;
- distance to building footprint;
- near/far hysteresis;
- force LOD0 while player is inside volume;
- fallback when metadata/LOD is absent;
- no interior meshes in LOD1 registry;
- no shadow casters for far interior;
- shadow policy roles;
- dynamic registry update after chunk load/unload;
- restore states after scene replacement;
- material cache reference counting;
- culling state not overriding cutaway state.

### 13.2. Tests Blender plugin

Добавить smoke/validation tests без обязательного UI:

- generated collection has expected roots;
- repeated generation does not duplicate LOD collections;
- LOD1 contains no interior-tagged object;
- ShadowProxy has expected role and no alpha/decal materials;
- atlas UVs remain inside padded regions;
- all required navigation/visibility metadata exists;
- LOD bbox contains or matches LOD0 external bbox within tolerance;
- GLB export is readable by Babylon loader;
- repeated export with same settings produces same counts and metadata.

### 13.3. Visual regression checks

Проверить:

- дальнее здание визуально остаётся полноценной внешней коробкой;
- при приближении LOD0 включается без заметного pop или с коротким controlled fade;
- окна не мерцают и не bleeding на mip levels;
- игрок может определить вход и войти в здание;
- внутри корректно работает story cutaway;
- внешний stair connector не исчезает из-за LOD;
- hidden upper floors не возвращаются после LOD toggle;
- roads не исчезают на границах frustum/chunk;
- тени не остаются от выгруженного LOD.

## 14. Порядок реализации

### Фаза A. Измерения

1. Зафиксировать checkpoints и baseline.
2. Исправить draw-call/shadow timing diagnostics.
3. Сделать A/B shadows off/includeSceneObjects off.
4. Подтвердить доли main render, shadow render, active traversal и materials.

Результат: таблица до оптимизации.

### Фаза B. Быстрый shadow fix

1. Уменьшить CSM до 2 cascades/1024 в outdoor preset.
2. Включить frozen caster bounds для статичных chunks.
3. Ограничить shadow distance.
4. Перевести scene objects на metadata policy.
5. Убрать interior/decal/helper meshes из shadow list.
6. Добавить диагностику реального shadow pass.

Результат: FPS должен заметно вырасти без изменения внешнего вида LOD.

### Фаза C. Blender metadata и экспортный контракт

1. Добавить явные `game_interior`, `game_lod_*`, `game_shadow_*` properties.
2. Разделить Render/Navigation/Visibility/Debug collections.
3. Добавить validation report.
4. Сделать явный `Prepare Runtime Assets`.
5. Экспортировать тестовый один building GLB.
6. Проверить импорт extras в Babylon.

Результат: один asset с проверяемым контрактом.

### Фаза D. Building LOD

1. Реализовать LOD0 normalization.
2. Реализовать LOD1 exterior generation.
3. Реализовать ShadowProxy.
4. Добавить decimation/merge/weld и bbox checks.
5. Экспортировать один GLB с LOD roots.
6. Добавить runtime LOD controller.
7. Интегрировать LOD с cutaway и inside volume.

Результат: дальнее здание рендерит только LOD1, близкое — LOD0.

### Фаза E. Atlas/material sharing

1. Исправить material cache в Blender atlas.
2. Добавить padding/mip validation.
3. Подключить runtime shared material/texture cache.
4. Проверить повторный импорт 15 building instances.
5. Замерить materials/textures до и после.

Результат: резкое снижение material/texture duplication.

### Фаза F. Main-camera culling и roads

1. Вынести object frustum controller из BuildingVisibilitySystem.
2. Кэшировать object bounds.
3. Включить chunk/object hierarchy.
4. Провести audit culling overrides.
5. Объединить/инстансировать roads по chunk/variant.

Результат: меньше active mesh traversal и CPU overhead в больших кварталах.

### Фаза G. Streaming и память

1. Реализовать unloadDistance.
2. Добавить safe async lifecycle.
3. Добавить full-interior load/unload, если одного GLB недостаточно по памяти.
4. Проверить shared resource ownership.
5. Проверить stale shadow/material/texture resources.

Результат: карта масштабируется без постоянного роста scene resources.

### Фаза H. Финальная настройка и приёмка

1. Прогнать все fixed checkpoints.
2. Сравнить p50/p95 frame time.
3. Проверить визуальное качество теней и LOD.
4. Проверить navigation/cutaway/story behavior.
5. Обновить PERF panel и документацию.
6. Зафиксировать рабочие quality presets: low/medium/high.

## 15. Критерии приёмки

Оптимизация считается завершённой, если одновременно выполнены условия:

- в `city_overview` main camera не рендерит интерьер дальних зданий;
- в `building_far` активен только LOD1 и ShadowProxy;
- в `building_near` активен LOD0, а LOD1 отключён;
- внутри здания LOD0 и текущая story visibility работают корректно;
- `inside_volume` и navigation остаются доступны при выключенном render LOD0;
- far interior не находится в shadow render list;
- shadow casters не равны количеству всех scene-object meshes;
- materials/textures shared и не дублируются на каждый asset instance;
- roads и buildings вне камеры не попадают в active render traversal;
- chunk unload удаляет render/shadow resources без stale references;
- нет визуальных дыр во внешней оболочке здания;
- нет flicker на границах LOD и chunk;
- performance baseline улучшен на всех fixed checkpoints, а не только в одном удачном ракурсе;
- `npm run build`, plugin validation и профильные TypeScript tests проходят.

## 16. Итоговая рекомендуемая архитектура

```text
Blender plugin
  -> generated atlas materials
  -> LOD0_Full
  -> LOD1_Exterior
  -> ShadowProxy
  -> Navigation/Visibility metadata
  -> validated GLB + optional manifest

Scene descriptor
  -> references validated building asset

SceneContentLoader
  -> imports scene object
  -> caches bounds/materials/textures
  -> exposes render/LOD/shadow/helper groups

Runtime
  -> chunk streaming
  -> spatial object culling
  -> building LOD controller by player distance
  -> cutaway controller for active LOD0
  -> dynamic shadow registry using shell/proxy only
  -> shared material/texture lifecycle

Performance panel
  -> main render timing
  -> shadow timing
  -> active/culled objects
  -> LOD counts
  -> caster/proxy counts
  -> material/texture duplication diagnostics
```

Главный порядок приоритетов: сначала подтвердить shadow bottleneck и сократить CSM cost, затем сделать корректный Blender LOD/metadata export, затем подключить runtime LOD, после этого заниматься atlas/material cache, roads batching и полноценным streaming.
