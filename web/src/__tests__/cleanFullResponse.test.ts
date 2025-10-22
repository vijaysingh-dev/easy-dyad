import { cleanFullResponse } from "@/ipc/utils/cleanFullResponse";
import { describe, it, expect } from "vitest";

describe("cleanFullResponse", () => {
  it("should replace < characters in eezi-write attributes", () => {
    const input = `<eezi-write path="src/file.tsx" description="Testing <a> tags.">content</eezi-write>`;
    const expected = `<eezi-write path="src/file.tsx" description="Testing ＜a＞ tags.">content</eezi-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should replace < characters in multiple attributes", () => {
    const input = `<eezi-write path="src/<component>.tsx" description="Testing <div> tags.">content</eezi-write>`;
    const expected = `<eezi-write path="src/＜component＞.tsx" description="Testing ＜div＞ tags.">content</eezi-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle multiple nested HTML tags in a single attribute", () => {
    const input = `<eezi-write path="src/file.tsx" description="Testing <div> and <span> and <a> tags.">content</eezi-write>`;
    const expected = `<eezi-write path="src/file.tsx" description="Testing ＜div＞ and ＜span＞ and ＜a＞ tags.">content</eezi-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle complex example with mixed content", () => {
    const input = `
      BEFORE TAG
  <eezi-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</eezi-write>
AFTER TAG
    `;

    const expected = `
      BEFORE TAG
  <eezi-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use ＜a＞ tags.">
import React from 'react';
</eezi-write>
AFTER TAG
    `;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle other eezi tag types", () => {
    const input = `<eezi-rename from="src/<old>.tsx" to="src/<new>.tsx"></eezi-rename>`;
    const expected = `<eezi-rename from="src/＜old＞.tsx" to="src/＜new＞.tsx"></eezi-rename>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle eezi-delete tags", () => {
    const input = `<eezi-delete path="src/<component>.tsx"></eezi-delete>`;
    const expected = `<eezi-delete path="src/＜component＞.tsx"></eezi-delete>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should not affect content outside eezi tags", () => {
    const input = `Some text with <regular> HTML tags. <eezi-write path="test.tsx" description="With <nested> tags.">content</eezi-write> More <html> here.`;
    const expected = `Some text with <regular> HTML tags. <eezi-write path="test.tsx" description="With ＜nested＞ tags.">content</eezi-write> More <html> here.`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle empty attributes", () => {
    const input = `<eezi-write path="src/file.tsx">content</eezi-write>`;
    const expected = `<eezi-write path="src/file.tsx">content</eezi-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle attributes without < characters", () => {
    const input = `<eezi-write path="src/file.tsx" description="Normal description">content</eezi-write>`;
    const expected = `<eezi-write path="src/file.tsx" description="Normal description">content</eezi-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });
});
