import { spawnSync } from "node:child_process";

const origin = process.argv[2] ?? "http://localhost:7385";
const url = new URL(origin);
if (!(
  ["localhost", "127.0.0.1"].includes(url.hostname) || url.protocol === "https:"
)) {
  throw new Error("Use a local or HTTPS application URL.");
}
const environment = {
  ...process.env,
  CHROME_DEVTOOLS_AXI_SESSION:
    process.env.TALLY_UI_BROWSER_SESSION ?? "tally-ui-fix",
  CHROME_DEVTOOLS_AXI_BROWSER_URL:
    process.env.TALLY_UI_BROWSER_URL ?? "http://127.0.0.1:37148",
};
function command(args, input) {
  const result = spawnSync("npx", ["-y", "chrome-devtools-axi", ...args], {
    env: environment,
    input,
    encoding: "utf8",
    timeout: 60000,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Appearance check failed.");
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("PASS ")) console.log(line);
  }
  return result.stdout;
}
const pages = command(["pages"]);
const firstPage = pages.match(/^  (\d+),/m);
if (firstPage) command(["selectpage", firstPage[1]]);
command(["open", url.origin]);
for (const viewport of [
  "1440x1000",
  "393x852x3,mobile,touch",
  "320x568x2,mobile,touch",
]) {
  for (const scheme of ["dark", "light"]) {
    command(["emulate", "--viewport", viewport, "--color-scheme", scheme]);
    command(
      ["run"],
      `
      await page.open(${JSON.stringify(url.origin)});
      await page.wait('input[aria-label="Email"]', 20000);
      await page.eval(async () => { await document.fonts.ready; });
      const result = await page.eval(() => {
        const luminance = rgb => {
          const channels = rgb.match(/[\\d.]+/g).slice(0, 3).map(Number).map(n => {
            const c = n / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return channels.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        };
        const background = element => {
          for (let current = element; current; current = current.parentElement) {
            const color = getComputedStyle(current).backgroundColor;
            if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color;
          }
          return 'rgb(255, 255, 255)';
        };
        const textContrast = text => {
          const element = [...document.querySelectorAll('div, p, h1, span')].find(e => e.textContent === text && e.children.length === 0);
          if (!element) throw new Error('Missing visible text: ' + text);
          const a = luminance(getComputedStyle(element).color), b = luminance(background(element));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const email = document.querySelector('input[aria-label="Email"]');
        const submit = document.querySelector('[data-testid="tally-form"] [role="button"][aria-label="Sign in"]');
        return {
          backgroundLuminance: luminance(background(document.elementFromPoint(8, 80))),
          brandContrast: textContrast('tally.'),
          taglineContrast: textContrast('Know what’s due.'),
          privacyContrast: textContrast('Private by default. No bank credentials needed.'),
          inputFontSize: parseFloat(getComputedStyle(email).fontSize),
          buttonWidth: submit.getBoundingClientRect().width,
          inputWidth: email.getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      if (${JSON.stringify(scheme)} === 'dark' ? result.backgroundLuminance > 0.12 : result.backgroundLuminance < 0.8) throw new Error('Page background does not follow theme: ' + JSON.stringify(result));
      for (const key of ['brandContrast', 'taglineContrast', 'privacyContrast']) if (result[key] < 4.5) throw new Error('Unreadable text (' + key + '): ' + JSON.stringify(result));
      if (result.overflow) throw new Error('Horizontal overflow');
      if (result.inputFontSize < 16) throw new Error('Small inputs trigger iPhone browser zoom');
      if (result.buttonWidth < result.inputWidth * 0.98) throw new Error('Primary action should fill the form width');
      console.log('PASS ' + ${JSON.stringify(scheme + " " + viewport)} + ' readable theme and responsive auth form');
    `,
    );
  }
}
