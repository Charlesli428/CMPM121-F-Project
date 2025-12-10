const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Open game
  await page.goto("http://localhost:4173");

  // Simulate holding "W" to move forward
  await page.keyboard.down("w");
  await page.waitForTimeout(1500);
  await page.keyboard.up("w");

  // Check if canvas exists (game initialized)
  const canvasVisible = await page.$eval("canvas", () => true).catch(() => false);

  if (!canvasVisible) {
    console.error("❌ Game canvas did not load.");
    process.exit(1);
  }

  console.log("✅ Interaction test passed.");
  await browser.close();
})();
gi