import { expect, test } from "@playwright/test";

const twoPixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==";

test("OCR runtime funciona sem liberar same-origin", async ({ page }) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });

  await page.route("https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    headers: { "access-control-allow-origin": "*" },
    body: `
      globalThis.Tesseract = {
        createWorker: async () => ({
          recognize: async () => ({ data: { text: "kWh 01234" } })
        })
      };
    `
  }));

  await page.goto("/tests/fixtures/sw-harness.html");

  const result = await page.evaluate(async (pngBase64) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "OCR sandbox test";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.src = "/ocr-runtime.html";
    document.body.append(frame);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ocr_frame_load_timeout")), 8_000);
      frame.addEventListener("load", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      frame.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("ocr_frame_load_failed"));
      }, { once: true });
    });

    const binary = atob(pngBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], "medidor.png", { type: "image/png" });
    const channel = new MessageChannel();

    const payload = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ocr_result_timeout")), 8_000);
      channel.port1.onmessage = (event) => {
        if (event.data?.type !== "result") return;
        clearTimeout(timer);
        resolve(event.data);
      };
      channel.port1.start?.();
      frame.contentWindow.postMessage({ type: "volt-ocr-analyze", file }, "*", [channel.port2]);
    });

    return {
      payload,
      sandbox: frame.getAttribute("sandbox")
    };
  }, twoPixelPng);

  expect(result.sandbox).toBe("allow-scripts");
  expect(result.payload).toMatchObject({
    type: "result",
    ok: true,
    engine: "tesseract_wasm",
    text: "kWh 01234"
  });
  expect(failures).toEqual([]);
});
