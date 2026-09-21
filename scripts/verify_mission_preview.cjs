// Optional browser checks: serve the project on port 8000 and provide Playwright.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const output = await mkdtemp(join(tmpdir(), "fll-mission-preview-"));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    const robot = page.locator('[data-draggable-robot="1"]');
    const snapshot = () => page.evaluate(() => ({
      robot: document.querySelector('[data-draggable-robot="1"]').outerHTML,
      trace: document.querySelector('[data-active-trace="1"]')?.outerHTML || null
    }));
    const pending = () => page.locator("#field-preview-status").getAttribute("data-pending");
    const draft = async () => JSON.parse(await page.locator("#mission-json").inputValue());
    const applyJson = async mission => {
      await page.locator("#mission-json").fill(JSON.stringify(mission));
      await page.locator("#apply-json").click();
    };
    await page.goto("http://127.0.0.1:8000/");
    await robot.waitFor();
    await page.getByRole("button", { name: "Collapse Team Cloud", exact: true }).click();
    await page.locator("#load-demo").click();
    const original = await snapshot();
    const oldWidth = await robot.locator(":scope > rect").first().getAttribute("width");
    await page.locator("#action-list .action-value-field input").first().fill("25");
    await page.locator("#action-list .action-value-field input").first().blur();
    await page.getByRole("button", { name: "Insert pause after action 1", exact: true }).click();
    await page.getByRole("button", { name: "Delete action 2", exact: true }).click();
    const actionsBeforeReorder = (await draft()).actions;
    await page.locator('[data-action-drag-index="0"]').press("Alt+ArrowDown");
    assert.deepEqual((await draft()).actions[1], actionsBeforeReorder[0]);
    await page.locator("#start-x").fill("40");
    await page.locator("#robot-width").fill("30");
    await page.locator("#trace-color").fill("#ff9900");
    assert.deepEqual(await snapshot(), original, "editor changes cannot redraw the field");
    assert.equal(await pending(), "true");
    await page.locator("#dock-mine").selectOption("m13");
    assert.deepEqual(await snapshot(), original, "dock changes must not publish draft route");

    await page.locator("#build-replay").click();
    const oldFrames = await page.locator("#replay-slider").getAttribute("max");
    await page.locator("#replay-slider").fill(oldFrames);
    assert.deepEqual(await snapshot(), original, "Replay Field uses the previous snapshot");
    await page.locator("#clear-field").click();
    assert.equal(await robot.locator(":scope > rect").first().getAttribute("width"), oldWidth);
    const cleared = await snapshot();
    await robot.click();
    assert.deepEqual(await snapshot(), cleared, "blocked drag cannot change the displayed pose");
    console.log("PASS: action, pose, robot and color edits stay pending; replay and clear use the old mission");

    await applyJson({ ...await draft(), defaultAttachmentIndexes: [], actions: [{ type: "pause", value: 30 }, { type: "move", value: 15 }] });
    assert.deepEqual(await snapshot(), cleared, "Apply JSON edits the draft only");
    await page.locator("#start-mission").click();
    assert.equal(await pending(), "false");
    assert.equal(await page.locator("#mission-save-status").getAttribute("data-dirty"), "true", "Start is not Save");
    const appliedWidth = await robot.locator(":scope > rect").first().getAttribute("width");
    assert.notEqual(appliedWidth, oldWidth);
    assert.ok((await robot.locator("[data-robot-attachment-index]").evaluateAll(nodes => nodes.map(node => node.getAttribute("display")))).every(display => display === "none"));
    const runningFrames = await page.locator("#replay-slider").getAttribute("max");
    const runningFrame = Number(await page.locator("#replay-slider").inputValue());
    await page.locator("#robot-width").fill("15");
    await page.waitForFunction(index => Number(document.querySelector("#replay-slider").value) > index, runningFrame);
    assert.equal(await page.locator("#stop-mission").isEnabled(), true);
    assert.equal(await robot.locator(":scope > rect").first().getAttribute("width"), appliedWidth);
    assert.equal(await page.locator("#replay-slider").getAttribute("max"), runningFrames);
    assert.equal(await pending(), "true");
    await page.locator("#stop-mission").click();
    const stopped = await snapshot();
    await page.locator("#mission-json").fill("unapplied JSON");
    await page.locator("#start-mission").click();
    assert.deepEqual(await snapshot(), stopped);
    assert.match(await page.locator("#mission-file-status").innerText(), /Apply or discard/);
    await page.locator("#discard-json").click();
    const download = page.waitForEvent("download");
    await page.locator("#download-mission").click();
    await download;
    assert.equal(await pending(), "false");
    assert.equal(await page.locator("#replay-slider").getAttribute("max"), "0");
    assert.notEqual(await robot.locator(":scope > rect").first().getAttribute("width"), appliedWidth);
    console.log("PASS: Start applies without saving; editing does not interrupt or mutate a run; download publishes");

    await page.locator("#clear-field").click();
    const beforeClick = await snapshot();
    await robot.click();
    assert.deepEqual(await snapshot(), beforeClick, "a click without dragging preserves the start pose");
    await robot.scrollIntoViewIfNeeded();
    const box = await robot.boundingBox();
    const beforeDrag = await snapshot();
    const count = (await draft()).actions.length;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.equal((await draft()).actions.length, count + 2);
    assert.deepEqual(await snapshot(), beforeDrag, "accepted drag stages steps and restores pose");
    assert.equal(await pending(), "true");
    await page.locator("#field-preview-status").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "pending-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#field-preview-status").scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(output, "pending-mobile.png") });
    assert.deepEqual(errors, []);
    console.log(`PASS: robot drags stage changes; pending status fits desktop/mobile. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
