/**
 * Небольшой state object для видимости debug-сетки.
 *
 * Объект отделяет состояние UI/debug режима от RectGridRuntime, чтобы кнопки,
 * overlay и runtime могли работать через один явный контракт.
 */
export class GridDebugState {
  private isDebugEnabled: boolean;

  /**
   * Создает состояние с заданным начальным значением.
   */
  public constructor(initialValue = false) {
    this.isDebugEnabled = initialValue;
  }

  /**
   * Возвращает текущую видимость debug-слоя.
   */
  public getIsDebugEnabled(): boolean {
    return this.isDebugEnabled;
  }

  /**
   * Инвертирует состояние и возвращает новое значение для немедленной синхронизации UI.
   */
  public toggle(): boolean {
    this.isDebugEnabled = !this.isDebugEnabled;
    return this.isDebugEnabled;
  }
}
