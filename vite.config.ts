import { defineConfig } from "vite";
import { edisonModelAssetsPlugin } from "./scripts/edisonModelAssetsPlugin";
import { edisonPluginFsPlugin } from "./scripts/edisonPluginFsPlugin";
import { edisonSceneFsPlugin } from "./scripts/edisonSceneFsPlugin";
import { runtimeAssetsPlugin } from "./scripts/runtimeAssetsPlugin";
import { shaderAssetsPlugin } from "./scripts/shaderAssetsPlugin";

export default defineConfig({
  plugins: [
    edisonSceneFsPlugin(),
    edisonModelAssetsPlugin(),
    edisonPluginFsPlugin(),
    runtimeAssetsPlugin(),
    shaderAssetsPlugin()
  ]
});
