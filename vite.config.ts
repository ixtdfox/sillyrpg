import { defineConfig } from "vite";
import { editorBuildingAssetsPlugin } from "./scripts/editorBuildingAssetsPlugin";
import { editorSceneFsPlugin } from "./scripts/editorSceneFsPlugin";
import { shaderAssetsPlugin } from "./scripts/shaderAssetsPlugin";

export default defineConfig({
  plugins: [editorBuildingAssetsPlugin(), editorSceneFsPlugin(), shaderAssetsPlugin()]
});
