#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { SVGIcons2SVGFontStream } = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');

// Configuration
const ICONS_DIR = path.join(__dirname, '../resources/icons');
const OUTPUT_DIR = path.join(__dirname, '../resources');
const FONT_NAME = 'datalayer-icons';
const UNICODE_START = 0xe900;

console.log('🎨 Building Datalayer icon font...\n');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read SVG files from icons directory
const svgFiles = fs.readdirSync(ICONS_DIR)
  .filter(file => file.endsWith('.svg'))
  .sort(); // Ensure consistent unicode assignment

if (svgFiles.length === 0) {
  console.error('❌ No SVG files found in', ICONS_DIR);
  process.exit(1);
}

console.log(`📂 Found ${svgFiles.length} icon(s):`);
svgFiles.forEach((file, index) => {
  const unicode = String.fromCharCode(UNICODE_START + index);
  console.log(`   ${index + 1}. ${file} → U+${(UNICODE_START + index).toString(16).toUpperCase()} (${unicode})`);
});
console.log('');

// Generate SVG font
const fontStream = new SVGIcons2SVGFontStream({
  fontName: FONT_NAME,
  fontHeight: 1000,
  normalize: true,
  log: () => {} // Suppress verbose logging
});

let svgFont = '';
fontStream.on('data', (data) => {
  svgFont += data;
});

fontStream.on('error', (err) => {
  console.error('❌ Error generating SVG font:', err);
  process.exit(1);
});

fontStream.on('finish', () => {
  try {
    console.log('✓ SVG font generated');

    // Convert SVG font to TTF
    const ttf = svg2ttf(svgFont, {});
    const ttfBuffer = Buffer.from(ttf.buffer);
    console.log('✓ TTF font generated');

    // Convert TTF to WOFF
    const woffBuffer = Buffer.from(ttf2woff(ttfBuffer).buffer);
    console.log('✓ WOFF font generated');

    // Write WOFF file
    const woffPath = path.join(OUTPUT_DIR, `${FONT_NAME}.woff`);
    fs.writeFileSync(woffPath, woffBuffer);
    console.log(`✓ Icon font saved: ${woffPath}`);

    // Generate JSON mapping file
    const iconMapping = {};
    svgFiles.forEach((file, index) => {
      const iconName = path.basename(file, '.svg');
      const unicode = (UNICODE_START + index).toString(16);
      iconMapping[iconName] = `\\u${unicode}`;
    });

    const mappingPath = path.join(OUTPUT_DIR, `${FONT_NAME}.json`);
    fs.writeFileSync(mappingPath, JSON.stringify(iconMapping, null, 2));
    console.log(`✓ Unicode mapping saved: ${mappingPath}\n`);

    console.log('📋 Icon Mapping:');
    Object.entries(iconMapping).forEach(([name, unicode]) => {
      console.log(`   ${name}: ${unicode}`);
    });
    console.log('');

    console.log('✅ Icon font build complete!\n');
  } catch (error) {
    console.error('❌ Error during font conversion:', error);
    process.exit(1);
  }
});

// Add SVG files to the font stream
svgFiles.forEach((file, index) => {
  const filePath = path.join(ICONS_DIR, file);
  const glyph = fs.createReadStream(filePath);
  const iconName = path.basename(file, '.svg');
  const unicode = String.fromCharCode(UNICODE_START + index);

  glyph.metadata = {
    unicode: [unicode],
    name: iconName
  };

  fontStream.write(glyph);
});

// Signal end of input
fontStream.end();
