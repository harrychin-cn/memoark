import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listIdentityProviders: vi.fn(),
}));

const state = vi.hoisted(() => ({
  generalSetting: {
    customProfile: undefined as { logoUrl?: string; title?: string } | undefined,
    disallowPasswordAuth: true,
    disallowUserRegistration: false,
  },
}));

vi.mock("@/components/AuthFooter", () => ({
  default: () => null,
}));

vi.mock("@/components/PasswordSignInForm", () => ({
  default: () => <div data-testid="password-sign-in" />,
}));

vi.mock("@/connect", () => ({
  identityProviderServiceClient: {
    listIdentityProviders: mocks.listIdentityProviders,
  },
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ generalSetting: state.generalSetting }),
}));

vi.mock("@/helpers/utils", () => ({
  absolutifyLink: (path: string) => path,
}));

vi.mock("@/lib/error", () => ({
  handleError: vi.fn(),
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, values?: { provider?: string }) => (values?.provider ? `${key}: ${values.provider}` : key),
}));

vi.mock("@/utils/oauth", () => ({
  storeOAuthState: vi.fn(),
}));

import SignIn from "@/pages/SignIn";

function createDeferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignIn />
    </MemoryRouter>,
  );

describe("<SignIn>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.generalSetting.disallowPasswordAuth = true;
    state.generalSetting.disallowUserRegistration = false;
  });

  it("waits for identity providers before showing the password-auth-disabled state", async () => {
    const response = createDeferred<{ identityProviders: Array<{ name: string; title: string }> }>();
    mocks.listIdentityProviders.mockReturnValueOnce(response.promise);

    const { container } = renderPage();

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("Password auth is not allowed.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("password-sign-in")).not.toBeInTheDocument();

    response.resolve({
      identityProviders: [{ name: "identity-providers/acme", title: "Acme SSO" }],
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "common.sign-in-with: Acme SSO" })).toBeInTheDocument());
    expect(screen.queryByText("Password auth is not allowed.")).not.toBeInTheDocument();
  });

  it("shows the password-auth-disabled state only after an empty provider response", async () => {
    mocks.listIdentityProviders.mockResolvedValueOnce({ identityProviders: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText("Password auth is not allowed.")).toBeInTheDocument());
  });

  it("shows password sign-in immediately when password auth is allowed", () => {
    const response = createDeferred<{ identityProviders: Array<{ name: string; title: string }> }>();
    mocks.listIdentityProviders.mockReturnValueOnce(response.promise);
    state.generalSetting.disallowPasswordAuth = false;

    const { container } = renderPage();

    expect(screen.getByTestId("password-sign-in")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });
});
