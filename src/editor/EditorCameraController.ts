import { ArcRotateCamera, Camera, Scene, Vector3 } from "@babylonjs/core";
import type { EditorBounds } from "./types";

interface EditorCameraControllerOptions {
  readonly onFrameRequested?: () => void;
}

type DragMode = "orbit" | "pan" | null;

/**
 * Blender-inspired viewport camera controls for editor mode.
 */
export class EditorCameraController {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: ArcRotateCamera;
  private readonly onFrameRequested: (() => void) | null;
  private dragMode: DragMode;
  private activePointerId: number | null;
  private lastPointerX: number;
  private lastPointerY: number;
  private isOrthographic: boolean;
  private readonly onContextMenu: (event: MouseEvent) => void;
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerUp: (event: PointerEvent) => void;
  private readonly onWheel: (event: WheelEvent) => void;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  public constructor(scene: Scene, canvas: HTMLCanvasElement, options: EditorCameraControllerOptions = {}) {
    this.scene = scene;
    this.canvas = canvas;
    this.onFrameRequested = options.onFrameRequested ?? null;
    this.dragMode = null;
    this.activePointerId = null;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.isOrthographic = false;
    this.camera = new ArcRotateCamera("editor-camera", -Math.PI / 4, Math.PI / 3, 28, Vector3.Zero(), scene);
    this.camera.lowerRadiusLimit = 1.5;
    this.camera.upperRadiusLimit = 500;
    this.camera.minZ = 0.05;
    this.camera.wheelPrecision = 1000;
    this.scene.activeCamera = this.camera;

    this.onContextMenu = (event) => {
      event.preventDefault();
    };
    this.onPointerDown = (event) => {
      const nextDragMode = this.resolveDragMode(event);
      if (!nextDragMode) {
        return;
      }

      this.dragMode = nextDragMode;
      this.activePointerId = event.pointerId;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    this.onPointerMove = (event) => {
      if (this.activePointerId !== event.pointerId || !this.dragMode) {
        return;
      }

      const deltaX = event.clientX - this.lastPointerX;
      const deltaY = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;

      if (this.dragMode === "orbit") {
        this.camera.alpha -= deltaX * 0.01;
        this.camera.beta = this.clamp(this.camera.beta - deltaY * 0.01, 0.05, Math.PI - 0.05);
      } else {
        this.pan(deltaX, deltaY);
      }

      event.preventDefault();
    };
    this.onPointerUp = (event) => {
      if (this.activePointerId !== event.pointerId) {
        return;
      }

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.dragMode = null;
      this.activePointerId = null;
    };
    this.onWheel = (event) => {
      const zoomFactor = event.deltaY > 0 ? 1.12 : 0.88;
      this.camera.radius = this.clamp(
        this.camera.radius * zoomFactor,
        this.camera.lowerRadiusLimit ?? 1.5,
        this.camera.upperRadiusLimit ?? 500
      );
      if (this.isOrthographic) {
        this.updateOrthographicExtents();
      }
      event.preventDefault();
    };
    this.onKeyDown = (event) => {
      switch (event.code) {
        case "Numpad1":
          this.setView(new Vector3(0, 0, -1));
          event.preventDefault();
          break;
        case "Numpad3":
          this.setView(new Vector3(-1, 0, 0));
          event.preventDefault();
          break;
        case "Numpad7":
          this.setView(new Vector3(0, 1, 0));
          event.preventDefault();
          break;
        case "Numpad5":
          this.toggleProjectionMode();
          event.preventDefault();
          break;
        case "Home":
          this.onFrameRequested?.();
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
  }

  public getCamera(): ArcRotateCamera {
    return this.camera;
  }

  public frameBounds(bounds: EditorBounds): void {
    const size = bounds.max.subtract(bounds.min);
    if (![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)) {
      return;
    }

    if (size.lengthSquared() <= Number.EPSILON || size.y > 200 || size.x > 10000 || size.z > 10000) {
      return;
    }

    const center = bounds.min.add(bounds.max).scale(0.5);
    const dominantSize = Math.max(size.x, size.y, size.z, 6);
    this.camera.target.copyFrom(center);
    this.camera.radius = this.clamp(dominantSize * 1.6, this.camera.lowerRadiusLimit ?? 1.5, this.camera.upperRadiusLimit ?? 500);
    if (this.isOrthographic) {
      this.updateOrthographicExtents();
    }
  }

  public getCameraStatus(): { position: Vector3; target: Vector3; mode: "perspective" | "orthographic" } {
    return {
      position: this.camera.position.clone(),
      target: this.camera.target.clone(),
      mode: this.isOrthographic ? "orthographic" : "perspective"
    };
  }

  public dispose(): void {
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    this.camera.dispose();
  }

  private resolveDragMode(event: PointerEvent): DragMode {
    if (event.button === 1) {
      return event.shiftKey ? "pan" : "orbit";
    }

    if (event.button === 2 || (event.button === 0 && event.altKey)) {
      return "orbit";
    }

    return null;
  }

  private pan(deltaX: number, deltaY: number): void {
    const right = this.camera.getDirection(Vector3.Right());
    const up = this.camera.getDirection(Vector3.Up());
    const speed = Math.max(this.camera.radius * 0.0025, 0.02);
    const offset = right.scale(-deltaX * speed).add(up.scale(deltaY * speed));
    this.camera.target.addInPlace(offset);
  }

  private setView(direction: Vector3): void {
    const normalizedDirection = direction.normalize();
    const radius = this.camera.radius;
    this.camera.position = this.camera.target.subtract(normalizedDirection.scale(radius));
    this.camera.rebuildAnglesAndRadius();
    if (this.isOrthographic) {
      this.updateOrthographicExtents();
    }
  }

  private toggleProjectionMode(): void {
    this.isOrthographic = !this.isOrthographic;
    this.camera.mode = this.isOrthographic ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
    if (this.isOrthographic) {
      this.updateOrthographicExtents();
      return;
    }

    this.camera.orthoLeft = null;
    this.camera.orthoRight = null;
    this.camera.orthoTop = null;
    this.camera.orthoBottom = null;
  }

  private updateOrthographicExtents(): void {
    const halfHeight = Math.max(this.camera.radius * 0.65, 2);
    const aspectRatio = this.scene.getEngine().getAspectRatio(this.camera);
    const halfWidth = halfHeight * aspectRatio;
    this.camera.orthoLeft = -halfWidth;
    this.camera.orthoRight = halfWidth;
    this.camera.orthoTop = halfHeight;
    this.camera.orthoBottom = -halfHeight;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
