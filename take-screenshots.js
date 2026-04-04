const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs')

const PAGES = [
  { name: 'dashboard', hash: '#/dashboard', wait: 1000 },
  { name: 'produits', hash: '#/produits', wait: 1000 },
  { name: 'fournisseurs', hash: '#/fournisseurs', wait: 1000 },
  { name: 'statistiques', hash: '#/statistiques', wait: 1000 },
  { name: 'reception', hash: '#/reception', wait: 1000 },
  { name: 'consommation', hash: '#/consommation', wait: 1000 },
  { name: 'parametres', hash: '#/parametres', wait: 1000 },
]

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR)

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })

  for (const p of PAGES) {
    console.log(`Capturing ${p.name}...`)
    await page.goto(`http://localhost:5199/${p.hash}`, { waitUntil: 'networkidle0', timeout: 10000 })
    await new Promise(r => setTimeout(r, p.wait))
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${p.name}.png`),
      fullPage: false,
    })
    console.log(`  -> ${p.name}.png`)
  }

  await browser.close()
  console.log('Done! Screenshots in', SCREENSHOT_DIR)
}

main().catch(err => { console.error(err); process.exit(1) })
