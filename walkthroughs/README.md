# Datalayer VS Code Extension Walkthroughs

This directory contains walkthrough content for the Datalayer VS Code extension's Getting Started experience.

## What are Walkthroughs?

Walkthroughs are interactive, multi-step guides that appear on the VS Code Getting Started page. They help new users understand and adopt your extension's key features through a checklist-style experience.

## Directory Structure

```
walkthroughs/
├── README.md (this file)
└── getting-started/
    ├── CONTENT-GUIDE.md           # Instructions for content creators
    └── media/
        ├── *.svg                  # Step images (SVG preferred)
        ├── *.png                  # Alternative: PNG images
        ├── placeholder.svg        # Template showing theme color usage
        └── example-themed.svg     # Working example with theme colors
```

## How Walkthroughs Work

### 1. Configuration (package.json)

Walkthroughs are defined in `package.json` under `contributes.walkthroughs`:

```json
{
  "contributes": {
    "walkthroughs": [
      {
        "id": "unique-id",
        "title": "Walkthrough Title",
        "description": "Brief overview",
        "steps": [...]
      }
    ]
  }
}
```

### 2. Step Structure

Each step includes:
- **id**: Unique identifier
- **title**: Action-oriented heading (use verbs)
- **description**: 2-3 sentences with optional button
- **media**: Image (SVG/PNG) or Markdown file
- **completionEvents**: Auto-check triggers (optional)

### 3. Button Syntax

Buttons are created using Markdown link syntax on their own line:

```markdown
[Button Text](command:commandId)
```

Example:
```markdown
"description": "Click below to login.\n\n[Login to Datalayer](command:datalayer.login)"
```

### 4. Completion Events

Steps can auto-complete when users perform actions:

- `onCommand:commandId` - Command executed
- `onSettingChanged:settingId` - Setting modified
- `onView:viewId` - View opened
- `onContext:expression` - Context key set
- `extensionInstalled:extensionId` - Extension installed
- `onLink:url` - Link clicked

## Testing Walkthroughs

1. **During Development**:
   - Press `F5` to launch Extension Development Host
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Run "Welcome: Open Walkthrough..."
   - Select "Datalayer: Get Started with Datalayer"

2. **Reset Progress**:
   - Command: "Getting Started: Reset Progress"
   - Re-test completed steps

3. **Debug Tips**:
   - Check Developer Console for errors
   - Verify image paths are relative to extension root
   - Test in both light and dark themes

## Media Guidelines

### SVG (Preferred)

**Benefits**:
- Scales perfectly at any resolution
- Supports VS Code theme colors
- Smaller file size

**Theme Color Variables**:
```svg
<svg>
  <rect fill="var(--vscode-foreground)" />
  <text fill="var(--vscode-button-background)" />
</svg>
```

**Common Theme Colors**:
- `--vscode-foreground` - Primary text color
- `--vscode-background` - Editor background
- `--vscode-button-background` - Button fill
- `--vscode-button-foreground` - Button text
- `--vscode-editor-background` - Editor area
- `--vscode-sideBar-background` - Sidebar area

Full list: https://code.visualstudio.com/api/references/theme-color

**Tool**: Visual Studio Code Color Mapper (Figma plugin) helps convert designs to themed SVGs.

### PNG (Alternative)

If SVG is not feasible:
- Ensure visibility in both light and dark themes
- Recommended size: 400-600px width
- Use neutral colors that work in both themes
- Test in both theme modes

## Content Guidelines

See [getting-started/CONTENT-GUIDE.md](./getting-started/CONTENT-GUIDE.md) for detailed content creation instructions.

## Resources

- [VS Code Walkthrough API](https://code.visualstudio.com/api/references/contribution-points#contributes.walkthroughs)
- [Walkthrough UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/walkthroughs)
- [Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)
- [Extension Samples](https://github.com/microsoft/vscode-extension-samples/tree/main/getting-started-sample)

## Implementation Checklist

- [ ] Define walkthrough in package.json
- [ ] Create all step images (SVG preferred)
- [ ] Write step descriptions (keep concise)
- [ ] Add alt text for accessibility
- [ ] Configure completion events
- [ ] Test in Extension Development Host
- [ ] Test in both light and dark themes
- [ ] Reset and re-test walkthrough flow
- [ ] Verify all buttons work correctly
- [ ] Check auto-completion triggers

## Maintenance

When updating walkthroughs:
1. Keep step count manageable (5-7 steps ideal)
2. Update screenshots when UI changes
3. Test after VS Code updates
4. Gather user feedback for improvements
5. Keep completion events aligned with actual commands
