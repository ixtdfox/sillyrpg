/**
 * Shared detectable kind labels used by scene bootstrap and debug logging.
 */
export const DetectableKinds = {
  PLAYER: "player",
  GOLEM: "golem",
} as const;

export type DetectableKind = (typeof DetectableKinds)[keyof typeof DetectableKinds];
