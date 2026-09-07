import { CascadedShadowGenerator, Logger, NullEngine, Scene, ShadowGenerator } from "@babylonjs/core";
import { LightingRigFactory } from "../../../src/core/lighting/LightingRigFactory";
import type { SceneLightingDescriptor } from "../../../src/core/lighting/LightingTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createScene(): { engine: NullEngine; scene: Scene } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return { engine, scene };
}

function disposeScene(engine: NullEngine, scene: Scene): void {
  scene.dispose();
  engine.dispose();
}

function testCreatesAmbientLight(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: true },
    sun: { enabled: false },
    shadows: { enabled: false }
  });

  assert(rig.getAmbientLight()?.name === "global-ambient-light", "Expected ambient light to be created.");
  assert(scene.getLightByName("global-ambient-light") !== null, "Expected ambient light to be registered in scene.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testCreatesSunLight(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: true },
    shadows: { enabled: false }
  });

  assert(rig.getSunLight()?.name === "global-sun-light", "Expected sun light to be created.");
  assert(scene.getLightByName("global-sun-light") !== null, "Expected sun light to be registered in scene.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testEnabledFalseSkipsLights(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: false },
    shadows: { enabled: false }
  });

  assert(rig.getAmbientLight() === null, "Expected ambient light to be skipped.");
  assert(rig.getSunLight() === null, "Expected sun light to be skipped.");
  assert(scene.lights.length === 0, "Expected scene to have no lights.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testDisposeRemovesLights(): void {
  const { engine, scene } = createScene();
  const descriptor: SceneLightingDescriptor = {
    ambient: { enabled: true },
    sun: { enabled: true },
    shadows: { enabled: false }
  };
  const rig = new LightingRigFactory().create(scene, descriptor);

  assert(scene.lights.length === 2, "Expected two lights before dispose.");
  rig.dispose();
  assert(scene.lights.length === 0, "Expected dispose to remove lights from scene.");
  disposeScene(engine, scene);
}

function testCreatesShadowGeneratorWhenSunEnabled(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: true },
    shadows: { enabled: true, mapSize: 1024 }
  });

  assert(rig.getShadowGenerator() !== null, "Expected shadow generator when shadows and sun are enabled.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testCreatesStandardShadowGeneratorWhenRequested(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: true },
    shadows: { enabled: true, generator: "standard", mapSize: 1024 }
  });

  assert(rig.getShadowGenerator() instanceof ShadowGenerator, "Expected standard shadow generator.");
  assert(!(rig.getShadowGenerator() instanceof CascadedShadowGenerator), "Expected non-cascaded shadow generator.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testCreatesCascadedShadowGeneratorByDefault(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: true },
    shadows: { enabled: true, mapSize: 1024, lambda: 0.7 }
  });

  const generator = rig.getShadowGenerator();
  assert(generator !== null, "Expected shadow generator by default.");
  if (generator instanceof CascadedShadowGenerator) {
    assert(generator.numCascades === 2, "Expected optimized default cascade count.");
    assert(generator.shadowMaxZ === 80, "Expected optimized default shadow distance.");
  } else {
    assert(!CascadedShadowGenerator.IsSupported, "Expected cascaded shadow generator when CSM is supported.");
    assert(generator instanceof ShadowGenerator, "Expected standard shadow generator fallback when CSM is unsupported.");
    assert(!(generator instanceof CascadedShadowGenerator), "Expected non-cascaded fallback when CSM is unsupported.");
  }
  rig.dispose();
  disposeScene(engine, scene);
}

function testConfiguresCascadedShadowTuning(): void {
  if (!CascadedShadowGenerator.IsSupported) {
    return;
  }

  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: true },
    shadows: {
      enabled: true,
      cascadeCount: 3,
      shadowMaxZ: 120,
      freezeShadowCastersBoundingInfo: true
    }
  });
  const generator = rig.getShadowGenerator();

  if (!(generator instanceof CascadedShadowGenerator)) {
    throw new Error("Expected CSM for CSM tuning test.");
  }

  assert(generator.numCascades === 3, "Expected configured cascade count.");
  assert(generator.shadowMaxZ === 120, "Expected configured shadow max distance.");
  assert(generator.freezeShadowCastersBoundingInfo === true, "Expected configured frozen caster bounds.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testSkipsShadowGeneratorWhenSunDisabled(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: false },
    shadows: { enabled: true, mapSize: 1024 }
  });

  assert(rig.getShadowGenerator() === null, "Expected no shadow generator without sun light.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testShadowFilterModeKeepsBabylonFlagsExclusive(): void {
  const { engine, scene } = createScene();
  const rig = new LightingRigFactory().create(scene, {
    ambient: { enabled: false },
    sun: { enabled: true },
    shadows: {
      enabled: true,
      generator: "standard",
      filter: "pcf",
      useBlurExponentialShadowMap: true,
      usePercentageCloserFiltering: false,
      mapSize: 1024
    }
  });

  const generator = rig.getShadowGenerator();
  assert(
    generator?.usePercentageCloserFiltering === true || generator?.usePoissonSampling === true,
    "Expected PCF filter to enable PCF or Babylon's non-WebGL2 fallback."
  );
  assert(generator?.useBlurExponentialShadowMap === false, "Expected PCF filter to disable Blur ESM.");
  assert(generator?.useExponentialShadowMap === false, "Expected PCF filter to disable ESM.");
  rig.dispose();
  disposeScene(engine, scene);
}

function testCascadedShadowGeneratorAvoidsUnsupportedFilterLogs(): void {
  if (!CascadedShadowGenerator.IsSupported) {
    return;
  }

  const messages: string[] = [];
  const originalError = Logger.Error;
  Logger.Error = (message: string | any[]) => {
    messages.push(Array.isArray(message) ? message.join(" ") : String(message));
  };

  const { engine, scene } = createScene();
  try {
    const rig = new LightingRigFactory().create(scene, {
      ambient: { enabled: false },
      sun: { enabled: true },
      shadows: {
        enabled: true,
        filter: "pcf",
        mapSize: 1024
      }
    });

    assert(rig.getShadowGenerator() instanceof CascadedShadowGenerator, "Expected CSM for default shadow generator.");
    assert(
      !messages.some((message) => message.includes("Unsupported filter")),
      "Expected CSM configuration not to log unsupported Babylon shadow filters."
    );
    rig.dispose();
  } finally {
    Logger.Error = originalError;
    disposeScene(engine, scene);
  }
}

function run(): void {
  testCreatesAmbientLight();
  testCreatesSunLight();
  testEnabledFalseSkipsLights();
  testDisposeRemovesLights();
  testCreatesShadowGeneratorWhenSunEnabled();
  testCreatesStandardShadowGeneratorWhenRequested();
  testCreatesCascadedShadowGeneratorByDefault();
  testConfiguresCascadedShadowTuning();
  testSkipsShadowGeneratorWhenSunDisabled();
  testShadowFilterModeKeepsBabylonFlagsExclusive();
  testCascadedShadowGeneratorAvoidsUnsupportedFilterLogs();
}

run();
console.log("LightingRigFactory tests passed");
