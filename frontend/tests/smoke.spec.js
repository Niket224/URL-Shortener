import { test, expect } from "@playwright/test";
import os from "node:os";
import path from "node:path";

test("register, create, copy, redirect, stats, edit, delete, and sign in", async ({ page, request }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  // Fonts are cosmetic and tests must not depend on an external network.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ body: "", contentType: "text/css" }));
  await page.goto("/");
  await expect(page).toHaveTitle(/Snip/);
  await expect(page.getByRole("heading", { name: "Sign in to Snip" })).toBeVisible();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  const email = `browser-${Date.now()}-${testInfo.project.name}@example.com`;
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("browser-test-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Links" })).toBeVisible();
  await page.getByLabel("Destination URL", { exact: true }).fill("https://example.com/browser");
  await page.getByRole("button", { name: /Shorten/ }).click();
  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  await card.getByTitle("Copy", { exact: true }).click();
  await expect(card.getByRole("status")).toHaveText("Copied!");
  const shortUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(shortUrl).toMatch(/^http:\/\/127\.0\.0\.1:5101\/[\w-]{6}$/);
  const redirected = await request.get(shortUrl, { maxRedirects: 0 });
  expect(redirected.status()).toBe(302);
  expect(redirected.headers().location).toBe("https://example.com/browser");
  await card.getByTitle("Stats", { exact: true }).click();
  const stats = page.getByRole("dialog", { name: "Analytics" });
  await expect(stats.getByText(shortUrl, { exact: true })).toBeVisible();
  await expect(stats.getByText("Total Clicks", { exact: true }).locator("..")).toContainText("1");
  await page.keyboard.press("Escape");
  await expect(stats).not.toBeVisible();
  await expect(card.getByTitle("Stats", { exact: true })).toBeFocused();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit link" });
  await edit.getByLabel("Destination URL").fill("https://example.com/edited");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  expect((await request.get(shortUrl, { maxRedirects: 0 })).headers().location).toBe("https://example.com/edited");
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(fits).toBe(true);
  for (const button of await page.getByRole("button").all()) {
    const box = await button.boundingBox();
    if (box) expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.screenshot({ path: path.join(os.tmpdir(), `snip-${testInfo.project.name}.png`), fullPage: true });
  await card.getByTitle("Delete", { exact: true }).click();
  await expect(page.locator("article")).toHaveCount(0);
  expect((await request.get(shortUrl, { maxRedirects: 0 })).status()).toBe(404);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("browser-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Links" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("validation, list/create/stats/delete recovery, clipboard failure and pagination", async ({ page, request }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ body: "", contentType: "text/css" }));
  const account = await request.post("http://127.0.0.1:5101/api/auth/register", { data: {
    email: `recovery-${Date.now()}-${testInfo.project.name}@example.com`, password: "browser-test-password",
  } });
  expect(account.status()).toBe(201);
  const { token } = await account.json();
  await page.addInitScript(value => sessionStorage.setItem("snip-token", value), token);
  let listFails = true, createFails = true, statsFail = true, deleteFails = true;
  await page.route("**/api/urls**", async route => {
    const req = route.request(), url = new URL(req.url());
    let error;
    if (req.method() === "GET" && url.pathname === "/api/urls" && listFails) error = "List unavailable";
    if (req.method() === "POST" && createFails) error = "Creation unavailable";
    if (url.pathname.endsWith("/stats") && statsFail) error = "Stats unavailable";
    if (req.method() === "DELETE" && deleteFails) error = "Deletion unavailable";
    if (error) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error }) });
    else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not load links");
  listFails = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No links yet.", { exact: false })).toBeVisible();
  await page.getByLabel("Destination URL", { exact: true }).fill("ftp://example.com/file");
  await page.getByRole("button", { name: /Shorten/ }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a valid URL");
  await page.getByLabel("Destination URL", { exact: true }).fill("https://example.com/recovery");
  await page.getByRole("button", { name: /Shorten/ }).click();
  await expect(page.getByRole("alert")).toContainText("Creation unavailable");
  createFails = false;
  await page.getByRole("button", { name: /Shorten/ }).click();
  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Simulated clipboard denial"); }; });
  await card.getByRole("button", { name: "Copy short link" }).click();
  await expect(card.getByRole("alert")).toContainText("Copy failed");
  await expect(card.getByRole("status")).toHaveCount(0);
  await card.getByRole("button", { name: "View analytics" }).click();
  const dialog = page.getByRole("dialog", { name: "Analytics" });
  await expect(dialog.getByRole("alert")).toContainText("Failed to load stats");
  statsFail = false;
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(dialog.getByText("Total Clicks", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "View analytics" })).toBeFocused();
  await card.getByRole("button", { name: "Delete link" }).click();
  await expect(page.getByText("Deletion unavailable", { exact: true })).toBeVisible();
  await expect(card).toBeVisible();
  deleteFails = false;
  await card.getByRole("button", { name: "Delete link" }).click();
  await expect(page.locator("article")).toHaveCount(0);
  for (let i = 0; i < 13; i++) {
    const response = await request.post("http://127.0.0.1:5101/api/urls", {
      headers: { Authorization: `Bearer ${token}` }, data: { originalUrl: `https://example.com/page/${i}` },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await expect(page.locator("article")).toHaveCount(12);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(12);
  expect(errors).toEqual([]);
});
