import type { EdisonModelAssetOption } from "./EdisonModelAssetCatalog";

export const EDISON_MODEL_ASSET_DRAG_TYPE = "application/x-edison-model-asset";

export interface EdisonModelAssetDragPayload {
  readonly id: string;
  readonly title: string;
  readonly modelPath: string;
  readonly category: string;
  readonly objectType: string;
}

export function createEdisonModelAssetDragPayload(model: EdisonModelAssetOption): EdisonModelAssetDragPayload {
  return {
    id: model.id,
    title: model.title,
    modelPath: model.rawModelPath,
    category: model.category,
    objectType: model.objectType
  };
}

export function writeEdisonModelAssetDragData(dataTransfer: DataTransfer, model: EdisonModelAssetOption): void {
  const payload = createEdisonModelAssetDragPayload(model);
  dataTransfer.setData(EDISON_MODEL_ASSET_DRAG_TYPE, JSON.stringify(payload));
  dataTransfer.setData("text/plain", model.rawModelPath);
  dataTransfer.effectAllowed = "copy";
}

export function readEdisonModelAssetDragData(dataTransfer: DataTransfer | null): EdisonModelAssetDragPayload | null {
  if (!dataTransfer || !dataTransfer.types.includes(EDISON_MODEL_ASSET_DRAG_TYPE)) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataTransfer.getData(EDISON_MODEL_ASSET_DRAG_TYPE)) as Partial<EdisonModelAssetDragPayload>;
    if (
      !parsed.id ||
      !parsed.title ||
      !parsed.modelPath ||
      !parsed.category ||
      !parsed.objectType
    ) {
      return null;
    }

    return {
      id: parsed.id,
      title: parsed.title,
      modelPath: parsed.modelPath,
      category: parsed.category,
      objectType: parsed.objectType
    };
  } catch {
    return null;
  }
}
