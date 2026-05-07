import { defineConfig } from "vite";
import { editorBuildingAssetsPlugin } from "./scripts/editorBuildingAssetsPlugin";
import { editorSceneFsPlugin } from "./scripts/editorSceneFsPlugin";

export default defineConfig({
  plugins: [editorBuildingAssetsPlugin(), editorSceneFsPlugin()]
});
