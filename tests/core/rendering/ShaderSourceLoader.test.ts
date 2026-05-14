import {
  SHADER_SOURCE_IDS,
  ShaderSourceLoader,
  ShaderTemplateRenderer,
  type ShaderSourceId
} from "../../../src/core/rendering/shaders/ShaderSourceLoader";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testLoaderReadsShaderSourceFromRootShadersDirectory(): void {
  const loader = new ShaderSourceLoader();
  const source = loader.load(SHADER_SOURCE_IDS.visibility.wallHalo.updateAlpha);

  assert(
    source.includes("wallHaloDistanceCylinder"),
    "Expected loader to read the wall halo GLSL source from the root shaders directory."
  );
}

function testLoaderCachesShaderSources(): void {
  const loader = new ShaderSourceLoader();
  const firstSource = loader.load(SHADER_SOURCE_IDS.editorTerrain.splat.updateDiffuse);
  const secondSource = loader.load(SHADER_SOURCE_IDS.editorTerrain.splat.updateDiffuse);

  assert(firstSource === secondSource, "Expected loader to return stable cached shader source.");
}

function testLoaderRejectsUnsafeShaderIds(): void {
  const loader = new ShaderSourceLoader();
  let threw = false;

  try {
    loader.load("../package.json" as ShaderSourceId);
  } catch (error) {
    threw = (error as Error).message.includes("Invalid shader source id");
  }

  assert(threw, "Expected loader to reject path traversal shader ids.");
}

function testTemplateRendererSubstitutesNamedPlaceholders(): void {
  const renderer = new ShaderTemplateRenderer();
  const source = renderer.render("uniform sampler2D {{samplerName}};", {
    samplerName: "terrainSplatMap0"
  });

  assert(
    source === "uniform sampler2D terrainSplatMap0;",
    "Expected renderer to substitute named GLSL template placeholders."
  );
}

function testTemplateRendererReportsMissingPlaceholders(): void {
  const renderer = new ShaderTemplateRenderer();
  let threw = false;

  try {
    renderer.render("{{missingValue}}", {});
  } catch (error) {
    threw = (error as Error).message.includes("missingValue");
  }

  assert(threw, "Expected renderer to report missing GLSL template values.");
}

function run(): void {
  testLoaderReadsShaderSourceFromRootShadersDirectory();
  testLoaderCachesShaderSources();
  testLoaderRejectsUnsafeShaderIds();
  testTemplateRendererSubstitutesNamedPlaceholders();
  testTemplateRendererReportsMissingPlaceholders();
}

run();
console.log("ShaderSourceLoader tests passed");
