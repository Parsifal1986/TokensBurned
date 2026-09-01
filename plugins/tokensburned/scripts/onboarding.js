#!/usr/bin/env node

import { sessionStartContext } from "../src/onboarding.js";

const context = await sessionStartContext();
if (context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  }));
}
