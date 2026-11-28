// 用 headless Chrome 逐格渲染：node shoot.js <w> <h> <outDir> <t0> <t1> <fps> [list of times...]
const puppeteer = require("/opt/npm-tools/node_modules/puppeteer");
const fs = require("fs"), path = require("path");
(async () => {
  const [w, h, out, t0, t1, fps, ...extra] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome", headless: "new",
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--allow-file-access-from-files", `--window-size=${w},${h}`]
  });
  const page = await browser.newPage();
  page.on("console", m => console.log("[page]", m.text()));
  page.on("pageerror", e => console.log("[err]", e.message));
  await page.setViewport({ width: +w, height: +h });
  await page.goto("file://" + path.resolve(__dirname, "film2.html") + `?w=${w}&h=${h}` + (process.env.NOMSAA ? "&nomsaa=1" : "") + (process.env.QS || ""));
  await page.waitForFunction("window.filmReady", { timeout: 120000 });
  await page.evaluate("window.filmReady");
  let times = [];
  if (extra.length) times = extra.map(Number);
  else { const n = Math.round((+t1 - +t0) * +fps); for (let i = 0; i < n; i++) times.push(+t0 + i / +fps); }
  const start = Date.now();
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const frameNo = extra.length ? t.toFixed(2) : String(Math.round(t * +fps)).padStart(4, "0");
    const file = path.join(out, `f_${frameNo}.png`);
    if (!extra.length && fs.existsSync(file)) continue;
    const data = await page.evaluate(t => { window.renderAt(t); return document.querySelector("canvas").toDataURL("image/png"); }, t);
    fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
    if (i % 10 === 0) console.log(`frame ${i + 1}/${times.length} t=${t.toFixed(2)} ${((Date.now() - start) / 1000 / (i + 1)).toFixed(2)}s/f`);
  }
  await browser.close();
})();
