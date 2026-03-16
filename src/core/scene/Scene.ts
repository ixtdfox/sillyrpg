/**
 * Defines the common contract that every game scene must implement.
 * Implementations are responsible for creating Babylon scene content
 * and handling abstract string-based input commands.
 */
export interface Scene {
  /**
   * Creates and returns the Babylon scene instance for this scene.
   *
   * @returns A Babylon Scene instance, synchronously or asynchronously.
   */
  createScene(): Promise<import("@babylonjs/core").Scene> | import("@babylonjs/core").Scene;

  /**
   * Handles a high-level input command for scene behavior.
   *
   * @param input - Command string describing an action to execute.
   * @returns No return value.
   */
  processInput(input: string): void;
}
