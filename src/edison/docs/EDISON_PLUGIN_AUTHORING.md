# Edison Plugin Authoring

Edison plugins are declarative modules that receive an editor context during activation. Edison v1 supports DOM panels and in-memory registration. External zip archive parsing is planned.

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

Future zip plugin archives are expected to use this structure:

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

Edison v1 includes a `Plugins` top menu with an `Install from ZIP` file picker. `EdisonPluginZipInstaller` currently validates the `.zip` extension and returns:

```text
ZIP plugin installation is planned; archive parsing is not implemented yet
```

No external zip dependency is included in v1.
