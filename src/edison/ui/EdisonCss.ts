import "./assets/edison.css";

const EDISON_STYLE_ID = "edison-editor-css";

export function ensureEdisonCss(): void {
  if (document.getElementById(EDISON_STYLE_ID)) {
    return;
  }
}
