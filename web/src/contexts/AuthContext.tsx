import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { clearAccessToken, getAccessToken } from "@/auth-state";
import { authServiceClient, refreshAccessToken, shortcutServiceClient, userServiceClient } from "@/connect";
import { buildUserSettingName } from "@/helpers/resource-names";
import { userKeys } from "@/hooks/useUserQueries";
import type { Shortcut } from "@/types/proto/api/v1/shortcut_service_pb";
import {
  type User,
  type UserSetting_GeneralSetting,
  UserSetting_GeneralSettingSchema,
  UserSetting_Key,
  type UserSetting_WebhooksSetting,
  UserSettingSchema,
} from "@/types/proto/api/v1/user_service_pb";
import { isValidLocale } from "@/utils/i18n";

interface AuthState {
  currentUser: User | undefined;
  userGeneralSetting: UserSetting_GeneralSetting | undefined;
  userWebhooksSetting: UserSetting_WebhooksSetting | undefined;
  shortcuts: Shortcut[];
  isInitialized: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  initialize: (preferredLocale?: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchSettings: () => Promise<void>;
  setCurrentUser: (user: User | undefined) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    currentUser: undefined,
    userGeneralSetting: undefined,
    userWebhooksSetting: undefined,
    shortcuts: [],
    isInitialized: false,
    isLoading: true,
  });

  const fetchUserSettings = useCallback(async (userName: string) => {
    const [{ settings }, { shortcuts }] = await Promise.all([
      userServiceClient.listUserSettings({ parent: userName }),
      shortcutServiceClient.listShortcuts({ parent: userName }),
    ]);

    const generalSetting = settings.find((s) => s.value.case === "generalSetting");
    const webhooksSetting = settings.find((s) => s.value.case === "webhooksSetting");

    return {
      userGeneralSetting: generalSetting?.value.case === "generalSetting" ? generalSetting.value.value : undefined,
      userWebhooksSetting: webhooksSetting?.value.case === "webhooksSetting" ? webhooksSetting.value.value : undefined,
      shortcuts,
    };
  }, []);

  const initialize = useCallback(
    async (preferredLocale?: string) => {
      setState((prev) => ({ ...prev, isLoading: true }));

      // Try to get or refresh the access token.
      // This handles PWA isolated storage scenarios (e.g., iOS Safari) where localStorage
      // may be empty but a valid HTTP-only refresh token cookie still exists.
      // getAccessToken() returns a cached token or loads from localStorage if valid.
      if (!getAccessToken()) {
        try {
          await refreshAccessToken();
        } catch {
          // Refresh failed - no valid session
        }
      }

      // If we still don't have a token after refresh attempt, skip getCurrentUser call
      // to avoid unnecessary network request for unauthenticated users.
      if (!getAccessToken()) {
        setState({
          currentUser: undefined,
          userGeneralSetting: undefined,
          userWebhooksSetting: undefined,
          shortcuts: [],
          isInitialized: true,
          isLoading: false,
        });
        return;
      }

      try {
        const { user: currentUser } = await authServiceClient.getCurrentUser({});

        if (!currentUser) {
          clearAccessToken();
          setState({
            currentUser: undefined,
            userGeneralSetting: undefined,
            userWebhooksSetting: undefined,
            shortcuts: [],
            isInitialized: true,
            isLoading: false,
          });
          return;
        }

        let settings = await fetchUserSettings(currentUser.name);

        // An explicit locale selected on the authentication screen should become
        // the signed-in user's preference before locale-reactive UI is rendered.
        // Ordinary session restoration does not pass this override and continues
        // to respect the preference already stored on the account.
        if (isValidLocale(preferredLocale) && settings.userGeneralSetting?.locale !== preferredLocale) {
          const preferredGeneralSetting = create(UserSetting_GeneralSettingSchema, {
            locale: preferredLocale,
            memoVisibility: settings.userGeneralSetting?.memoVisibility,
            theme: settings.userGeneralSetting?.theme,
          });

          try {
            const updatedSetting = await userServiceClient.updateUserSetting({
              setting: create(UserSettingSchema, {
                name: buildUserSettingName(currentUser.name, UserSetting_Key.GENERAL),
                value: {
                  case: "generalSetting",
                  value: preferredGeneralSetting,
                },
              }),
              updateMask: create(FieldMaskSchema, { paths: ["locale"] }),
            });
            settings = {
              ...settings,
              userGeneralSetting: updatedSetting.value.case === "generalSetting" ? updatedSetting.value.value : preferredGeneralSetting,
            };
          } catch (error) {
            // Locale persistence must not turn a successful authentication into a
            // failed login. Keep the selected locale for this session and retry via
            // the normal preferences UI if the settings endpoint is unavailable.
            console.error("Failed to persist locale selected during authentication:", error);
            settings = { ...settings, userGeneralSetting: preferredGeneralSetting };
          }
        }

        setState({
          currentUser,
          ...settings,
          isInitialized: true,
          isLoading: false,
        });

        // Pre-populate React Query cache
        queryClient.setQueryData(userKeys.currentUser(), currentUser);
        queryClient.setQueryData(userKeys.detail(currentUser.name), currentUser);
      } catch (error) {
        console.error("Failed to initialize auth:", error);
        clearAccessToken();
        setState({
          currentUser: undefined,
          userGeneralSetting: undefined,
          userWebhooksSetting: undefined,
          shortcuts: [],
          isInitialized: true,
          isLoading: false,
        });
      }
    },
    [fetchUserSettings, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authServiceClient.signOut({});
    } catch (error) {
      console.error("[AuthContext] Failed to sign out:", error);
    } finally {
      clearAccessToken();
      setState({
        currentUser: undefined,
        userGeneralSetting: undefined,
        userWebhooksSetting: undefined,
        shortcuts: [],
        isInitialized: true,
        isLoading: false,
      });
      queryClient.clear();
    }
  }, [queryClient]);

  const refetchSettings = useCallback(async () => {
    const currentUserName = state.currentUser?.name;
    if (!currentUserName) {
      return;
    }

    const settings = await fetchUserSettings(currentUserName);
    setState((prev) => {
      if (prev.currentUser?.name !== currentUserName) {
        return prev;
      }
      return { ...prev, ...settings };
    });
  }, [fetchUserSettings, state.currentUser?.name]);

  // Sync the updated user to AuthContext and React Query cache after profile changes
  const setCurrentUser = useCallback(
    (user: User | undefined) => {
      const previousUser = queryClient.getQueryData<User>(userKeys.currentUser());
      setState((prev) => ({ ...prev, currentUser: user }));
      if (user) {
        queryClient.setQueryData(userKeys.currentUser(), user);
        queryClient.setQueryData(userKeys.detail(user.name), user);
      } else {
        queryClient.removeQueries({ queryKey: userKeys.currentUser(), exact: true });
        if (previousUser?.name) {
          queryClient.removeQueries({ queryKey: userKeys.detail(previousUser.name), exact: true });
        }
      }
    },
    [queryClient],
  );

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({
      ...state,
      initialize,
      logout,
      refetchSettings,
      setCurrentUser,
    }),
    [state, initialize, logout, refetchSettings, setCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Convenience hook for just the current user
export function useCurrentUserFromAuth() {
  const { currentUser } = useAuth();
  return currentUser;
}
