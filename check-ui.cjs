const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  const allLogs = [];
  page.on('console', msg => allLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => allLogs.push(`[PAGE_ERROR] ${err.message}`));
  
  // 拦截网络请求
  page.on('response', async resp => {
    if (resp.status() >= 400) {
      const url = resp.url();
      const body = await resp.text().catch(() => 'N/A');
      allLogs.push(`[HTTP_ERROR] ${resp.status()} ${url}: ${body.substring(0, 200)}`);
    }
  });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('=== All Logs ===');
  allLogs.forEach(l => console.log(l));
  
  await browser.close();
})();
