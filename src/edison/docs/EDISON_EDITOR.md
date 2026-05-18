# Edison Editor

Edison is the new editor shell for SillyRPG. It exists next to the legacy `src/editor` package so the old Level Editor can keep working while editor architecture moves toward a smaller core plus plugins.

## Why Edison Exists

The legacy editor grew around concrete workflows: terrain generation, terrain painting, building browsing, lighting controls, scene persistence, selection, and viewport code all live close together. Edison starts from the opposite boundary:

- Edison owns the editor window, viewport, selection, commands, tools, panels, and plugin registration API.
- Domain tools such as terrain generation, terrain painting, building browsing, prop browsing, and lighting authoring belong in plugins.
- Shared runtime behavior remains in `src/core`.

## Package Layers

`src/edison` is split into focused layers:

- `EdisonScene.ts` integrates Edison with the game scene lifecycle.
- `EdisonRuntime.ts` owns service construction, pointer routing, initial scene loading, and disposal.
- `EdisonBootstrap.ts` installs the built-in core plugin and loads the first scene.
- `core/` contains editor services: commands, events, selection, object registry, document state, transforms, viewport, and persistence.
- `layout/` contains dock slots, panel registry, toolbar registry, status bar, and layout types.
- `tools/` contains the built-in select, move, rotate, delete, and editor camera tools.
- `plugins/` contains the plugin manifest, plugin contract, plugin manager, zip installer, persistent plugin loader, and built-in core plugin.
- `ui/` contains the DOM UI shell, theme, CSS, icons, and built-in panels.
- `adapters/` bridges Edison to core scene, terrain, model instantiation, and lighting APIs.
- `docs/` contains architecture and plugin authoring notes.

## Core Editor Base

Edison core includes:

- Babylon Scene View viewport.
- Editor camera controls.
- Grid and axis helpers.
- Selection and selection highlight.
- Scene document dirty state.
- Save, export JSON, and reload commands.
- Basic scene object transforms through Inspector fields.
- Built-in tools: Select, Move, Rotate, Delete.
- Built-in Models View that discovers `.glb` and `.gltf` files under `assets/models`, groups them by top-level directory, and supports drag-and-drop placement into Scene View.
- Toolbar, status bar, hierarchy, inspector, tools, scene view, settings, and a Plugin Manager dialog.
- Plugin API for commands, toolbar buttons, panels, tools, and inspector sections.
- Local editor/plugin preferences for UI state such as Grid/Axes and plugin tool settings.

## What Must Be a Plugin

These are not part of Edison core:

- Terrain generation.
- Terrain painting.
- Terrain sculpting.
- Prop browser.
- Lighting editor UI.
- Custom import/export workflows.
- Domain-specific inspectors.

Edison provides extension points so those features can be added later without making the editor shell a domain tool.

## Core Integration

Edison does not copy terrain runtime code. It uses adapters over `src/core`:

- `SceneDescriptorAdapter` discovers and loads scene descriptor JSON through core location and descriptor APIs.
- `ModelInstantiationAdapter` imports terrain and objects through `importSceneContent`.
- `TerrainCoreAdapter` describes terrain state without generation logic.
- `LightingCoreAdapter` applies scene lighting through core lighting and shadow registries.

`EdisonSceneDocumentService` also exposes a save-assets queue and save participants for plugins that generate files. Terrain texture painting uses this to save raw editable splat PNG data immediately, then bake the heavier runtime albedo texture only during `Save`, while Edison displays a blocking progress dialog. This keeps texture-paint logic out of Edison core.

The first scene is loaded from the existing location store. If loading fails, Edison stays open and reports the error in the status bar.

## Layout Slots

Plugins register DOM panels into stable slots:

```ts
export type EdisonPanelSlot =
  | "left.tools"
  | "left.hierarchy"
  | "center.sceneView"
  | "right.inspector"
  | "right.plugins"
  | "bottom.status"
  | "top.toolbar";
```

The built-in layout maps those slots to a Unity/Godot-like workspace:

- Top menu bar with `Scene`, `Settings`, `Plugins`, then SVG tool icons.
- Left hierarchy panel.
- Center Scene View.
- Right Inspector.
- Right plugin panels when external plugins register them.
- Bottom status bar.

The `left.tools` slot remains part of the API contract for compatibility, but Edison v1's built-in tools are rendered in the top toolbar as icon buttons so the left column can stay focused on scene hierarchy. Built-in Settings and plugin installation live in top menus, not in duplicated right-side panels.

## Commands, Tools, Panels, Inspector

Commands are registered with `context.commands.register` and can be invoked by toolbar buttons or custom panel UI.

Tools are registered with `context.tools.registerTool`. Pointer events are routed to the active tool. The built-in tools use selection, viewport picking, and transform services.

Panels are registered with `context.panels.registerPanel`. Edison v1 panels are DOM-based.

Inspector sections are registered with `context.panels.registerInspectorSection`. Edison renders matching sections after its built-in object or terrain inspector.

Plugin settings are stored through `context.preferences`. Use `getPluginValue` and `setPluginValue` for per-plugin UI state such as selected tabs, brush size, active texture, or generator defaults.

## Extension Points Available Now

Edison v1 supports:

- Command registration.
- Toolbar button registration.
- Panel registration in known slots.
- Tool registration and active tool switching.
- Inspector section registration.
- Selection service access.
- Scene document access.
- Viewport picking and grid/axis toggles.
- Object registry access.
- Transform service access.
- Event bus messages.
- Preference storage through `context.preferences`.
- Persistent ZIP plugin installation through the dev-server `/__edison/plugins` endpoint.
- Core model placement through the built-in Models View. Domain-specific model authoring workflows can still extend this with custom panels or inspectors.

## v1 Limitations

- Undo and redo buttons are present but disabled.
- ZIP plugin installation is persistent in the Vite dev environment. Archives are unpacked under `assets/edison/plugins/installed/` and reloaded on Edison startup.
- Production packaging for externally installed plugins is still planned.
- Move tool supports snapped X/Z dragging.
- Rotate tool and transform buttons rotate around Y by 90 degrees.
- Terrain/building/lighting authoring UI is intentionally not ported into Edison core.
