/**
 * Объект-значение одной логической клетки тактической сетки.
 *
 * Класс специально неизменяемый: координаты X/Z становятся частью идентичности
 * клетки, поэтому сравнение, ключи Map/Set и расчеты пути не зависят от
 * случайной мутации объекта после передачи между системами.
 */
export class GridCell {
  public readonly x: number;
  public readonly z: number;

  /**
   * Создает клетку в координатах сетки, а не в мировых Babylon-координатах.
   */
  public constructor(x: number, z: number) {
    this.x = x;
    this.z = z;
  }

  /**
   * Возвращает стабильный строковый ключ для коллекций и индексов.
   */
  public key(): string {
    return `${this.x}:${this.z}`;
  }

  /**
   * Сравнивает клетки по координатам, не требуя совпадения ссылки на объект.
   */
  public equals(other: GridCell): boolean {
    return this.x === other.x && this.z === other.z;
  }

  /**
   * Считает Manhattan distance, потому что базовое движение сетки идет по 4 соседям.
   */
  public distance(other: GridCell): number {
    return Math.abs(this.x - other.x) + Math.abs(this.z - other.z);
  }
}
