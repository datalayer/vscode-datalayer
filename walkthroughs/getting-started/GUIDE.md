# Walkthrough Content Guidelines

**Purpose**: Best practices for creating and maintaining walkthrough content following VS Code UX guidelines

## Actual Content Location

The actual walkthrough content is in [CONTENT.md](./CONTENT.md). This file contains only guidelines and best practices.

## VS Code UX Guidelines Summary

### ✅ DO

- **Use helpful images** to add context to each step
- **Provide actions** for each step using action verbs (Login, Create, Select, View)
- **Keep it concise** - 2-3 sentences per step description
- **Make images theme-aware** - Work in both light and dark themes
- **Use SVGs when possible** - They scale better and support theme colors

### ❌ DON'T

- **Add too many steps** - Keep to 5-7 steps maximum
- **Create multiple walkthroughs** - One comprehensive walkthrough is better
- **Use long paragraphs** - Users scan quickly, keep text brief
- **Forget alt text** - Required for accessibility/screen readers

## Writing Tips

### 1. Use Action-Oriented Language

- ✅ "Login to access cloud features"
- ❌ "You can login if you want"

### 2. Explain Benefits, Not Just Features

- ✅ "Select a runtime to execute code on powerful cloud GPUs"
- ❌ "This is where you select runtimes"

### 3. Keep It Conversational

- ✅ "Create your first notebook to start coding immediately"
- ❌ "The notebook creation interface allows for instantiation of Jupyter notebooks"

### 4. Use Numbers When Helpful

- ✅ "Run notebooks on cloud GPUs with 2-click setup"
- ❌ "Easily run notebooks in the cloud"

### 5. Address User Questions

- Why do I need this?
- What will I be able to do?
- How does this help me?

## Button Syntax Reference

Buttons are created using Markdown syntax on their own line:

```markdown
[Button Text](command:commandId)
```

The button text should:

- Start with an action verb
- Be concise (2-5 words)
- Clearly indicate what will happen

Examples:

- `[Login Now](command:datalayer.login)`
- `[Create Notebook](command:datalayer.newLocalDatalayerNotebook)`
- `[View Spaces](command:workbench.view.extension.datalayerSpaces)`

## Image Guidelines

### What Makes a Good Walkthrough Image?

1. **Contextual** - Shows the relevant UI or concept
2. **Clear** - Not cluttered, focuses on one thing
3. **Theme-Aware** - Works in both light and dark mode
4. **Sized Appropriately** - 600x400px for consistency
5. **Rounded corners and shadows** - Modern VS Code style

### Image Format Priority

1. **SVG** (Best) - Use VS Code theme color variables for automatic theme support
2. **PNG** (Acceptable) - Use neutral colors that work in both themes

### SVG Theme Colors to Use

Common VS Code theme colors for SVG:

- `var(--vscode-foreground)` - Text color
- `var(--vscode-button-background)` - Primary action color
- `var(--vscode-button-secondaryBackground)` - Secondary button fill
- `var(--vscode-button-secondaryForeground)` - Secondary button text
- `var(--vscode-button-border)` - Button borders
- `var(--vscode-editor-background)` - Editor background
- `var(--vscode-sideBar-background)` - Sidebar background
- `var(--vscode-panel-border)` - Panel borders
- `var(--vscode-descriptionForeground)` - Secondary text

### SVG Shadow and Rounded Corner Template

All walkthrough SVGs should use:

```xml
<!-- Outer shadow filter -->
<filter id="screenshotShadow" x="-10%" y="-10%" width="120%" height="120%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
  <feOffset dx="0" dy="4" result="offsetblur"/>
  <feComponentTransfer>
    <feFuncA type="linear" slope="0.25"/>
  </feComponentTransfer>
  <feMerge>
    <feMergeNode/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>

<!-- Apply to entire image -->
<g filter="url(#screenshotShadow)">
  <rect x="10" y="10" width="580" height="380" rx="12"
        fill="var(--vscode-editor-background)"
        stroke="var(--vscode-panel-border)"
        stroke-width="1" />
  <!-- Content here -->
</g>
```

### Figma Plugin

Use the **Visual Studio Code Color Mapper** Figma plugin to convert your designs to themed SVGs automatically.

## Markdown Formatting

Descriptions support basic Markdown:

✅ **Supported**:

- **Bold text** using `**bold**`
- *Italic text* using `*italic*`
- `Code snippets` using backticks
- [Links](https://example.com) using `[text](url)`
- Command links using `[text](command:id)`

❌ **Not Supported**:

- Headers
- Complex lists
- Tables
- Images in descriptions (use media field)

## Accessibility Requirements

### Alt Text Guidelines

Every image needs descriptive alt text. Write as if describing to someone who can't see the image:

✅ **Good Alt Text**:

- "Screenshot of Datalayer login dialog showing email and password fields with a blue Login button"
- "Notebook editor interface displaying a code cell with Python code and a Run button in the toolbar"

❌ **Poor Alt Text**:

- "Login screen"
- "The interface"
- "Screenshot"

### Writing Accessible Descriptions

- Use clear, simple language
- Avoid jargon when possible
- Spell out acronyms on first use
- Use descriptive link text (not "click here")

## Maintenance Guidelines

When updating walkthrough content:

1. **Update both files**: Modify [CONTENT.md](./CONTENT.md) and [package.json](../../../package.json) to keep them synchronized
2. **Keep descriptions concise**: 2-3 sentences maximum per step
3. **Use action-oriented language**: Start with action verbs, explain benefits
4. **Maintain VS Code theme compatibility**: Use CSS variables in SVGs
5. **Test in Extension Development Host**: Press F5 to test walkthrough appearance
6. **Follow accessibility standards**: Provide descriptive alt text for all images

## Resources

- [VS Code Walkthrough UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/walkthroughs)
- [Getting Started Sample Extension](https://github.com/microsoft/vscode-extension-samples/tree/main/getting-started-sample)
- [VS Code Theme Colors Reference](https://code.visualstudio.com/api/references/theme-color)
- [Actual Walkthrough Content](./CONTENT.md)
