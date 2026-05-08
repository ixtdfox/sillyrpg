import { GroundAttachmentComponent } from "../../../src/core/entity/components/GroundAttachmentComponent";
import { EntityPrefabFactory, type PrefabDefinition } from "../../../src/core/entity/EntityPrefabFactory";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testParsesGroundAttachmentComponent(): Promise<void> {
  const factory = new EntityPrefabFactory();
  const prefabs = new Map<string, PrefabDefinition>([
    [
      "test-grounded",
      {
        id: "test-grounded",
        extendsId: null,
        components: [
          { type: "identity", data: { name: "Tester", archetype: "human" } },
          { type: "model", data: { assetPath: "assets/character.glb" } },
          { type: "vitals", data: { hp: { current: 1, max: 1 }, energy: { current: 1, max: 1 }, carryCapacityWeight: 1 } },
          { type: "relations", data: { relationships: {} } },
          { type: "transform", data: { position: { x: 0, y: 0, z: 0 } } },
          { type: "spawn", data: { position: { x: 0, y: 0, z: 0 } } },
          { type: "gridPathMovement", data: { speed: 3 } },
          { type: "groundAttachment", data: { footOffset: 0.25, mode: "smooth", maxSnapDistance: 3, allowDuringMovement: false } },
          { type: "detectable", data: { kind: "tester" } },
          { type: "combatStats", data: { initiative: 1, apPerTurn: 1, mpPerTurn: 1, armor: 0 } }
        ]
      }
    ]
  ]);
  (factory as unknown as { prefabs: Map<string, PrefabDefinition> }).prefabs = prefabs;

  const entity = await factory.instantiate("test-grounded");
  const component = entity.getComponent(GroundAttachmentComponent);

  assert(component.footOffset === 0.25, "Expected prefab parser to keep footOffset");
  assert(component.mode === "smooth", "Expected prefab parser to keep mode");
  assert(component.maxSnapDistance === 3, "Expected prefab parser to keep maxSnapDistance");
  assert(component.allowDuringMovement === false, "Expected prefab parser to keep allowDuringMovement");
}

Promise.resolve(testParsesGroundAttachmentComponent()).then(() => {
  console.log("EntityPrefabFactory tests passed");
});
