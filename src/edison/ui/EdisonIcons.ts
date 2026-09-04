import deleteIcon from "../../../assets/edison/icons/delete.svg?raw";
import connectedIcon from "../../../assets/edison/icons/connected.svg?raw";
import moveIcon from "../../../assets/edison/icons/move.svg?raw";
import rotateIcon from "../../../assets/edison/icons/rotate.svg?raw";
import selectIcon from "../../../assets/edison/icons/select.svg?raw";

const ICONS: Record<string, string> = {
  back: "Back",
  save: "Save",
  export: "Export",
  reload: "Reload",
  undo: "Undo",
  redo: "Redo",
  frame: "Fit",
  fit: "Fit",
  grid: "Grid",
  axes: "Axes",
  settings: "Settings",
  plugins: "Plugins",
  select: "Select",
  move: "Move",
  rotate: "Rotate",
  delete: "Delete",
  terrain: "Terrain",
  brush: "Brush"
};

export function getEdisonIcon(icon: string | undefined, fallback: string): string {
  if (!icon) {
    return fallback;
  }

  return ICONS[icon] ?? fallback;
}

const SVG_ICONS: Record<string, string> = {
  delete: deleteIcon,
  connected: connectedIcon,
  move: moveIcon,
  rotate: rotateIcon,
  select: selectIcon
};

export function getEdisonSvgIcon(icon: string | undefined): string | null {
  if (!icon) {
    return null;
  }

  return SVG_ICONS[icon] ?? null;
}
