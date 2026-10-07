import { render } from "preact";
import "./styles.css";
import { windowKind } from "./platform/runtime";

/** One bundle serves every window of the app; the address says which one this is. */
async function main() {
  const kind = windowKind();
  const root = document.getElementById("app")!;
  switch (kind) {
    case "island": {
      const { IslandWindow } = await import("./views/Live");
      return render(<IslandWindow />, root);
    }
    case "widget": {
      const { WidgetWindow } = await import("./views/Live");
      return render(<WidgetWindow />, root);
    }
    case "banner": {
      const { BannerWindow } = await import("./views/Live");
      return render(<BannerWindow />, root);
    }
    case "popover": {
      const { PopoverWindow } = await import("./views/Live");
      return render(<PopoverWindow />, root);
    }
    case "cover": {
      const { CoverWindow } = await import("./views/Live");
      return render(<CoverWindow />, root);
    }
    case "settings": {
      const { SettingsWindow } = await import("./views/Live");
      return render(<SettingsWindow />, root);
    }
    case "dump": {
      const { DumpPage } = await import("./dump/DumpPage");
      return render(<DumpPage />, root);
    }
    default: {
      const { runEngine } = await import("./shell/engineHost");
      await runEngine();
    }
  }
}

void main();
