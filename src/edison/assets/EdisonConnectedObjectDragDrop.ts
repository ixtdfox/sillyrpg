const CONNECTED_OBJECT_DRAG_MIME = "application/x-sillyrpg-edison-connected-object";

interface ConnectedObjectDragPayload {
  readonly presetId: string;
}

export function writeEdisonConnectedObjectDragData(dataTransfer: DataTransfer, presetId: string): void {
  dataTransfer.setData(CONNECTED_OBJECT_DRAG_MIME, JSON.stringify({ presetId } satisfies ConnectedObjectDragPayload));
  dataTransfer.effectAllowed = "copy";
}

export function readEdisonConnectedObjectDragData(dataTransfer: DataTransfer | null): ConnectedObjectDragPayload | null {
  if (!dataTransfer) {
    return null;
  }

  const raw = dataTransfer.getData(CONNECTED_OBJECT_DRAG_MIME);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConnectedObjectDragPayload>;
    return typeof parsed.presetId === "string" && parsed.presetId.length > 0
      ? { presetId: parsed.presetId }
      : null;
  } catch {
    return null;
  }
}
