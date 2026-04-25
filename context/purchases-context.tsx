/**
 * context/purchases-context.tsx
 * Contexto global de assinatura do RevenueCat para o Vigora Saúde.
 *
 * Fornece:
 * - isPro: boolean — se o usuário tem acesso ao "Vigora Saúde Pro"
 * - customerInfo: CustomerInfo | null — dados completos do cliente
 * - currentOffering: PurchasesOffering | null — planos disponíveis
 * - isLoading: boolean — carregando dados iniciais
 * - isRestoring: boolean — restaurando compras
 * - error: string | null — último erro
 * - refresh(): Promise<void> — recarregar dados do servidor
 * - purchasePackage(pkg): Promise<PurchaseResult> — comprar um plano
 * - restorePurchases(): Promise<PurchaseResult> — restaurar compras
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import {
  checkProAccess,
  getCurrentOffering,
  getCustomerInfo,
  hasProAccess,
  purchasePackage as doPurchasePackage,
  restorePurchases as doRestorePurchases,
  type PurchaseResult,
} from "@/lib/purchases";

// ─── Tipos do Contexto ────────────────────────────────────────────────────────

export interface PurchasesContextValue {
  /** Usuário tem acesso ativo ao "Vigora Saúde Pro" */
  isPro: boolean;
  /** Dados completos do cliente RevenueCat */
  customerInfo: CustomerInfo | null;
  /** Offering atual com os pacotes disponíveis (lifetime, yearly, monthly) */
  currentOffering: PurchasesOffering | null;
  /** Carregando dados iniciais */
  isLoading: boolean;
  /** Restaurando compras */
  isRestoring: boolean;
  /** Último erro ocorrido */
  error: string | null;
  /** Recarregar dados do servidor RevenueCat */
  refresh: () => Promise<void>;
  /** Comprar um pacote */
  purchasePackage: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  /** Restaurar compras anteriores */
  restorePurchases: () => Promise<PurchaseResult>;
}

// ─── Criação do Contexto ──────────────────────────────────────────────────────

export const PurchasesContext = createContext<PurchasesContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface PurchasesProviderProps {
  children: React.ReactNode;
}

export function PurchasesProvider({ children }: PurchasesProviderProps) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Carregar dados iniciais ────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    // SDK só funciona em iOS/Android (não em web)
    if (Platform.OS === "web") {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);

      const [info, offering] = await Promise.all([
        getCustomerInfo(),
        getCurrentOffering(),
      ]);

      setCustomerInfo(info);
      setCurrentOffering(offering);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar dados de assinatura";
      setError(msg);
      console.error("[PurchasesContext] Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Inicialização ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Listener de CustomerInfo (atualizações em tempo real) ─────────────────

  useEffect(() => {
    if (Platform.OS === "web") return;

    // O SDK emite este evento quando o status de compra muda
    // Nota: addCustomerInfoUpdateListener retorna void na v10 — usamos
    // removeCustomerInfoUpdateListener para limpar
    const customerInfoListener = (info: CustomerInfo) => {
      setCustomerInfo(info);
      if (__DEV__) {
        console.log("[PurchasesContext] CustomerInfo atualizado:", {
          isPro: hasProAccess(info),
          activeEntitlements: Object.keys(info.entitlements.active),
        });
      }
    };

    Purchases.addCustomerInfoUpdateListener(customerInfoListener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
    };
  }, []);

  // ── Recarregar ao voltar para o app (foreground) ──────────────────────────

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        // App voltou ao foreground — verificar status atualizado
        getCustomerInfo().then((info) => {
          if (info) setCustomerInfo(info);
        });
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  // ── Refresh manual ────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") return;
    setIsLoading(true);
    await loadData();
  }, [loadData]);

  // ── Compra ────────────────────────────────────────────────────────────────

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
    const result = await doPurchasePackage(pkg);
    if (result.success && result.customerInfo) {
      setCustomerInfo(result.customerInfo);
    }
    return result;
  }, []);

  // ── Restauração ───────────────────────────────────────────────────────────

  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    setIsRestoring(true);
    try {
      const result = await doRestorePurchases();
      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
      }
      return result;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  // ── Valor do Contexto ─────────────────────────────────────────────────────

  const value: PurchasesContextValue = {
    isPro: hasProAccess(customerInfo),
    customerInfo,
    currentOffering,
    isLoading,
    isRestoring,
    error,
    refresh,
    purchasePackage,
    restorePurchases,
  };

  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
}
