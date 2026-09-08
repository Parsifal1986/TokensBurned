import { joinSession } from "@github/copilot-sdk/extension";
import { attachCopilotUsage } from "./plugin.js";

attachCopilotUsage(await joinSession({}));
