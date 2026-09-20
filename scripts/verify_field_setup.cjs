// Optional browser regression check. Install Playwright or set PLAYWRIGHT_MODULE.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

(async () => {
  const output = await mkdtemp(join(tmpdir(), "fll-field-setup-"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.url().startsWith("http://127.0.0.1:8000") && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto("http://127.0.0.1:8000");
    await page.waitForSelector('#mission-field[data-field-setup]');
    await page.getByRole("button", { name: "Collapse Team Cloud", exact: true }).click();
    assert.equal(await page.locator("#mission-field").getAttribute("data-field-setup"), "m15_m13_m14");
    await page.screenshot({ path: join(output, "desktop.png") });
    console.log("PASS: page loads and setup controls render");

    const { DOCK_PLACEMENTS } = await import("../js/domain/dock_placements.js");
    const docks = ["city", "farm", "mine"];
    for (const [key, placements] of Object.entries(DOCK_PLACEMENTS)) {
      const models = key.split("_");
      for (let i = 0; i < docks.length; i++) await page.locator(`#dock-${docks[i]}`).selectOption(models[i]);
      assert.equal(await page.locator("#mission-field").getAttribute("data-field-setup"), key);
      for (const [model, placement] of Object.entries(placements)) {
        assert.equal(await page.locator(`#dock-model-${model}`).getAttribute("transform"), placement.transform);
        assert.equal(await page.locator(`#dock-model-${model} use`).getAttribute("x"), placement.x);
        assert.equal(await page.locator(`#dock-model-${model} use`).getAttribute("y"), placement.y);
        const bounds = await page.locator(`#dock-model-${model}`).evaluate(el => ({ width: el.getBBox().width, height: el.getBBox().height }));
        assert.ok(bounds.width > 0 && bounds.height > 0, `${model} asset renders`);
      }
      const mission = JSON.parse(await page.locator("#mission-json").inputValue());
      assert.deepEqual(docks.map(dock => mission.fieldSetup[dock]), models);
      await page.locator("#mission-field").screenshot({ path: join(output, `${key}.png`) });
    }
    console.log("PASS: all six arrangements render at exact calibrated coordinates");

    await page.locator("#field-confirmed").check();
    await page.locator("#mission-name").fill("Setup persistence test");
    await page.locator("#mission-name").blur();
    assert.equal(await page.locator("#field-confirmed").isChecked(), true);
    await page.locator("#dock-city").selectOption("m13");
    assert.equal(await page.locator("#field-confirmed").isChecked(), false);
    await page.locator("#field-confirmed").check();
    const savedKey = await page.locator("#mission-field").getAttribute("data-field-setup");
    await page.reload();
    await page.waitForSelector('#mission-field[data-field-setup]');
    assert.equal(await page.locator("#mission-field").getAttribute("data-field-setup"), savedKey);
    assert.equal(await page.locator("#field-confirmed").isChecked(), false);
    console.log("PASS: drafts persist; physical confirmation resets on change and reload");

    const link = await page.evaluate(async () => {
      const { buildMissionShareLink } = await import("./js/domain/share.js?v=dock-setup-1");
      return buildMissionShareLink(JSON.parse(document.querySelector("#mission-json").value));
    });
    await page.evaluate(() => localStorage.clear());
    await page.goto(link);
    await page.waitForSelector('#mission-field[data-field-setup]');
    assert.equal(await page.locator("#mission-field").getAttribute("data-field-setup"), savedKey);
    await page.locator("#clear-field").click();
    assert.equal(await page.locator("#mission-field").getAttribute("data-field-setup"), savedKey);
    await page.locator("#build-replay").click();
    assert.equal(await page.locator("#mission-field").getAttribute("data-field-setup"), savedKey);
    console.log("PASS: share loading, clear field and replay preserve layout");

    await page.locator("#mission-model-opacity").fill("0");
    assert.equal(await page.locator("#mission-model-layer").evaluate(el => getComputedStyle(el).opacity), "0");
    assert.notEqual(await page.locator("#field-artwork").evaluate(el => getComputedStyle(el).opacity), "0");
    assert.equal(await page.locator("#mission-model-layer #field-artwork, #mission-model-layer #field-background-image").count(), 0);
    await page.locator("#mission-field").screenshot({ path: join(output, "models-hidden.png") });
    await page.locator("#mission-model-opacity").fill("100");
    console.log("PASS: model visibility leaves field artwork intact");

    await page.getByRole("button", { name: "Collapse Field Setup", exact: true }).click();
    await page.locator("#edit-field-setup").click();
    assert.equal(await page.getByRole("button", { name: "Collapse Field Setup", exact: true }).getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#dock-city").evaluate(el => document.activeElement === el), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#field-setup-panel").scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No mobile horizontal overflow");
    await page.screenshot({ path: join(output, "mobile-setup.png") });
    await page.locator(".field-setup-summary").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "mobile-field.png") });
    console.log("PASS: edit expands/focuses setup; mobile fits viewport");

    await page.goto("http://127.0.0.1:8000/training/placement.html");
    await page.waitForSelector("#mission-field");
    assert.ok(await page.locator("#dock-model-m13").evaluate(el => el.getBBox().width > 0));
    assert.deepEqual(errors, []);
    console.log("PASS: training assets render; no page errors or failed local requests");
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
