import { defineConfig } from "vite";
import { edisonModelAssetsPlugin } from "./scripts/edisonModelAssetsPlugin";
import { edisonPluginFsPlugin } from "./scripts/edisonPluginFsPlugin";
import { editorBuildingAssetsPlugin } from "./scripts/editorBuildingAssetsPlugin";
import { editorSceneFsPlugin } from "./scripts/editorSceneFsPlugin";
import { runtimeAssetsPlugin } from "./scripts/runtimeAssetsPlugin";
import { shaderAssetsPlugin } from "./scripts/shaderAssetsPlugin";

export default defineConfig({
  plugins: [
    editorBuildingAssetsPlugin(),
    editorSceneFsPlugin(),
    edisonModelAssetsPlugin(),
    edisonPluginFsPlugin(),
    runtimeAssetsPlugin(),
    shaderAssetsPlugin()
  ]
});
