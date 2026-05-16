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

export function getEdisonSvgIcon(icon: string | undefined): string | null {
  switch (icon) {
    case "select":
      return svg("0 0 24 24", '<path d="M5 3l11 10-5 1.1 3.2 6-2.8 1.5-3.1-5.9L5 19V3z" fill="currentColor"/>');
    case "move":
      return svg(
        "0 0 24 24",
        '<path d="M12 2l3.6 3.6-2.4 0v4.2h4.2V7.4L21 11l-3.6 3.6v-2.4h-4.2v4.2h2.4L12 22l-3.6-3.6h2.4v-4.2H6.6v2.4L3 13l3.6-3.6v2.4h4.2V7.6H8.4L12 2z" fill="currentColor"/>'
      );
    case "rotate":
      return svg(
        "0 0 24 24",
        '<path d="M12 4a8 8 0 0 1 7.5 5.2l-2.1.8A5.8 5.8 0 1 0 18 14h-2.7L20 19l4.7-5h-2.4A10.1 10.1 0 1 1 12 4z" fill="currentColor"/>'
      );
    case "delete":
      return svg(
        "0 0 24 24",
        '<path d="M8 5V3h8v2h5v2H3V5h5zm1 4h2v9H9V9zm4 0h2v9h-2V9zm-7 0h12l-.8 12H6.8L6 9z" fill="currentColor"/>'
      );
    default:
      return null;
  }
}

function svg(viewBox: string, body: string): string {
  return `<svg class="edison-svg-icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
}
