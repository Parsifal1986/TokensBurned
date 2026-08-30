import test from "node:test";
import assert from "node:assert/strict";
import { profileCardMarkdown } from "../src/github.js";

test("profile card uses TokensBurned branding and the deployed project URL", () => {
  const markdown = profileCardMarkdown("Parsifal1986/Parsifal1986");
  assert.match(markdown, /TokensBurned AI Coding Stats/);
  assert.match(markdown, /Parsifal1986\/Parsifal1986\/burn\/stats\.svg/);
  assert.match(markdown, /parsifal1986\.github\.io\/TokensBurned\//);
  assert.doesNotMatch(markdown, /burn\.lol/);
});
