import edisonCss from "../../../assets/edison/edison.css?raw";

const EDISON_STYLE_ID = "edison-editor-css";

export function ensureEdisonCss(): void {
  if (document.getElementById(EDISON_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = EDISON_STYLE_ID;
  style.textContent = edisonCss;
  document.head.appendChild(style);
}
