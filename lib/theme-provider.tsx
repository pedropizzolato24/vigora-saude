import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { getUserInfo, subscribeActiveUser } from "@/lib/_core/auth";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Tema é POR CONTA (feedback do beta): cada usuário guarda o seu, chaveado pelo
// openId. Deslogado (ou sem preferência salva), o padrão é o modo CLARO —
// público 60+ com o modo escuro do sistema ligado abria o app escuro no
// primeiro uso (item 3.2 do feedback de testes). Quem quiser escuro liga na
// tela de aparência; a escolha de uma conta não vaza para a próxima.
const THEME_KEY_PREFIX = 'vigora_theme_pref';
const DEFAULT_SCHEME: ColorScheme = 'light';
function themeKeyFor(openId: string | null): string | null {
  return openId ? `${THEME_KEY_PREFIX}:${openId}` : null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(DEFAULT_SCHEME);
  // openId da conta ativa (null = deslogado). Em ref para o setColorScheme gravar
  // sob a chave certa sem virar dependência do callback.
  const activeOpenId = useRef<string | null>(null);

  const applyScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  // Aplica o tema da conta (openId): a preferência salva dela ou, se não houver,
  // o padrão claro. Deslogado (openId null) também fica no claro.
  const loadThemeForUser = useCallback(async (openId: string | null) => {
    activeOpenId.current = openId;
    const key = themeKeyFor(openId);
    let next: ColorScheme = DEFAULT_SCHEME;
    if (key) {
      try {
        const saved = await AsyncStorage.getItem(key);
        if (saved === 'dark' || saved === 'light') next = saved;
      } catch {
        // segue o sistema em caso de erro de leitura
      }
    }
    applyScheme(next);
  }, [applyScheme]);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    applyScheme(scheme);
    // Só é chamado quando logado (a tela de aparência exige login). Persiste sob a
    // chave da conta ativa; sem conta, não há o que salvar.
    const key = themeKeyFor(activeOpenId.current);
    if (key) AsyncStorage.setItem(key, scheme).catch(() => {});
  }, [applyScheme]);

  // Descobre a conta ativa no mount e reage a login/logout (subscribeActiveUser).
  useEffect(() => {
    let mounted = true;
    (async () => {
      const user = await getUserInfo().catch(() => null);
      if (mounted) await loadThemeForUser(user?.openId ?? null);
    })();
    const unsubscribe = subscribeActiveUser((openId) => {
      loadThemeForUser(openId);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadThemeForUser]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
    }),
    [colorScheme, setColorScheme],
  );


  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
