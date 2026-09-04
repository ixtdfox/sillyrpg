import { EdisonPlacementService, type EdisonPlacementAsset } from "../../src/edison/core/EdisonPlacementService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const asset: EdisonPlacementAsset = {
  id: "model-a",
  title: "Model A",
  modelPath: "assets/models/model-a.glb",
  objectType: "model",
  gridSize: 1
};

const service = new EdisonPlacementService();
let changeCount = 0;
service.onDidChange(() => {
  changeCount += 1;
});

service.toggle(asset);
assert(service.getSelectedAsset() === asset, "Expected toggle to select an unselected asset.");
assert(changeCount === 1, "Expected selecting an asset to emit one change.");

service.toggle(asset);
assert(service.getSelectedAsset() === null, "Expected toggling the selected asset to clear placement.");
assert(changeCount === 2, "Expected clearing placement to emit one change.");

console.log("EdisonPlacementService tests passed");
