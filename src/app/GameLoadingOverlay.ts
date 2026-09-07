import type {
  LoadingProgressPresenter,
  LoadingProgressUpdate
} from "../core/game/LoadingProgress";

export class GameLoadingOverlay implements LoadingProgressPresenter {
  private readonly root: HTMLDivElement;
  private readonly heading: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly percent: HTMLSpanElement;
  private readonly progressTrack: HTMLDivElement;
  private readonly progressBar: HTMLDivElement;
  private hideTimer: number | null = null;
  private progress = 0;

  public constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "game-loading-overlay";
    this.root.setAttribute("aria-hidden", "true");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "10000",
      display: "grid",
      placeItems: "center",
      boxSizing: "border-box",
      padding: "20px",
      color: "#f5f0e6",
      background: "radial-gradient(circle at 50% 38%, rgba(34, 48, 57, 0.96) 0%, rgba(9, 13, 18, 0.985) 58%, #05070a 100%)",
      fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      opacity: "0",
      visibility: "hidden",
      pointerEvents: "none",
      transition: "opacity 180ms ease"
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(560px, calc(100vw - 40px))",
      padding: "28px 30px 26px",
      boxSizing: "border-box",
      border: "1px solid rgba(246, 200, 95, 0.32)",
      borderRadius: "3px",
      background: "linear-gradient(145deg, rgba(20, 27, 32, 0.94), rgba(9, 13, 17, 0.94))",
      boxShadow: "0 28px 80px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.04)"
    });

    const eyebrow = document.createElement("div");
    eyebrow.textContent = "WORLD ASSEMBLY / 01";
    Object.assign(eyebrow.style, {
      marginBottom: "9px",
      color: "#a9b1ad",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "11px",
      letterSpacing: "0.18em"
    });

    this.heading = document.createElement("div");
    this.heading.textContent = "LOADING WORLD";
    Object.assign(this.heading.style, {
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: "clamp(25px, 5vw, 38px)",
      letterSpacing: "0.04em",
      lineHeight: "1",
      color: "#f6c85f"
    });

    const rule = document.createElement("div");
    Object.assign(rule.style, {
      width: "46px",
      height: "2px",
      margin: "17px 0 18px",
      background: "#f6c85f",
      boxShadow: "54px 0 0 rgba(246, 200, 95, 0.25)"
    });

    const statusRow = document.createElement("div");
    Object.assign(statusRow.style, {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "18px",
      marginBottom: "11px"
    });

    this.message = document.createElement("div");
    this.message.setAttribute("aria-live", "polite");
    Object.assign(this.message.style, {
      minWidth: "0",
      color: "#d7ddd9",
      fontSize: "14px",
      lineHeight: "1.4"
    });

    this.percent = document.createElement("span");
    Object.assign(this.percent.style, {
      flex: "0 0 auto",
      color: "#f5f0e6",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "13px",
      fontVariantNumeric: "tabular-nums"
    });

    this.progressTrack = document.createElement("div");
    this.progressTrack.setAttribute("role", "progressbar");
    this.progressTrack.setAttribute("aria-valuemin", "0");
    this.progressTrack.setAttribute("aria-valuemax", "100");
    Object.assign(this.progressTrack.style, {
      position: "relative",
      height: "8px",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      background: "rgba(0, 0, 0, 0.34)"
    });

    this.progressBar = document.createElement("div");
    Object.assign(this.progressBar.style, {
      width: "100%",
      height: "100%",
      transform: "scaleX(0)",
      transformOrigin: "left center",
      background: "linear-gradient(90deg, #bd7d2d, #f6c85f 72%, #fff0a3)",
      boxShadow: "0 0 18px rgba(246, 200, 95, 0.38)",
      transition: "transform 160ms ease-out"
    });

    const footer = document.createElement("div");
    footer.textContent = "PREPARING TERRAIN  ·  STRUCTURES  ·  NAVIGATION";
    Object.assign(footer.style, {
      marginTop: "13px",
      color: "#707b79",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "10px",
      letterSpacing: "0.08em"
    });

    statusRow.append(this.message, this.percent);
    this.progressTrack.append(this.progressBar);
    card.append(eyebrow, this.heading, rule, statusRow, this.progressTrack, footer);
    this.root.append(card);
    this.root.addEventListener("transitionend", () => {
      if (this.root.style.opacity === "0") {
        this.root.style.visibility = "hidden";
      }
    });
    parent.append(this.root);
  }

  public begin(message: string): void {
    this.clearHideTimer();
    this.progress = 0;
    this.heading.textContent = "LOADING WORLD";
    this.heading.style.color = "#f6c85f";
    this.progressBar.style.background = "linear-gradient(90deg, #bd7d2d, #f6c85f 72%, #fff0a3)";
    this.progressBar.style.transition = "none";
    this.progressBar.style.transform = "scaleX(0)";
    void this.progressBar.offsetWidth;
    this.progressBar.style.transition = "transform 160ms ease-out";
    this.root.style.visibility = "visible";
    this.root.style.pointerEvents = "auto";
    this.root.style.opacity = "1";
    this.root.setAttribute("aria-hidden", "false");
    this.setProgress({ progress: 0, message });
  }

  public report(update: LoadingProgressUpdate): void {
    this.setProgress(update);
  }

  public complete(message = "World ready"): void {
    this.setProgress({ progress: 1, message });
    this.clearHideTimer();
    this.hideTimer = window.setTimeout(() => {
      this.root.style.opacity = "0";
      this.root.style.pointerEvents = "none";
      this.root.setAttribute("aria-hidden", "true");
      this.hideTimer = null;
    }, 160);
  }

  public fail(message: string): void {
    this.clearHideTimer();
    this.heading.textContent = "LOAD FAILED";
    this.heading.style.color = "#ef8b73";
    this.progressBar.style.background = "#b94d3f";
    this.message.textContent = message;
    this.percent.textContent = "ERROR";
    this.root.style.visibility = "visible";
    this.root.style.opacity = "1";
    this.root.style.pointerEvents = "auto";
    this.root.setAttribute("aria-hidden", "false");
  }

  public dispose(): void {
    this.clearHideTimer();
    this.root.remove();
  }

  private setProgress(update: LoadingProgressUpdate): void {
    const nextProgress = Math.max(0, Math.min(1, update.progress));
    this.progress = Math.max(this.progress, nextProgress);
    const percent = Math.round(this.progress * 100);
    this.message.textContent = update.message;
    this.percent.textContent = `${percent}%`;
    this.progressTrack.setAttribute("aria-valuenow", String(percent));
    this.progressTrack.setAttribute("aria-valuetext", update.message);
    this.progressBar.style.transform = `scaleX(${this.progress})`;
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
