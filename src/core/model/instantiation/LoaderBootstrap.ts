import { SceneLoader } from "@babylonjs/core";

/**
 * Ensures external model loader plugins are available at runtime.
 */
export class LoaderBootstrap {
  private static gltfLoaderReady: Promise<boolean> | null = null;

  public static async ensureLoaderForExtension(extension: string): Promise<boolean> {
    if (SceneLoader.IsPluginForExtensionAvailable(extension)) {
      return true;
    }

    if (extension !== ".glb" && extension !== ".gltf") {
      return false;
    }

    if (!LoaderBootstrap.gltfLoaderReady) {
      LoaderBootstrap.gltfLoaderReady = LoaderBootstrap.loadGlTfPlugin();
    }

    return LoaderBootstrap.gltfLoaderReady;
  }

  private static async loadGlTfPlugin(): Promise<boolean> {
    const remoteModuleUrl = "https://esm.sh/@babylonjs/loaders/glTF";

    try {
      await import(/* @vite-ignore */ remoteModuleUrl);
    } catch (error) {
      console.warn("Unable to load Babylon glTF loader module from CDN.", error);
      return false;
    }

    return SceneLoader.IsPluginForExtensionAvailable(".glb");
  }
}
