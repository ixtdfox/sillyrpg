import { MainMenuCommand } from "./MainMenuCommand";

/**
 * Represents a selectable menu action shown in the main menu list.
 */
export interface MainMenuAction {
  /** Input command triggered for this action. */
  command: MainMenuCommand;
  /** Localization key used to render the action label. */
  labelKey: string;
}
