import { Vector3 } from "@babylonjs/core";
import { HexCell } from "../../hex/HexCell";
import { HexGrid } from "../../hex/HexGrid";

/**
 * Computes broad-phase candidate cells inside a cone-like vision sector.
 */
export function getHexCellsInVisionSector(
  grid: HexGrid,
  originCell: HexCell,
  forward: Vector3,
  rangeCells: number,
  fovDegrees: number
): HexCell[] {
  const normalizedForward = new Vector3(forward.x, 0, forward.z).normalize();
  const minDot = Math.cos((fovDegrees * Math.PI) / 360);
  const originWorld = grid.cellToWorld(originCell, 0);
  const result: HexCell[] = [];

  for (let dq = -rangeCells; dq <= rangeCells; dq += 1) {
    for (let dr = -rangeCells; dr <= rangeCells; dr += 1) {
      const candidate = new HexCell(originCell.q + dq, originCell.r + dr);
      if (!grid.contains(candidate)) {
        continue;
      }

      if (hexDistance(originCell, candidate) > rangeCells) {
        continue;
      }

      if (candidate.equals(originCell)) {
        result.push(candidate);
        continue;
      }

      const candidateWorld = grid.cellToWorld(candidate, 0);
      const direction = candidateWorld.subtract(originWorld);
      direction.y = 0;

      const lengthSquared = direction.lengthSquared();
      if (lengthSquared <= Number.EPSILON) {
        result.push(candidate);
        continue;
      }

      direction.scaleInPlace(1 / Math.sqrt(lengthSquared));
      const dot = Vector3.Dot(normalizedForward, direction);
      if (dot >= minDot) {
        result.push(candidate);
      }
    }
  }

  return result;
}

function hexDistance(a: HexCell, b: HexCell): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}
