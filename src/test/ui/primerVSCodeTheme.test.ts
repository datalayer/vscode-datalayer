/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Tests for Primer VS Code theme CSS generation.
 * Validates that CSS variable mappings are correctly generated.
 */

import * as assert from "assert";

import { getPrimerVSCodeThemeCSS } from "../../ui/styles/primerVSCodeTheme";

suite("Primer VS Code Theme Tests", () => {
  test("returns a non-empty CSS string", () => {
    const css = getPrimerVSCodeThemeCSS();

    assert.ok(css.length > 0);
    assert.ok(typeof css === "string");
  });

  test("includes :root selector", () => {
    const css = getPrimerVSCodeThemeCSS();

    assert.ok(css.includes(":root"), "Should contain :root selector");
  });

  suite("base color mappings", () => {
    test("maps bgColor-default to vscode-editor-background", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--bgColor-default"));
      assert.ok(css.includes("var(--vscode-editor-background)"));
    });

    test("maps fgColor-default to vscode-editor-foreground", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--fgColor-default"));
      assert.ok(css.includes("var(--vscode-editor-foreground)"));
    });

    test("maps fgColor-muted to vscode-descriptionForeground", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--fgColor-muted"));
      assert.ok(css.includes("var(--vscode-descriptionForeground)"));
    });

    test("maps borderColor-default to vscode-panel-border", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--borderColor-default"));
      assert.ok(css.includes("var(--vscode-panel-border)"));
    });
  });

  suite("button variant mappings", () => {
    test("includes primary button variables", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--button-primary-bgColor-rest"));
      assert.ok(css.includes("--button-primary-bgColor-hover"));
      assert.ok(css.includes("--button-primary-fgColor-rest"));
    });

    test("includes default button variables", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--button-default-bgColor-rest"));
      assert.ok(css.includes("--button-default-fgColor-rest"));
    });

    test("includes danger button variables", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--button-danger-bgColor-rest"));
      assert.ok(css.includes("--button-danger-fgColor-rest"));
    });
  });

  suite("form control mappings", () => {
    test("includes control background variable", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--control-bgColor-rest"));
      assert.ok(css.includes("var(--vscode-input-background)"));
    });

    test("includes control foreground variable", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--control-fgColor-rest"));
      assert.ok(css.includes("var(--vscode-input-foreground)"));
    });

    test("includes control border variable", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--control-borderColor-rest"));
      assert.ok(css.includes("var(--vscode-input-border)"));
    });

    test("includes placeholder color variable", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--control-fgColor-placeholder"));
      assert.ok(css.includes("var(--vscode-input-placeholderForeground)"));
    });
  });

  suite("border radius overrides", () => {
    test("sets small border radius to 2px", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--borderRadius-small: 2px"));
    });

    test("sets medium border radius to 2px", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--borderRadius-medium: 2px"));
    });
  });

  suite("flash/banner color mappings", () => {
    test("includes success color variables", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--bgColor-success-muted"));
      assert.ok(css.includes("--fgColor-success"));
    });

    test("includes danger color variables", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--bgColor-danger-muted"));
      assert.ok(css.includes("--fgColor-danger"));
    });

    test("includes attention color variables", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("--bgColor-attention-muted"));
      assert.ok(css.includes("--fgColor-attention"));
    });
  });

  suite("form element styling", () => {
    test("includes input element styling", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes('input[type="text"]'));
    });

    test("includes textarea styling", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("textarea"));
    });

    test("includes select styling", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("select"));
    });

    test("includes focus state styling", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes(":focus"));
      assert.ok(css.includes("var(--vscode-focusBorder)"));
    });

    test("includes placeholder styling", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes("::placeholder"));
      assert.ok(css.includes("var(--vscode-input-placeholderForeground)"));
    });
  });

  suite("Primer component overrides", () => {
    test("includes TextInput-wrapper override", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes(".TextInput-wrapper"));
    });

    test("includes FormControl overrides", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes(".FormControl"));
      assert.ok(css.includes(".FormControl-label"));
      assert.ok(css.includes(".FormControl-caption"));
    });

    test("includes Flash component override", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes(".Flash"));
    });

    test("includes Button component overrides", () => {
      const css = getPrimerVSCodeThemeCSS();

      assert.ok(css.includes(".Button--primary"));
      assert.ok(css.includes(".Button--danger"));
    });
  });

  test("uses !important on critical overrides", () => {
    const css = getPrimerVSCodeThemeCSS();

    // Count occurrences of !important
    const importantCount = (css.match(/!important/g) || []).length;
    assert.ok(
      importantCount > 10,
      `Should have many !important declarations, found ${importantCount}`,
    );
  });

  test("returns same CSS on multiple calls", () => {
    const css1 = getPrimerVSCodeThemeCSS();
    const css2 = getPrimerVSCodeThemeCSS();

    assert.strictEqual(css1, css2, "CSS output should be deterministic");
  });
});
