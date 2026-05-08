export type EditorIconName =
  | "select"
  | "move"
  | "rotateLeft"
  | "rotateRight"
  | "delete"
  | "save"
  | "export"
  | "reload"
  | "frame"
  | "grid"
  | "axes"
  | "camera"
  | "settings"
  | "terrain"
  | "search"
  | "scene"
  | "building"
  | "inspector"
  | "undo"
  | "redo"
  | "back"
  | "random"
  | "flatten"
  | "palette"
  | "chevronDown"
  | "terrainRaise"
  | "terrainLower"
  | "terrainSmooth"
  | "terrainFlatten"
  | "terrainFlattenToHeight"
  | "terrainBrushCircle"
  | "terrainBrushSquare"
  | "terrainFlattenAll"
  | "terrainClearEdits";

const ICON_PATHS: Record<EditorIconName, string> = {
  select:
    '<path d="M6 4l12 8-5 1 2.5 5-2.5 1-2.5-5-4 4z" />',
  move:
    '<path d="M12 3l2.25 2.25L13 6.5v4h4l1.25-1.25L21 12l-2.75 2.75L17 13.5h-4v4l1.25 1.25L12 21l-2.25-2.25L11 17.5v-4H7l-1.25 1.25L3 12l2.75-2.75L7 10.5h4v-4L9.75 5.25z" />',
  rotateLeft:
    '<path d="M8 8H4V4" /><path d="M4 8a8 8 0 1 1-1 6" /><path d="M12 8v4l3 2" />',
  rotateRight:
    '<path d="M16 8h4V4" /><path d="M20 8a8 8 0 1 0 1 6" /><path d="M12 8v4l3 2" />',
  delete:
    '<path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M7 7l1 13h8l1-13" /><path d="M10 11v5" /><path d="M14 11v5" />',
  save:
    '<path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h8V4" /><path d="M9 20v-6h6v6" />',
  export:
    '<path d="M12 4v10" /><path d="M8.5 7.5L12 4l3.5 3.5" /><path d="M5 14v5h14v-5" />',
  reload:
    '<path d="M20 11a8 8 0 0 0-14.5-4" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.5 4" /><path d="M20 20v-5h-5" />',
  frame:
    '<path d="M9 4H5v4" /><path d="M15 4h4v4" /><path d="M19 15v4h-4" /><path d="M5 15v4h4" /><path d="M9 9h6v6H9z" />',
  grid:
    '<path d="M4 9h16" /><path d="M4 15h16" /><path d="M9 4v16" /><path d="M15 4v16" /><path d="M4 4h16v16H4z" />',
  axes:
    '<path d="M12 19V6" /><path d="M12 6l-2 2" /><path d="M12 6l2 2" /><path d="M12 19l6-3" /><path d="M18 16l-2-.25" /><path d="M18 16l-1 1.75" /><path d="M12 19l-6-3" /><path d="M6 16l2-.25" /><path d="M6 16l1 1.75" />',
  camera:
    '<path d="M4 8h3l2-2h6l2 2h3v10H4z" /><circle cx="12" cy="13" r="3" />',
  settings:
    '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />',
  terrain:
    '<path d="M4 16l4-5 4 3 4-6 4 8H4z" /><path d="M4 19h16" />',
  search:
    '<circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" />',
  scene:
    '<path d="M4 6l8-3 8 3-8 3z" /><path d="M4 6v6l8 3 8-3V6" /><path d="M4 12v6l8 3 8-3v-6" />',
  building:
    '<path d="M5 20V6l4-2 4 2v14" /><path d="M13 20V10l3-1.5L19 10v10" /><path d="M8 9h2" /><path d="M8 13h2" /><path d="M15 13h2" />',
  inspector:
    '<circle cx="12" cy="8" r="3" /><path d="M6 20a6 6 0 0 1 12 0" /><path d="M4 4h4" /><path d="M16 4h4" />',
  undo:
    '<path d="M9 7H4v5" /><path d="M4 12a8 8 0 1 1 2.3 5.7" />',
  redo:
    '<path d="M15 7h5v5" /><path d="M20 12a8 8 0 1 0-2.3 5.7" />',
  back:
    '<path d="M10 6l-6 6 6 6" /><path d="M4 12h16" />',
  random:
    '<path d="M16 4h4v4" /><path d="M4 18h4v-4" /><path d="M20 4l-6 6" /><path d="M4 6h5l4 4" /><path d="M11 14l-2 2H4" /><path d="M14 14l6 6" />',
  flatten:
    '<path d="M4 16h16" /><path d="M6 12l3-2 3 1 4-3 2 2" /><path d="M4 19h16" />',
  palette:
    '<path d="M12 4a8 8 0 1 0 0 16h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a3 3 0 0 0 3-3 5 5 0 0 0-8-5z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="10" cy="8.5" r="1" /><circle cx="14" cy="8.5" r="1" />',
  chevronDown:
    '<path d="M6 9l6 6 6-6" />',
  terrainRaise:
    '<path d="M4 17l4-4 3 2 5-6 4 8" /><path d="M12 6v7" /><path d="M9.5 8.5L12 6l2.5 2.5" />',
  terrainLower:
    '<path d="M4 17l4-4 3 2 5-6 4 8" /><path d="M12 6v7" /><path d="M9.5 10.5L12 13l2.5-2.5" />',
  terrainSmooth:
    '<path d="M4 15c2-2 4-2 6 0s4 2 6 0 4-2 4-2" /><path d="M4 18h16" />',
  terrainFlatten:
    '<path d="M4 16l4-3 3 1 4-3 5 2" /><path d="M4 19h16" /><path d="M10 8h8" />',
  terrainFlattenToHeight:
    '<path d="M5 18h14" /><path d="M7 6v12" /><path d="M7 9h3" /><path d="M10 12h7" />',
  terrainBrushCircle:
    '<circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.2" />',
  terrainBrushSquare:
    '<path d="M6 6h12v12H6z" /><circle cx="12" cy="12" r="1.2" />',
  terrainFlattenAll:
    '<path d="M4 18h16" /><path d="M4 13h16" /><path d="M6 9h12" />',
  terrainClearEdits:
    '<path d="M4 17l4-4 3 2 5-6 4 8" /><path d="M7 7l10 10" /><path d="M17 7L7 17" />'
};

export function editorIconSvg(name: EditorIconName, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}
