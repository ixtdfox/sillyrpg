import { ROAD_CONNECTED_OBJECT_DEFINITION } from "../connected/ConnectedObjectDefinitions";
import type { EdisonPlugin, EdisonPluginContext } from "./EdisonPlugin";
import type { EdisonPluginManifest } from "./EdisonPluginManifest";

export class ConnectedObjectsPlugin implements EdisonPlugin {
  public readonly manifest: EdisonPluginManifest = {
    id: "edison.connected-objects",
    name: "Connected Objects",
    version: "0.1.0",
    author: "SillyRPG",
    description: "Generic topology-based connected object placement and resolution.",
    entry: "builtin",
    edisonApiVersion: "1"
  };

  private readonly disposers: Array<() => void> = [];

  public activate(context: EdisonPluginContext): void {
    this.disposers.push(
      context.connectedObjects.registerDefinition(ROAD_CONNECTED_OBJECT_DEFINITION)
    );
  }

  public deactivate(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
  }
}
