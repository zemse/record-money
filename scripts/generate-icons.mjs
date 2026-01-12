import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// Create a simple SVG with money bag on indigo background
const createIconSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#4F46E5" rx="${size * 0.125}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.35}" fill="#ffffff" opacity="0.15"/>
  <text x="${size / 2}" y="${size * 0.68}" font-size="${size * 0.52}" text-anchor="middle" font-family="sans-serif">💰</text>
</svg>
`

// Create a simpler design without emoji for better compatibility
const createSimpleIconSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#4F46E5" rx="${size * 0.125}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.32}" fill="#FCD34D"/>
  <text x="${size / 2}" y="${size * 0.62}" font-size="${size * 0.35}" font-weight="bold" text-anchor="middle" fill="#4F46E5" font-family="system-ui, sans-serif">$</text>
</svg>
`

async function generateIcons() {
  const sizes = [192, 512]

  for (const size of sizes) {
    const svg = createSimpleIconSvg(size)
    const outputPath = join(publicDir, `pwa-${size}x${size}.png`)

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath)

    console.log(`Generated: pwa-${size}x${size}.png`)
  }

  // Generate Apple touch icon (180x180)
  const appleSvg = createSimpleIconSvg(180)
  await sharp(Buffer.from(appleSvg))
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'))
  console.log('Generated: apple-touch-icon.png')

  // Generate favicon
  const faviconSvg = createSimpleIconSvg(32)
  await sharp(Buffer.from(faviconSvg))
    .png()
    .toFile(join(publicDir, 'favicon.ico'))
  console.log('Generated: favicon.ico')

  console.log('\nAll icons generated successfully!')
}

generateIcons().catch(console.error)
