import { App } from "./App";

const app = new App("gameCanvas");
void app.run().catch((error: unknown) => {
  console.error("[App] Failed to start.", error);
});
