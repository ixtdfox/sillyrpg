import { Button, Control, TextBlock } from "@babylonjs/gui";

/**
 * Графический GUI-контрол переключения debug-сетки.
 *
 * Класс инкапсулирует Babylon GUI Button и оставляет внешнему HUD только два
 * действия: получить root Control и обновить визуальное состояние.
 */
export class GridDebugToggleControl {
  private readonly toggleButton: Button;

  /**
   * Создает переиспользуемую кнопку debug grid.
   *
   * @param onToggleRequested - Callback, который вызывается при клике.
   */
  public constructor(onToggleRequested: () => void) {
    this.toggleButton = Button.CreateSimpleButton("toggle-grid-debug", "On/Off Grid Debug");
    this.toggleButton.height = "38px";
    this.toggleButton.width = "220px";
    this.toggleButton.cornerRadius = 4;
    this.toggleButton.color = "#91A3C8";
    this.toggleButton.background = "#1F2937";
    this.toggleButton.thickness = 1;
    this.toggleButton.onPointerUpObservable.add(onToggleRequested);

    const text = this.toggleButton.children[0] as TextBlock;
    text.fontSize = 18;
    text.color = "#E7EDF9";
  }

  /**
   * Возвращает root GUI control для встраивания в HUD.
   */
  public getControl(): Control {
    return this.toggleButton;
  }

  /**
   * Обновляет визуальный стиль под текущее состояние debug-сетки.
   */
  public setDebugEnabled(isEnabled: boolean): void {
    this.toggleButton.background = isEnabled ? "#304D2C" : "#1F2937";
    this.toggleButton.color = isEnabled ? "#A8E6A3" : "#91A3C8";
  }
}
