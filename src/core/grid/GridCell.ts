export class GridCell {
  public readonly x: number;
  public readonly z: number;

  public constructor(x: number, z: number) {
    this.x = x;
    this.z = z;
  }

  public key(): string {
    return `${this.x}:${this.z}`;
  }

  public equals(other: GridCell): boolean {
    return this.x === other.x && this.z === other.z;
  }

  public distance(other: GridCell): number {
    return Math.abs(this.x - other.x) + Math.abs(this.z - other.z);
  }
}
