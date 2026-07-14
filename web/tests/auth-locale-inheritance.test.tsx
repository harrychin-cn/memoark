import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
  getLocaleWithFallback: vi.fn(),
  listShortcuts: vi.fn(),
  listUserSettings: vi.fn(),
  navigateTo: vi.fn(),
  refreshAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  signIn: vi.fn(),
  updateUserSetting: vi.fn(),
}));

vi.mock("@/auth-state", () => ({
  clearAccessToken: mocks.clearAccessToken,
  getAccessToken: mocks.getAccessToken,
  setAccessToken: mocks.setAccessToken,
}));

vi.mock("@/connect", () => ({
  authServiceClient: {
    getCurrentUser: mocks.getCurrentUser,
    signIn: mocks.signIn,
  },
  refreshAccessToken: mocks.refreshAccessToken,
  shortcutServiceClient: {
    listShortcuts: mocks.listShortcuts,
  },
  userServiceClient: {
    listUserSettings: mocks.listUserSettings,
    updateUserSetting: mocks.updateUserSetting,
  },
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ profile: { demo: false } }),
}));

vi.mock("@/hooks/useNavigateTo", () => ({
  default: () => mocks.navigateTo,
}));

vi.mock("@/utils/i18n", () => ({
  getLocaleWithFallback: mocks.getLocaleWithFallback,
  isValidLocale: (locale: string | undefined) => locale === "en" || locale === "zh-Hans",
  useTranslate: () => (key: string) => key,
}));

import PasswordSignInForm from "@/components/PasswordSignInForm";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const currentUser = {
  name: "users/alice",
  username: "alice",
};

const serverGeneralSetting = {
  locale: "en",
  memoVisibility: "PRIVATE",
  theme: "paper",
};

const TestProviders = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

const AuthStateProbe = ({ preferredLocale }: { preferredLocale?: string }) => {
  const { initialize, isInitialized, userGeneralSetting } = useAuth();

  return (
    <div>
      <button type="button" onClick={() => initialize(preferredLocale)}>
        initialize
      </button>
      <span data-testid="initialized">{String(isInitialized)}</span>
      <span data-testid="locale">{userGeneralSetting?.locale ?? "unset"}</span>
    </div>
  );
};

describe("authentication locale inheritance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue("access-token");
    mocks.getCurrentUser.mockResolvedValue({ user: currentUser });
    mocks.getLocaleWithFallback.mockReturnValue("zh-Hans");
    mocks.listShortcuts.mockResolvedValue({ shortcuts: [] });
    mocks.listUserSettings.mockResolvedValue({
      settings: [
        {
          value: {
            case: "generalSetting",
            value: serverGeneralSetting,
          },
        },
      ],
    });
    mocks.signIn.mockResolvedValue({ accessToken: "access-token" });
    mocks.updateUserSetting.mockImplementation(async ({ setting }) => ({
      ...setting,
      value: {
        case: "generalSetting",
        value: {
          ...serverGeneralSetting,
          locale: setting.value.value.locale,
        },
      },
    }));
  });

  it("persists the locale selected on the password sign-in screen before rendering the authenticated UI", async () => {
    render(
      <TestProviders>
        <PasswordSignInForm />
        <AuthStateProbe />
      </TestProviders>,
    );

    fireEvent.change(screen.getByPlaceholderText("common.username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("common.password"), { target: { value: "secret" } });
    fireEvent.submit(screen.getByRole("button", { name: "common.sign-in" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("zh-Hans"));

    expect(mocks.getLocaleWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.updateUserSetting).toHaveBeenCalledTimes(1);
    const request = mocks.updateUserSetting.mock.calls[0][0];
    expect(request.setting.name).toBe("users/alice/settings/GENERAL");
    expect(request.setting.value).toMatchObject({
      case: "generalSetting",
      value: { locale: "zh-Hans" },
    });
    expect(request.updateMask.paths).toEqual(["locale"]);
    expect(mocks.navigateTo).toHaveBeenCalledWith("/", { replace: true });
  });

  it("keeps the account locale on ordinary session restoration", async () => {
    render(
      <TestProviders>
        <AuthStateProbe />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "initialize" }));

    await waitFor(() => expect(screen.getByTestId("initialized")).toHaveTextContent("true"));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(mocks.updateUserSetting).not.toHaveBeenCalled();
  });

  it("ignores an invalid authentication locale", async () => {
    render(
      <TestProviders>
        <AuthStateProbe preferredLocale="not-a-locale" />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "initialize" }));

    await waitFor(() => expect(screen.getByTestId("initialized")).toHaveTextContent("true"));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(mocks.updateUserSetting).not.toHaveBeenCalled();
  });
});
