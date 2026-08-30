const scenarios = {
  cursed: {
    week: "38.7M",
    stack: "Claude Code × DeepSeek",
    quote: "“Claude Code. Zero Claude involved.”",
    backend: [
      ["DeepSeek", 61], ["Anthropic", 27], ["OpenAI", 12],
    ],
  },
  mystery: {
    week: "42.8M",
    stack: "Claude Code × Custom",
    quote: "“25% mystery meat inference.”",
    backend: [
      ["DeepSeek", 44], ["Anthropic", 31], ["Custom / Unknown", 25],
    ],
  },
};

function setScenario(name) {
  const scenario = scenarios[name];
  document.querySelector("[data-week]").textContent = scenario.week;
  document.querySelector("[data-stack]").textContent = scenario.stack;
  document.querySelector("[data-quote]").textContent = scenario.quote;
  document.querySelector("[data-backend]").innerHTML = `
    <h2>BACKEND</h2>
    ${scenario.backend.map(([label, value]) => `
      <div class="bar-row"><span>${label}</span><i aria-hidden="true"><b style="--value: ${value}%"></b></i><em>${value}%</em></div>
    `).join("")}`;
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    const active = button.dataset.scenario === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", () => setScenario(button.dataset.scenario));
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
    } catch {
      copied = false;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(button.previousElementSibling);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const previous = button.textContent;
    button.textContent = copied ? "copied" : "selected";
    button.setAttribute("aria-label", copied ? "Install command copied" : "Install command selected");
    document.querySelector("#copy-status").textContent = copied
      ? "Install command copied."
      : "Install command selected. Press Control C to copy.";
    setTimeout(() => {
      button.textContent = previous;
      button.setAttribute("aria-label", "Copy install command");
    }, 1400);
  });
});
