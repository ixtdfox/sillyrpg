# Edison Plugin Authoring

Edison plugins are declarative modules that receive an editor context during activation. Edison v1 supports DOM panels, in-memory registration, and session-local installation from ZIP archives.

## Manifest

Each plugin declares a manifest:

```ts
export interface EdisonPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly description?: string;
  readonly entry: string;
  readonly edisonApiVersion: "1";
}
```

## Lifecycle

```ts
export interface EdisonPlugin {
  readonly manifest: EdisonPluginManifest;
  activate(context: EdisonPluginContext): void | Promise<void>;
  deactivate?(context: EdisonPluginContext): void | Promise<void>;
}
```

Use `activate` to register commands, panels, tools, toolbar buttons, and inspector sections. Keep the disposer returned by each register call if the plugin needs explicit cleanup in `deactivate`.

## Context

```ts
export interface EdisonPluginContext {
  readonly apiVersion: "1";
  readonly commands: EdisonCommandRegistry;
  readonly toolbar: EdisonToolbarRegistry;
  readonly panels: EdisonPanelRegistry;
  readonly tools: EdisonToolRegistry;
  readonly selection: EdisonSelectionService;
  readonly scene: EdisonSceneDocumentService;
  readonly viewport: EdisonViewportService;
  readonly objects: EdisonObjectRegistry;
  readonly transforms: EdisonTransformService;
  readonly events: EdisonEventBus;
}
```

## Register a Command

```ts
context.commands.register({
  id: "terrain.generate",
  title: "Generate Terrain",
  execute: async () => {
    context.events.emit("edison.message", { text: "Generate Terrain clicked" });
  }
});
```

## Add a Toolbar Button

```ts
context.toolbar.registerButton({
  id: "terrain.openGenerator",
  title: "Terrain",
  icon: "terrain",
  order: 200,
  commandId: "terrain.openPanel"
});
```

## Add a Panel

```ts
context.panels.registerPanel({
  id: "terrain.generator",
  title: "Terrain Generator",
  slot: "right.plugins",
  order: 100,
  render: (host, context) => {
    host.textContent = "Terrain generator plugin UI";
  }
});
```

## Add a Tool

```ts
context.tools.registerTool({
  id: "terrain.paint",
  title: "Paint Terrain",
  icon: "brush",
  activate: () => {},
  deactivate: () => {},
  onPointerDown: (event) => {
    console.log(event.nativeEvent.clientX, event.nativeEvent.clientY);
  },
  onPointerMove: () => {},
  onPointerUp: () => {}
});
```

## Add an Inspector Section

```ts
context.panels.registerInspectorSection({
  id: "building.metadata",
  title: "Building Metadata",
  order: 300,
  canRender: (selection) => selection?.kind === "scene-object",
  render: (host, selection, context) => {
    if (selection?.kind !== "scene-object") {
      return;
    }

    const object = context.scene.getObject(selection.objectId);
    host.textContent = object ? `Asset: ${object.asset}` : "Missing object";
  }
});
```

## Queue Generated Assets for Save

Plugins that generate editor assets can queue PNG payloads before marking the scene dirty. Edison writes queued assets together with the next `Save` command, using the same `/__editor/scene` save endpoint as the legacy editor.

```ts
context.scene.queueSaveAssets([
  {
    path: "assets/generated/terrain/my-scene/terrain-0_albedo.png",
    encoding: "dataUrl",
    mimeType: "image/png",
    data: "data:image/png;base64,..."
  }
]);
```

Use this for generated runtime-ready assets while keeping editable raw data referenced from the scene descriptor.

For expensive save-time work, register a save participant. Edison runs participants before writing files and shows their progress in the blocking save dialog.

```ts
const dispose = context.scene.registerSaveParticipant({
  id: "example.textureBake",
  title: "Baking terrain texture",
  async prepare(save) {
    save.report({ message: "Baking terrain texture...", progress: 0.25 });
    save.queueSaveAssets([
      {
        path: "assets/generated/terrain/my-scene/terrain-0_albedo.png",
        encoding: "dataUrl",
        mimeType: "image/png",
        data: "data:image/png;base64,..."
      }
    ]);
    save.report({ message: "Terrain texture ready.", progress: 1 });
  }
});
```

## Minimal Plugin Example

```ts
export const plugin = {
  manifest: {
    id: "example.hello",
    name: "Hello Edison",
    version: "0.1.0",
    entry: "dist/index.js",
    edisonApiVersion: "1"
  },
  activate(context) {
    context.commands.register({
      id: "example.hello.sayHello",
      title: "Say Hello",
      execute: () => context.events.emit("edison.message", { text: "Hello from plugin" })
    });

    context.panels.registerPanel({
      id: "example.hello.panel",
      title: "Hello",
      slot: "right.plugins",
      order: 1000,
      render: (host) => {
        host.textContent = "Hello Edison plugin";
      }
    });
  }
};
```

## ZIP Plugin Format

Zip plugin archives use this structure:

```text
my-plugin.zip
  edison-plugin.json
  dist/index.js
  assets/icon.svg
```

`edison-plugin.json`:

```json
{
  "id": "example.terrain-tools",
  "name": "Terrain Tools",
  "version": "0.1.0",
  "entry": "dist/index.js",
  "edisonApiVersion": "1"
}
```

## ZIP Installer Status

Edison v1 includes a `Plugins` top menu with an `Install from ZIP` file picker. `EdisonPluginZipInstaller` reads `edison-plugin.json`, imports the configured `entry` as an ES module, and registers the exported `plugin` or default export.

The installer is intentionally dependency-free. It supports stored ZIP entries and deflated entries when the browser provides `DecompressionStream`. Plugin installation is session-local in v1; persistent plugin storage and asset URL resolution are planned.
