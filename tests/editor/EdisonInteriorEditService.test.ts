import { EdisonInteriorEditService } from "../../src/edison/core/EdisonInteriorEditService";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testEnterSortsFloorsAndSelectsFirstStory(): void {
  const service = new EdisonInteriorEditService();
  let changeCount = 0;
  service.onDidChange(() => {
    changeCount += 1;
  });

  service.enterBuilding("building-a", [
    { storyIndex: 2, label: "Floor 3", worldY: 6.2 },
    { storyIndex: 0, label: "Floor 1", worldY: 0 },
    { storyIndex: 1, label: "Floor 2", worldY: 3.1 }
  ]);

  const state = service.getState();
  assert(state?.activeBuildingId === "building-a", "Expected selected building to become active.");
  assert(state.activeStoryIndex === 0, "Expected first sorted story to be active by default.");
  assert(state.floors.map((floor) => floor.storyIndex).join(",") === "0,1,2", "Expected floors to be sorted.");
  assert(changeCount === 1, "Expected enter to emit one change.");
}

function testSelectStoryAndExit(): void {
  const service = new EdisonInteriorEditService();
  const states: Array<number | null> = [];
  service.onDidChange((state) => {
    states.push(state?.activeStoryIndex ?? null);
  });

  service.enterBuilding("building-a", [
    { storyIndex: 0, label: "Floor 1", worldY: 0 },
    { storyIndex: 1, label: "Floor 2", worldY: 3.1 }
  ]);
  service.selectStory(1);
  service.exit();

  assert(states.join(",") === "0,1,", "Expected enter, floor switch, and exit events.");
  assert(service.getState() === null, "Expected exit to clear interior edit state.");
}

function testRejectsMissingFloorsAndUnknownStories(): void {
  const service = new EdisonInteriorEditService();
  let missingFloorsRejected = false;
  try {
    service.enterBuilding("building-a", []);
  } catch {
    missingFloorsRejected = true;
  }

  service.enterBuilding("building-a", [{ storyIndex: 0, label: "Floor 1", worldY: 0 }]);
  let unknownStoryRejected = false;
  try {
    service.selectStory(7);
  } catch {
    unknownStoryRejected = true;
  }

  assert(missingFloorsRejected, "Expected buildings without floors to be rejected.");
  assert(unknownStoryRejected, "Expected unknown stories to be rejected.");
}

function testCanEditOnlyInteriorObjectsOnActiveStory(): void {
  const service = new EdisonInteriorEditService();

  assert(!service.canEditObject(null), "Expected missing objects to be rejected.");
  assert(service.canEditObject({ type: "street", position: [0, 0, 0] }), "Expected inactive mode to allow objects.");

  service.enterBuilding("building-a", [
    { storyIndex: 0, label: "Floor 1", worldY: 0 },
    { storyIndex: 1, label: "Floor 2", worldY: 3 }
  ]);

  assert(service.canEditObject({ type: "interior", interiorBuildingId: "building-a", position: [0, 0.1, 0] }), "Expected active floor interior to be editable.");
  assert(!service.canEditObject({ type: "interior", interiorBuildingId: "building-a", position: [0, 3.1, 0] }), "Expected another floor's interior to be locked.");
  assert(!service.canEditObject({ type: "interior", interiorBuildingId: "building-b", position: [0, 0.1, 0] }), "Expected another building's interior to be locked.");
  assert(!service.canEditObject({ type: "building", position: [0, 0, 0] }), "Expected building shell to be locked.");

  service.selectStory(1);
  assert(service.canEditObject({ type: "interior", interiorBuildingId: "building-a", position: [0, 3.1, 0] }), "Expected selected story's interior to become editable.");
}

testEnterSortsFloorsAndSelectsFirstStory();
testSelectStoryAndExit();
testRejectsMissingFloorsAndUnknownStories();
testCanEditOnlyInteriorObjectsOnActiveStory();
console.log("EdisonInteriorEditService tests passed");
