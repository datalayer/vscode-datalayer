# Datalayer Icon Font

This directory contains source SVG files for the Datalayer custom icon font used in the VS Code extension.

## Icon Font System

The extension uses a custom WOFF icon font to display Datalayer-branded icons in the VS Code UI. This provides:
- Consistent branding across toolbar, sidebars, and menus
- Theme-adaptive icons (automatically work with light/dark themes)
- Scalable vector graphics that look sharp at any size
- Easy addition of new branded icons

## Current Icons

- **datalayer-logo** (`datalayer-logo.svg`) - Main Datalayer logo
  - Used in: Notebook toolbar button (`datalayer.showAuthStatus` command)
  - Unicode: `\ue900`

## File Structure

```
resources/icons/
├── README.md                    # This file
├── datalayer-logo.svg          # Optimized icon for font generation
└── src/                        # Reference SVG variants (not used in font)
    └── datalayer-logo-solid.svg
```

## Adding New Icons

To add a new icon to the font:

### 1. Prepare SVG File

- Create or obtain an SVG icon
- **Requirements:**
  - Monochrome (single color)
  - Use `fill="currentColor"` for theme adaptability
  - No strokes (convert strokes to fills)
  - Clean, simple paths
  - Square aspect ratio recommended (e.g., 15x15 viewBox)

### 2. Add SVG to Icons Directory

```bash
# Add your SVG file to the icons directory
cp my-new-icon.svg resources/icons/
```

### 3. Generate Icon Font

```bash
# Run the icon font build script
npm run build:icons
```

This will:
- Read all `.svg` files from `resources/icons/`
- Generate `resources/datalayer-icons.woff` (WOFF font file)
- Generate `resources/datalayer-icons.json` (Unicode mapping)
- Assign Unicode codepoints sequentially starting from `\ue900`

### 4. Update package.json

Add the new icon to the `contributes.icons` section:

```json
{
  "contributes": {
    "icons": {
      "my-new-icon": {
        "description": "Description of my icon",
        "default": {
          "fontPath": "./resources/datalayer-icons.woff",
          "fontCharacter": "\\ue901"  // Check datalayer-icons.json for assigned unicode
        }
      }
    }
  }
}
```

### 5. Use the Icon

Reference the icon in commands, menus, or views using `$(icon-id)` syntax:

```json
{
  "command": "myCommand",
  "title": "My Command",
  "icon": "$(my-new-icon)"
}
```

## Build Process

The icon font is generated automatically:

- **During development:** `npm run build:icons`
- **Before packaging:** Runs via `vscode:prepublish` hook
- **Watch mode:** *(optional)* Add a watch script if needed

## Technical Details

### Build Toolchain

```
SVG files → svgicons2svgfont → svg2ttf → ttf2woff → WOFF font
```

**Dependencies:**
- `svgicons2svgfont` - SVG to SVG font conversion
- `svg2ttf` - SVG font to TrueType conversion
- `ttf2woff` - TrueType to WOFF conversion

### Font Format

- **Format:** WOFF (Web Open Font Format)
- **Unicode Range:** Private Use Area (U+E900 - U+E9FF)
- **Font Name:** `datalayer-icons`

### Generated Files

- `../datalayer-icons.woff` - Icon font file (included in extension package)
- `../datalayer-icons.json` - Unicode mapping reference (for developers)

### Source SVGs

Source SVG files in `resources/icons/src/` are reference/archive only and are **excluded from the extension package** via `.vscodeignore`.

## VS Code Icon System

VS Code's custom icon system works as follows:

1. **Font Registration:** Icons are defined in `package.json` under `contributes.icons`
2. **Font Loading:** VS Code loads the WOFF font file at runtime
3. **Icon Usage:** Icons are referenced using `$(icon-id)` syntax
4. **Theme Adaptation:** Icons automatically adapt to VS Code's current theme
5. **No CSS Required:** Everything is configured declaratively in `package.json`

## Icon Design Guidelines

For consistent, professional icons:

- **Style:** Match VS Code's Codicons aesthetic (simple, clean, monochromatic)
- **Size:** Design at 16x16 or 24x24 pixels
- **Color:** Use `currentColor` to inherit theme colors
- **Detail:** Keep details minimal for small sizes
- **Testing:** Test in both light and dark themes

## Troubleshooting

### Icon not appearing?

1. Verify font was generated: Check `resources/datalayer-icons.woff` exists
2. Check unicode assignment: Look in `resources/datalayer-icons.json`
3. Verify package.json: Ensure `contributes.icons` entry is correct
4. Rebuild extension: Run `npm run compile` and reload VS Code

### Need to update icons?

1. Modify or add SVG files in `resources/icons/`
2. Run `npm run build:icons`
3. Reload VS Code Extension Development Host (Cmd+R or Ctrl+R)

## Reference

- **VS Code Icon Guidelines:** [VS Code Extension Guides - Icons](https://code.visualstudio.com/api/references/icons-in-labels)
- **Codicons Reference:** [Microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons)
- **Private Use Area Unicode:** [U+E000 - U+F8FF](https://en.wikipedia.org/wiki/Private_Use_Areas)

## Examples from Other Extensions

The Colab VS Code extension uses a similar approach:
- Single WOFF font at `resources/colab-font.woff`
- Icon registered as `colab-logo` with unicode `\ue900`
- Referenced in notebook toolbar with `$(colab-logo)`

---

**Last Updated:** December 2025
