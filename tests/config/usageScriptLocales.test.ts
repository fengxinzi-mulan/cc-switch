import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import ja from "@/i18n/locales/ja.json";
import zhTW from "@/i18n/locales/zh-TW.json";
import zh from "@/i18n/locales/zh.json";

describe("usage script locale coverage", () => {
  it.each([
    ["en", en],
    ["ja", ja],
    ["zh", zh],
    ["zh-TW", zhTW],
  ])("defines the Sub2API template name in %s", (_name, locale) => {
    expect(locale.usageScript.templateSub2API).toBe("Sub2API");
  });
});
