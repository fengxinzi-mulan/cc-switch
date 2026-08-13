/**
 * Sub2API exposes this API-key-authenticated endpoint specifically for usage
 * clients. The extractor preserves quota, rate-limit, subscription, and wallet
 * shapes as one or more standard CC Switch usage plans.
 */
export const SUB2API_USAGE_TEMPLATE = `({
  request: {
    url: "{{baseUrl}}"
      .replace(/\\/+$/, "")
      .replace(/\\/v1(?:beta)?$/i, "") + "/v1/usage",
    method: "GET",
    headers: {
      "Authorization": "Bearer {{apiKey}}",
      "User-Agent": "cc-switch/1.0"
    }
  },
  extractor: function(response) {
    function formatLocalTime(value) {
      if (value === undefined || value === null || value === "") return undefined;
      var timestamp = value;
      if (typeof timestamp === "number" && Math.abs(timestamp) < 100000000000) {
        timestamp *= 1000;
      }
      var date = new Date(timestamp);
      if (isNaN(date.getTime())) return String(value);
      function pad(number) {
        return String(number).padStart(2, "0");
      }
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" +
        pad(date.getDate()) + " " + pad(date.getHours()) + ":" +
        pad(date.getMinutes());
    }

    var isValid = response.isValid ?? response.is_active ??
      (response.success !== false && !response.error);
    var unit = response.unit ?? response.quota?.unit ?? "USD";
    var invalidMessage = response.error?.message ?? response.message ?? response.status;
    var expiresAt = response.expires_at ?? response.subscription?.expires_at;
    var formattedExpiry = formatLocalTime(expiresAt);
    var expiryText = formattedExpiry ? "Expires: " + formattedExpiry : undefined;
    var plans = [];

    function appendPlan(planName, total, used, remaining, extra) {
      var plan = {
        planName: planName,
        isValid: isValid,
        unit: unit
      };
      if (!isValid && invalidMessage) plan.invalidMessage = String(invalidMessage);
      if (typeof total === "number") plan.total = total;
      if (typeof used === "number") plan.used = used;
      if (typeof remaining === "number") plan.remaining = remaining;
      if (extra) plan.extra = extra;
      plans.push(plan);
    }

    if (response.quota) {
      appendPlan(
        response.planName ?? "API Key",
        response.quota.limit,
        response.quota.used,
        response.quota.remaining,
        expiryText
      );
    }

    if (Array.isArray(response.rate_limits)) {
      response.rate_limits.forEach(function(limit) {
        var details = [];
        var formattedReset = formatLocalTime(limit.reset_at);
        if (formattedReset) details.push("Reset: " + formattedReset);
        if (expiryText) details.push(expiryText);
        appendPlan(
          (response.planName ?? "API Key") + " / " + limit.window,
          limit.limit,
          limit.used,
          limit.remaining,
          details.join(" / ") || undefined
        );
      });
    }

    if (response.subscription) {
      var subscription = response.subscription;
      [
        ["daily", subscription.daily_limit_usd, subscription.daily_usage_usd],
        ["weekly", subscription.weekly_limit_usd, subscription.weekly_usage_usd],
        ["monthly", subscription.monthly_limit_usd, subscription.monthly_usage_usd]
      ].forEach(function(window) {
        var limit = window[1];
        var used = window[2];
        if (typeof limit === "number" && limit > 0) {
          appendPlan(
            (response.planName ?? "Sub2API") + " / " + window[0],
            limit,
            used,
            typeof used === "number" ? Math.max(0, limit - used) : undefined,
            expiryText
          );
        }
      });
    }

    if (plans.length === 0) {
      appendPlan(
        response.planName ?? "Sub2API",
        undefined,
        undefined,
        response.remaining ?? response.balance ?? response.quota?.remaining,
        expiryText
      );
    }

    return plans.length === 1 ? plans[0] : plans;
  }
})`;
