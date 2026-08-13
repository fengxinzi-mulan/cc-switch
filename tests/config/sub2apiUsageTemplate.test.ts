import { describe, expect, it } from "vitest";
import { SUB2API_USAGE_TEMPLATE } from "@/config/sub2apiUsageTemplate";

interface Sub2APIConfig {
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
  extractor: (response: Record<string, any>) => Record<string, any> | any[];
}

function instantiate(
  baseUrl = "https://sub2api.example.com",
  apiKey = "sk-sub2api-test",
): Sub2APIConfig {
  const source = SUB2API_USAGE_TEMPLATE.split("{{baseUrl}}")
    .join(baseUrl)
    .split("{{apiKey}}")
    .join(apiKey);
  return Function(`"use strict"; return ${source};`)() as Sub2APIConfig;
}

function asPlans(value: Record<string, any> | any[]): Record<string, any>[] {
  return Array.isArray(value) ? value : [value];
}

function expectedLocalTime(value: string | number): string {
  const timestamp =
    typeof value === "number" && Math.abs(value) < 100_000_000_000
      ? value * 1000
      : value;
  const date = new Date(timestamp);
  const pad = (number: number) => String(number).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

describe("Sub2API usage template", () => {
  it.each([
    ["https://sub2api.example.com", "https://sub2api.example.com/v1/usage"],
    ["https://sub2api.example.com/", "https://sub2api.example.com/v1/usage"],
    ["https://sub2api.example.com/v1", "https://sub2api.example.com/v1/usage"],
    [
      "https://sub2api.example.com/v1beta",
      "https://sub2api.example.com/v1/usage",
    ],
    [
      "https://sub2api.example.com/antigravity",
      "https://sub2api.example.com/antigravity/v1/usage",
    ],
    [
      "https://sub2api.example.com/antigravity/v1",
      "https://sub2api.example.com/antigravity/v1/usage",
    ],
  ])("builds the usage endpoint from %s", (baseUrl, expected) => {
    const config = instantiate(baseUrl);

    expect(config.request).toEqual({
      url: expected,
      method: "GET",
      headers: {
        Authorization: "Bearer sk-sub2api-test",
        "User-Agent": "cc-switch/1.0",
      },
    });
  });

  it("maps API-key quota and rate-limit windows", () => {
    const result = asPlans(
      instantiate().extractor({
        mode: "quota_limited",
        isValid: true,
        quota: { limit: 50, used: 12.5, remaining: 37.5, unit: "USD" },
        rate_limits: [
          {
            window: "5h",
            limit: 10,
            used: 3,
            remaining: 7,
            reset_at: "2026-08-14T00:00:00Z",
          },
        ],
        expires_at: "2026-09-01T00:00:00Z",
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        planName: "API Key",
        total: 50,
        used: 12.5,
        remaining: 37.5,
        unit: "USD",
        isValid: true,
        extra: `Expires: ${expectedLocalTime("2026-09-01T00:00:00Z")}`,
      }),
      expect.objectContaining({
        planName: "API Key / 5h",
        total: 10,
        used: 3,
        remaining: 7,
        extra:
          `Reset: ${expectedLocalTime("2026-08-14T00:00:00Z")} / ` +
          `Expires: ${expectedLocalTime("2026-09-01T00:00:00Z")}`,
      }),
    ]);
  });

  it("formats ISO and Unix timestamps in the machine's local timezone", () => {
    const unixSeconds = 1_787_872_400;
    const result = asPlans(
      instantiate().extractor({
        isValid: true,
        quota: { limit: 10, used: 1, remaining: 9, unit: "USD" },
        expires_at: unixSeconds,
        rate_limits: [
          {
            window: "1d",
            limit: 5,
            used: 1,
            remaining: 4,
            reset_at: "not-a-standard-date",
          },
        ],
      }),
    );

    expect(result[0].extra).toBe(`Expires: ${expectedLocalTime(unixSeconds)}`);
    expect(result[1].extra).toBe(
      `Reset: not-a-standard-date / Expires: ${expectedLocalTime(unixSeconds)}`,
    );
  });

  it("maps rate-only API keys without requiring a top-level balance", () => {
    expect(
      asPlans(
        instantiate().extractor({
          mode: "quota_limited",
          isValid: true,
          unit: "USD",
          rate_limits: [{ window: "1d", limit: 20, used: 4, remaining: 16 }],
        }),
      ),
    ).toEqual([
      {
        planName: "API Key / 1d",
        isValid: true,
        total: 20,
        used: 4,
        remaining: 16,
        unit: "USD",
      },
    ]);
  });

  it("maps every configured subscription window", () => {
    const result = asPlans(
      instantiate().extractor({
        mode: "unrestricted",
        isValid: true,
        planName: "Claude Team",
        unit: "USD",
        subscription: {
          daily_usage_usd: 2,
          weekly_usage_usd: 11,
          monthly_usage_usd: 35,
          daily_limit_usd: 10,
          weekly_limit_usd: 50,
          monthly_limit_usd: 100,
          expires_at: "2026-09-01T00:00:00Z",
        },
      }),
    );

    expect(
      result.map(({ planName, total, used, remaining }) => ({
        planName,
        total,
        used,
        remaining,
      })),
    ).toEqual([
      { planName: "Claude Team / daily", total: 10, used: 2, remaining: 8 },
      { planName: "Claude Team / weekly", total: 50, used: 11, remaining: 39 },
      {
        planName: "Claude Team / monthly",
        total: 100,
        used: 35,
        remaining: 65,
      },
    ]);
  });

  it("maps wallet responses and preserves invalid status", () => {
    expect(
      instantiate().extractor({
        mode: "unrestricted",
        isValid: true,
        planName: "Wallet",
        balance: 18.25,
        unit: "USD",
      }),
    ).toEqual({
      planName: "Wallet",
      isValid: true,
      remaining: 18.25,
      unit: "USD",
    });

    expect(
      instantiate().extractor({
        isValid: false,
        status: "disabled",
        remaining: 0,
        unit: "USD",
      }),
    ).toEqual({
      planName: "Sub2API",
      isValid: false,
      invalidMessage: "disabled",
      remaining: 0,
      unit: "USD",
    });
  });
});
