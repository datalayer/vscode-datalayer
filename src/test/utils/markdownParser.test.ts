/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import * as assert from "assert";
import {
  extractMarkdownHeadings,
  buildHeadingHierarchy,
  parseMarkdownStructure,
  headingLevelToString,
} from "../../utils/markdownParser";

suite("Markdown Parser Tests", () => {
  suite("extractMarkdownHeadings", () => {
    test("extracts single H1 heading", () => {
      const text = "# Main Title";
      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 1);
      assert.strictEqual(headings[0].text, "Main Title");
      assert.strictEqual(headings[0].level, 1);
      assert.strictEqual(headings[0].offset, 0);
      assert.strictEqual(headings[0].line, 0);
    });

    test("extracts multiple headings at different levels", () => {
      const text = `# H1 Title
## H2 Subtitle
### H3 Section
## Another H2`;

      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 4);
      assert.strictEqual(headings[0].text, "H1 Title");
      assert.strictEqual(headings[0].level, 1);
      assert.strictEqual(headings[1].text, "H2 Subtitle");
      assert.strictEqual(headings[1].level, 2);
      assert.strictEqual(headings[2].text, "H3 Section");
      assert.strictEqual(headings[2].level, 3);
      assert.strictEqual(headings[3].text, "Another H2");
      assert.strictEqual(headings[3].level, 2);
    });

    test("handles headings with leading/trailing whitespace", () => {
      const text = "#   Title with spaces   ";
      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 1);
      assert.strictEqual(headings[0].text, "Title with spaces");
    });

    test("returns empty array for text with no headings", () => {
      const text = "Just some regular text\nwith no headings";
      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 0);
    });

    test("ignores headings not at line start", () => {
      const text = "Some text # Not a heading\n# Real heading";
      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 1);
      assert.strictEqual(headings[0].text, "Real heading");
    });

    test("handles all heading levels H1-H6", () => {
      const text = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;

      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 6);
      for (let i = 0; i < 6; i++) {
        assert.strictEqual(headings[i].level, i + 1);
      }
    });

    test("calculates correct line numbers", () => {
      const text = `Line 1
# Heading on line 2
Line 3
## Heading on line 4`;

      const headings = extractMarkdownHeadings(text);

      assert.strictEqual(headings.length, 2);
      assert.strictEqual(headings[0].line, 1);
      assert.strictEqual(headings[1].line, 3);
    });
  });

  suite("buildHeadingHierarchy", () => {
    test("builds simple hierarchy with H1 and H2", () => {
      const flat = [
        {
          text: "Main",
          level: 1,
          offset: 0,
          length: 7,
          line: 0,
          children: [],
        },
        {
          text: "Sub1",
          level: 2,
          offset: 8,
          length: 9,
          line: 1,
          children: [],
        },
        {
          text: "Sub2",
          level: 2,
          offset: 18,
          length: 9,
          line: 2,
          children: [],
        },
      ];

      const tree = buildHeadingHierarchy(flat);

      assert.strictEqual(tree.length, 1);
      assert.strictEqual(tree[0].text, "Main");
      assert.strictEqual(tree[0].children.length, 2);
      assert.strictEqual(tree[0].children[0].text, "Sub1");
      assert.strictEqual(tree[0].children[1].text, "Sub2");
    });

    test("builds multi-level hierarchy", () => {
      const flat = [
        {
          text: "H1",
          level: 1,
          offset: 0,
          length: 4,
          line: 0,
          children: [],
        },
        {
          text: "H2",
          level: 2,
          offset: 5,
          length: 5,
          line: 1,
          children: [],
        },
        {
          text: "H3",
          level: 3,
          offset: 11,
          length: 6,
          line: 2,
          children: [],
        },
      ];

      const tree = buildHeadingHierarchy(flat);

      assert.strictEqual(tree.length, 1);
      assert.strictEqual(tree[0].text, "H1");
      assert.strictEqual(tree[0].children.length, 1);
      assert.strictEqual(tree[0].children[0].text, "H2");
      assert.strictEqual(tree[0].children[0].children.length, 1);
      assert.strictEqual(tree[0].children[0].children[0].text, "H3");
    });

    test("handles multiple root-level headings", () => {
      const flat = [
        {
          text: "First H1",
          level: 1,
          offset: 0,
          length: 10,
          line: 0,
          children: [],
        },
        {
          text: "H2 under first",
          level: 2,
          offset: 11,
          length: 17,
          line: 1,
          children: [],
        },
        {
          text: "Second H1",
          level: 1,
          offset: 29,
          length: 11,
          line: 2,
          children: [],
        },
      ];

      const tree = buildHeadingHierarchy(flat);

      assert.strictEqual(tree.length, 2);
      assert.strictEqual(tree[0].text, "First H1");
      assert.strictEqual(tree[0].children.length, 1);
      assert.strictEqual(tree[1].text, "Second H1");
      assert.strictEqual(tree[1].children.length, 0);
    });

    test("handles empty array", () => {
      const tree = buildHeadingHierarchy([]);
      assert.strictEqual(tree.length, 0);
    });

    test("resets hierarchy when encountering same level", () => {
      const flat = [
        {
          text: "H2-1",
          level: 2,
          offset: 0,
          length: 7,
          line: 0,
          children: [],
        },
        {
          text: "H3",
          level: 3,
          offset: 8,
          length: 5,
          line: 1,
          children: [],
        },
        {
          text: "H2-2",
          level: 2,
          offset: 14,
          length: 7,
          line: 2,
          children: [],
        },
      ];

      const tree = buildHeadingHierarchy(flat);

      assert.strictEqual(tree.length, 2);
      assert.strictEqual(tree[0].text, "H2-1");
      assert.strictEqual(tree[0].children.length, 1);
      assert.strictEqual(tree[0].children[0].text, "H3");
      assert.strictEqual(tree[1].text, "H2-2");
      assert.strictEqual(tree[1].children.length, 0);
    });
  });

  suite("parseMarkdownStructure", () => {
    test("parses and builds hierarchy in one step", () => {
      const text = `# Main Title
## Subsection 1
### Detail
## Subsection 2`;

      const tree = parseMarkdownStructure(text);

      assert.strictEqual(tree.length, 1);
      assert.strictEqual(tree[0].text, "Main Title");
      assert.strictEqual(tree[0].level, 1);
      assert.strictEqual(tree[0].children.length, 2);
      assert.strictEqual(tree[0].children[0].text, "Subsection 1");
      assert.strictEqual(tree[0].children[0].children.length, 1);
      assert.strictEqual(tree[0].children[0].children[0].text, "Detail");
      assert.strictEqual(tree[0].children[1].text, "Subsection 2");
    });

    test("returns empty array for text with no headings", () => {
      const text = "Just plain text\nNo headings here";
      const tree = parseMarkdownStructure(text);

      assert.strictEqual(tree.length, 0);
    });
  });

  suite("headingLevelToString", () => {
    test("converts level 1 to H1", () => {
      assert.strictEqual(headingLevelToString(1), "H1");
    });

    test("converts level 6 to H6", () => {
      assert.strictEqual(headingLevelToString(6), "H6");
    });

    test("converts all levels 1-6", () => {
      for (let i = 1; i <= 6; i++) {
        assert.strictEqual(headingLevelToString(i), `H${i}`);
      }
    });
  });
});
