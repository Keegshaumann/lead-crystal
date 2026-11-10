#!/bin/sh
# Converts the originals in assets-src/ into web-ready files in public/images/.
# Needs cwebp (brew install webp) and sips (macOS). Re-run after adding product photos.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/images/products public/images/site public/images/brand

for f in assets-src/products/*; do
  sku=$(basename "${f%.*}")
  out="public/images/products/$sku.webp"
  [ -s "$out" ] && [ "$out" -nt "$f" ] && continue
  cwebp -quiet -q 82 -alpha_q 90 -resize 900 0 "$f" -o "$out"
done

cwebp -quiet -q 78 -resize 1920 0 assets-src/site/hero.jpg -o public/images/site/hero-1920.webp
cwebp -quiet -q 76 -resize 1000 0 assets-src/site/hero.jpg -o public/images/site/hero-1000.webp
cwebp -quiet -q 80 assets-src/site/crystals.jpg -o public/images/site/crystals.webp
cwebp -quiet -q 76 -resize 1920 0 assets-src/site/globe.jpg -o public/images/site/globe.webp
cwebp -quiet -q 80 -alpha_q 80 -resize 1600 0 assets-src/site/swirls.png -o public/images/site/swirls.webp

# Brand: wordmark at 2x header size, square icons for favicons and schema.org logo
node -e "require('sharp')('assets-src/brand/logo-wordmark-white.png').trim().resize({height:120}).png({compressionLevel:9}).toFile('public/images/brand/logo-wordmark-white.png').then(i=>console.log('logo',i.width+'x'+i.height))"
for s in 512 192 180 32; do
  sips -s format png -Z $s assets-src/brand/icon-curved.png --out public/images/brand/icon-$s.png >/dev/null
done
cp public/images/brand/icon-32.png public/favicon.png

# Default social share image: 1200x630 crop of the hero
sips -s format jpeg -s formatOptions 82 --resampleWidth 1200 assets-src/site/hero.jpg --out /tmp/lc-og.jpg >/dev/null
sips -c 630 1200 /tmp/lc-og.jpg --out public/images/og-default.jpg >/dev/null
rm -f /tmp/lc-og.jpg
echo "images done"
