import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@/types";
import { SUB2API_USAGE_TEMPLATE } from "@/config/sub2apiUsageTemplate";

const mocks = vi.hoisted(() => ({
  testScript: vi.fn(),
  onClose: vi.fn(),
  onSave: vi.fn(),
}));

vi.mock("@/lib/query", () => ({
  useSettingsQuery: () => ({ data: { usageConfirmed: true } }),
}));

vi.mock("@/lib/api", () => ({
  usageApi: { testScript: mocks.testScript },
  settingsApi: { save: vi.fn() },
}));

vi.mock("@/lib/api/copilot", () => ({
  copilotGetUsage: vi.fn(),
  copilotGetUsageForAccount: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/common/FullScreenPanel", () => ({
  FullScreenPanel: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen: boolean;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    isOpen ? (
      <div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

vi.mock("@/components/JsonEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="usage-code-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import UsageScriptModal from "@/components/UsageScriptModal";

const provider: Provider = {
  id: "sub2api-provider",
  name: "Sub2API",
  category: "custom",
  settingsConfig: {
    env: {
      ANTHROPIC_AUTH_TOKEN: "sk-provider",
      ANTHROPIC_BASE_URL: "https://sub2api.example.com/v1",
    },
  },
  meta: {
    usage_script: {
      enabled: true,
      language: "javascript",
      code: "({ request: {}, extractor: function() { return {}; } })",
      timeout: 10,
      templateType: "general",
    },
  },
};

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsageScriptModal
        provider={provider}
        appId="claude"
        isOpen
        onClose={mocks.onClose}
        onSave={mocks.onSave}
      />
    </QueryClientProvider>,
  );
}

describe("UsageScriptModal Sub2API preset", () => {
  beforeEach(() => {
    mocks.testScript.mockReset();
    mocks.onClose.mockReset();
    mocks.onSave.mockReset();
  });

  it("selects and saves the built-in script with provider credential fallbacks", () => {
    renderModal();

    fireEvent.click(
      screen.getByRole("button", { name: "usageScript.templateSub2API" }),
    );

    expect(screen.getByLabelText("usage-code-editor")).toHaveValue(
      SUB2API_USAGE_TEMPLATE,
    );
    expect(
      screen.getByPlaceholderText("usageScript.apiKeyPlaceholder"),
    ).toHaveValue("");
    expect(
      screen.getByPlaceholderText("usageScript.baseUrlPlaceholder"),
    ).toHaveValue("");

    fireEvent.click(
      screen.getByRole("button", { name: "usageScript.saveConfig" }),
    );

    expect(mocks.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        code: SUB2API_USAGE_TEMPLATE,
        templateType: "sub2api",
      }),
    );
    const savedScript = mocks.onSave.mock.calls[0][0];
    expect(savedScript).not.toHaveProperty("apiKey");
    expect(savedScript).not.toHaveProperty("baseUrl");
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
  });

  it("tests the Sub2API script through the generic script API", async () => {
    mocks.testScript.mockResolvedValue({
      success: true,
      data: [{ planName: "Wallet", remaining: 12, unit: "USD" }],
    });
    renderModal();

    fireEvent.click(
      screen.getByRole("button", { name: "usageScript.templateSub2API" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "usageScript.testScript" }),
    );

    await waitFor(() => expect(mocks.testScript).toHaveBeenCalledTimes(1));
    expect(mocks.testScript).toHaveBeenCalledWith(
      provider.id,
      "claude",
      SUB2API_USAGE_TEMPLATE,
      10,
      undefined,
      undefined,
      undefined,
      undefined,
      "sub2api",
    );
  });
});
