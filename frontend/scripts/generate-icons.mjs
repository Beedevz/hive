import sharp from 'sharp'
import { mkdir } from 'fs/promises'

await mkdir('public/icons', { recursive: true })

const src = 'public/logo-only.png'
const sizes = [
  { out: 'public/icons/icon-192.png',         size: 192 },
  { out: 'public/icons/icon-512.png',         size: 512 },
  { out: 'public/icons/apple-touch-icon.png', size: 180 },
]

for (const { out, size } of sizes) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(out)
  console.log(`✓ ${out}`)
}
