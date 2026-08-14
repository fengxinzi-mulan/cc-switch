import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows installer configuration", () => {
  it("uses the WiX-compatible privilege level for a per-user MSI", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src-tauri/wix/per-user-main.wxs"),
      "utf8",
    );

    expect(template).toMatch(/InstallScope="perUser"/);
    expect(template).toMatch(/InstallPrivileges="limited"/);
    expect(template).not.toMatch(/InstallPrivileges="elevated"/);
  });
});
