import { NullEngine, Scene, StandardMaterial } from "@babylonjs/core";
import {
  installWallHaloMaterial,
  WallHaloMaterialPlugin
} from "../../../src/core/scene/visibility/WallHaloMaterialPlugin";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testPluginRegistersAfterShaderLoaderInitialization(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial("wall-halo-target", scene);

  const plugin = new WallHaloMaterialPlugin(material);
  const customCode = plugin.getCustomCode("fragment");

  assert(customCode !== null, "Expected wall halo plugin to provide fragment custom code.");
  assert(
    customCode?.CUSTOM_FRAGMENT_UPDATE_ALPHA.includes("wallHaloDistanceCylinder") === true,
    "Expected wall halo plugin to load GLSL after the loader has been initialized."
  );

  scene.dispose();
  engine.dispose();
}

function testInstallWallHaloMaterialCreatesInitializedPlugins(): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial("wall-halo-source", scene);

  const binding = installWallHaloMaterial(material);

  assert(binding !== null, "Expected wall halo material binding to be created.");
  assert(binding?.haloPlugins.length === 1, "Expected one initialized wall halo plugin for a standard material.");
  assert(
    binding?.haloPlugins[0]?.getCustomCode("fragment") !== null,
    "Expected installed wall halo plugin to expose fragment shader code."
  );

  binding?.haloMaterial.dispose(false, false);
  scene.dispose();
  engine.dispose();
}

function run(): void {
  testPluginRegistersAfterShaderLoaderInitialization();
  testInstallWallHaloMaterialCreatesInitializedPlugins();
}

run();
console.log("WallHaloMaterialPlugin tests passed");
