import { ArcRotateCamera, Camera, Vector3, type Scene } from "@babylonjs/core";

export interface EdisonBounds {
  readonly min: Vector3;
  readonly max: Vector3;
}

type EdisonCameraDragMode = "orbit" | "pan" | null;

export class EditorCameraTool {
  private readonly camera: ArcRotateCamera;
  private dragMode: EdisonCameraDragMode = null;
  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private orthographic = false;

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const dragMode = this.resolveDragMode(event);
    if (!dragMode) {
      return;
    }

    this.dragMode = dragMode;
    this.activePointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
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

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    this.activePointerId = null;
    this.dragMode = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    const zoomFactor = event.deltaY > 0 ? 1.12 : 0.88;
    this.camera.radius = this.clamp(
      this.camera.radius * zoomFactor,
      this.camera.lowerRadiusLimit ?? 1.5,
      this.camera.upperRadiusLimit ?? 500
    );
    if (this.orthographic) {
      this.updateOrthographicExtents();
    }
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Home") {
      this.onFrameRequested();
      event.preventDefault();
      return;
    }

    if (event.code === "Numpad5") {
      this.toggleProjectionMode();
      event.preventDefault();
    }
  };

  public constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly onFrameRequested: () => void
  ) {
    this.camera = new ArcRotateCamera("edison-camera", -Math.PI / 4, Math.PI / 3, 32, Vector3.Zero(), scene);
    this.camera.lowerRadiusLimit = 1.5;
    this.camera.upperRadiusLimit = 600;
    this.camera.minZ = 0.05;
    this.camera.wheelPrecision = 1000;
    this.scene.activeCamera = this.camera;

    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  public getCamera(): ArcRotateCamera {
    return this.camera;
  }

  public frameBounds(bounds: EdisonBounds): void {
    const size = bounds.max.subtract(bounds.min);
    if (![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)) {
      return;
    }

    const center = bounds.min.add(bounds.max).scale(0.5);
    const dominantSize = Math.max(size.x, size.y, size.z, 6);
    this.camera.target.copyFrom(center);
    this.camera.radius = this.clamp(dominantSize * 1.65, this.camera.lowerRadiusLimit ?? 1.5, this.camera.upperRadiusLimit ?? 600);
    if (this.orthographic) {
      this.updateOrthographicExtents();
    }
  }

  public dispose(): void {
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.camera.dispose();
  }

  private resolveDragMode(event: PointerEvent): EdisonCameraDragMode {
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
    this.camera.target.addInPlace(right.scale(-deltaX * speed).add(up.scale(deltaY * speed)));
  }

  private toggleProjectionMode(): void {
    this.orthographic = !this.orthographic;
    this.camera.mode = this.orthographic ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
    if (this.orthographic) {
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
    return Math.min(max, Math.max(min, value));
  }
}
