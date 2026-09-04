import type { ConnectedObjectDefinition } from "./ConnectedObjectResolver";

export const ROAD_CONNECTED_OBJECT_PLACEMENT_Y = 0.05;
export const ROAD_CONNECTED_OBJECT_TERRAIN_HEIGHT = 0;

export const ROAD_CONNECTED_OBJECT_DEFINITION: ConnectedObjectDefinition = {
  id: "asphalt-road",
  label: "Asphalt Road",
  groupId: "road",
  // The supplied road meshes are 10m x 10m tiles in world space.
  tileSize: 10,
  placementY: ROAD_CONNECTED_OBJECT_PLACEMENT_Y,
  terrainFitHeight: ROAD_CONNECTED_OBJECT_TERRAIN_HEIGHT,
  fallbackTopology: "straight",
  variants: [
    {
      topology: "straight",
      // The supplied straight mesh runs west/east at zero rotation.
      canonicalMask: 10,
      asset: "assets/models/connected/road_straight.glb"
    },
    {
      topology: "corner",
      // The zero-rotation GLB connects +Z/+X; the other corner pairs are rotations.
      canonicalMask: 3,
      asset: "assets/models/connected/road_corner_rotated_180.glb"
    },
    {
      topology: "t-junction",
      // The zero-rotation GLB connects +Z/+X/-X; the missing side is -Z.
      canonicalMask: 11,
      asset: "assets/models/connected/road_t_junction.glb"
    },
    {
      topology: "cross",
      canonicalMask: 15,
      asset: "assets/models/connected/road_cross.glb"
    }
  ]
};
