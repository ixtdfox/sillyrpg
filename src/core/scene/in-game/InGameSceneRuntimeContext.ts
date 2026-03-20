import type { Scene as BabylonScene } from "@babylonjs/core";
import type { HexGridRuntime } from "../../hex/HexGridRuntime";
import type { InGameTopPanelUi } from "./ui/InGameTopPanelUi";

/**
 * Runtime context published by in-game scenes for ECS systems.
 */
export interface InGameSceneRuntimeContext {
  readonly hexGridRuntime: HexGridRuntime;
  readonly topPanelUi: InGameTopPanelUi;
}

/**
 * Attaches in-game runtime context to Babylon scene metadata.
 */
export function attachInGameSceneRuntimeContext(
  scene: BabylonScene,
  context: InGameSceneRuntimeContext
): void {
  const metadata = (scene.metadata ?? {}) as Record<string, unknown>;
  metadata.inGameRuntimeContext = context;
  scene.metadata = metadata;
}

/**
 * Resolves in-game runtime context from Babylon scene metadata.
 */
export function getInGameSceneRuntimeContext(scene: BabylonScene): InGameSceneRuntimeContext | null {
  const metadata = scene.metadata as { inGameRuntimeContext?: InGameSceneRuntimeContext } | null | undefined;
  return metadata?.inGameRuntimeContext ?? null;
}
