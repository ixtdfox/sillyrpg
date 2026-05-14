import { Color3, MeshBuilder, TransformNode, Vector3, type LinesMesh, type Scene } from "@babylonjs/core";
import type { TerrainBrushShape } from "../editing/TerrainBrushTypes";

export class EditorTerrainBrushPreview {
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private outline: LinesMesh | null = null;
  private currentShape: TerrainBrushShape | null = null;
  private currentPointCount = 0;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode("editor-terrain-brush-preview-root", scene);
    this.root.metadata = {
      editorSelectable: false,
      editorTerrainPreview: true,
      gameHelper: true
    };
    this.root.setEnabled(false);
  }

  public show(shape: TerrainBrushShape, radius: number, worldPoint: Vector3, color = "#F7C948"): void {
    const points = shape === "square" ? buildSquarePoints(radius) : buildCirclePoints(radius, 32);
    const needsRebuild = !this.outline || this.currentShape !== shape || this.currentPointCount !== points.length;
    if (needsRebuild) {
      this.outline?.dispose();
      this.outline = MeshBuilder.CreateLines("editor-terrain-brush-preview", { points, updatable: true }, this.scene);
      this.outline.isPickable = false;
      this.outline.alwaysSelectAsActiveMesh = true;
      this.outline.metadata = {
        editorSelectable: false,
        editorTerrainPreview: true,
        gameHelper: true
      };
      this.outline.parent = this.root;
      this.currentShape = shape;
      this.currentPointCount = points.length;
    } else if (this.outline) {
      this.outline = MeshBuilder.CreateLines(
        "editor-terrain-brush-preview",
        { points, instance: this.outline }
      );
    }

    if (this.outline) {
      this.outline.color = Color3.FromHexString(color);
    }
    this.root.position.copyFrom(worldPoint);
    this.root.position.y += 0.03;
    this.root.setEnabled(true);
  }

  public hide(): void {
    this.root.setEnabled(false);
  }

  public dispose(): void {
    this.outline?.dispose();
    this.root.dispose();
  }
}

function buildCirclePoints(radius: number, segments: number): Vector3[] {
  const points: Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

function buildSquarePoints(radius: number): Vector3[] {
  return [
    new Vector3(-radius, 0, -radius),
    new Vector3(radius, 0, -radius),
    new Vector3(radius, 0, radius),
    new Vector3(-radius, 0, radius),
    new Vector3(-radius, 0, -radius)
  ];
}
