import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows installer configuration", () => {
  it("keeps per-user destinations while elevating MSI file operations", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src-tauri/wix/per-user-main.wxs"),
      "utf8",
    );

    expect(template).toMatch(/InstallScope="perUser"/);
    expect(template).toMatch(/InstallPrivileges="elevated"/);
    expect(template).not.toMatch(/InstallPrivileges="limited"/);
  });
});
