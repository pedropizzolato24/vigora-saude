/**
 * lib/purchases.ts
 * Serviço principal do RevenueCat para o Vigora.
 *
 * Responsabilidades:
 * - Inicialização do SDK com a API key correta por plataforma
 * - Identificação do usuário (anônimo ou autenticado)
 * - Verificação de entitlement "Vigora Saúde Pro"
 * - Busca de offerings (planos disponíveis)
 * - Execução de compras
 * - Restauração de compras
 */

import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  type PurchasesError,
} from "react-native-purchases";

// --- Constantes --------------------------------------------------------------

/**
 * Identificador do entitlement que desbloqueia o Vigora Saúde Pro.
 * Deve corresponder exatamente ao criado no painel RevenueCat.
 */
export const ENTITLEMENT_PRO = "Vigora Saúde Pro";

/**
 * Identificadores dos produtos configurados no RevenueCat.
 * Estes são os package identifiers dentro do Offering.
 */
export const PRODUCT_IDS = {
  LIFETIME: "lifetime",
  YEARLY: "yearly",
  MONTHLY: "monthly",
} as const;

/**
 * Chave de API do RevenueCat.
 * Lida da variável de ambiente EXPO_PUBLIC_REVENUECAT_API_KEY.
 * Configure via painel Manus -> Settings -> Secrets.
 * Em produção: use chaves separadas por plataforma (appl_* para iOS, goog_* para Android).
 */
// Chave PÚBLICA do SDK, por plataforma: goog_* (Android) / appl_* (iOS).
// NUNCA usar a secret key sk_* aqui — ela seria embutida no bundle do app.
// `|| ""` (e não `??`) para que string vazia também caia no guard de baixo.
const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || "";

// --- Inicialização ------------------------------------------------------------

let _initialized = false;

/**
 * Inicializa o SDK do RevenueCat.
 * Deve ser chamado uma única vez na inicialização do app (app/_layout.tsx).
 *
 * Em Expo Go, o SDK entra em modo Preview (mock) automaticamente,
 * permitindo testar a UI sem compras reais.
 */
export function initializePurchases(appUserId?: string): void {
  if (_initialized) return;

  try {
    // Ativar logs detalhados em desenvolvimento
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    }

    // Não configurar o SDK com chave ausente, vazia ou secreta (sk_*): isso
    // produzia um erro críptico de "offerings indisponíveis" em runtime. Falha
    // cedo e com log claro — a chave correta é a pública goog_/appl_.
    if (!REVENUECAT_API_KEY || REVENUECAT_API_KEY.startsWith("sk_")) {
      console.warn(
        "[Purchases] EXPO_PUBLIC_REVENUECAT_API_KEY ausente ou inválida (esperado goog_/appl_) — SDK não configurado; offerings não vão carregar."
      );
      return;
    }
    if (Platform.OS === "ios" || Platform.OS === "android") {
      // Chave pública é por LOJA: appl_ (App Store/iOS) e goog_ (Play/Android).
      // Uma chave da loja errada PASSA no guard acima mas faz getOfferings()
      // falhar em runtime ("Planos indisponíveis") sem erro claro — então
      // recusamos cedo, com log, quando o prefixo não casa com a plataforma.
      const expectedPrefix = Platform.OS === "ios" ? "appl_" : "goog_";
      if (!REVENUECAT_API_KEY.startsWith(expectedPrefix)) {
        console.warn(
          `[Purchases] EXPO_PUBLIC_REVENUECAT_API_KEY com prefixo incompatível com ${Platform.OS} (esperado "${expectedPrefix}") — SDK não configurado; offerings não vão carregar.`
        );
        return;
      }
      Purchases.configure({
        apiKey: REVENUECAT_API_KEY,
        appUserID: appUserId ?? null, // null = ID anônimo gerado pelo RevenueCat
      });
    }

    _initialized = true;

    if (__DEV__) {
      console.log("[Purchases] RevenueCat inicializado com sucesso");
    }
  } catch (error) {
    console.error("[Purchases] Erro ao inicializar RevenueCat:", error);
  }
}

/** Indica se Purchases.configure() chegou a rodar (chave válida + plataforma). */
export function isPurchasesConfigured(): boolean {
  return _initialized;
}

// --- Informações do Cliente ---------------------------------------------------

/**
 * Busca as informações mais recentes do cliente no RevenueCat.
 * Inclui entitlements ativos, histórico de compras e datas de expiração.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error("[Purchases] Erro ao buscar CustomerInfo:", error);
    return null;
  }
}

// --- Verificação de Entitlement -----------------------------------------------

/**
 * Verifica se o usuário tem acesso ativo ao "Vigora Saúde Pro".
 *
 * @param customerInfo - CustomerInfo obtido via getCustomerInfo()
 * @returns true se o entitlement estiver ativo
 */
export function hasProAccess(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return typeof customerInfo.entitlements.active[ENTITLEMENT_PRO] !== "undefined";
}

/**
 * Verifica o status Pro diretamente do servidor RevenueCat (sem cache).
 * Use quando precisar de verificação em tempo real (ex: após compra).
 */
export async function checkProAccess(): Promise<boolean> {
  const customerInfo = await getCustomerInfo();
  return hasProAccess(customerInfo);
}

// --- Offerings (Planos Disponíveis) ------------------------------------------

/**
 * Busca os offerings configurados no painel RevenueCat.
 * O offering "default" contém os pacotes: lifetime, yearly, monthly.
 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (error) {
    console.error("[Purchases] Erro ao buscar offerings:", error);
    return null;
  }
}

/**
 * Motivo pelo qual a lista de planos pode não aparecer. Permite à UI diferenciar
 * um problema de build/chave (não adianta tentar de novo) de uma falha de rede
 * (vale retentar) ou de configuração no painel/loja.
 */
export type OfferingReason =
  | "ok"
  | "not-configured" // SDK não configurado: chave ausente/errada — problema de build
  | "no-offering" // SDK ok, mas nenhum offering marcado "Current" no painel RevenueCat
  | "empty-packages" // offering existe, mas sem pacotes (produtos não aprovados na loja)
  | "error"; // falha ao buscar (ex.: rede)

export interface OfferingLoadResult {
  offering: PurchasesOffering | null;
  reason: OfferingReason;
}

/**
 * Busca o offering atual já classificando o motivo de eventual indisponibilidade.
 * Diferente de getCurrentOffering(), informa POR QUE não há planos — usado pela
 * UI para mostrar a mensagem certa e pelo dev para diagnosticar.
 */
export async function getOfferingResult(): Promise<OfferingLoadResult> {
  if (!isPurchasesConfigured()) {
    return { offering: null, reason: "not-configured" };
  }
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current ?? null;
    if (!current) return { offering: null, reason: "no-offering" };
    if (current.availablePackages.length === 0) {
      return { offering: current, reason: "empty-packages" };
    }
    return { offering: current, reason: "ok" };
  } catch (error) {
    console.error("[Purchases] Erro ao buscar offerings:", error);
    return { offering: null, reason: "error" };
  }
}

// --- Compras ------------------------------------------------------------------

export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}

/**
 * Executa a compra de um pacote RevenueCat.
 *
 * @param pkg - PurchasesPackage obtido via getCurrentOffering()
 * @returns Resultado da compra com customerInfo atualizado
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error) {
    const rcError = error as PurchasesError;

    // Usuário cancelou - não é um erro real
    if (rcError.userCancelled) {
      return { success: false, userCancelled: true };
    }

    console.error("[Purchases] Erro na compra:", rcError);
    return {
      success: false,
      error: rcError.message ?? "Erro ao processar compra. Tente novamente.",
    };
  }
}

// --- Restauração de Compras ---------------------------------------------------

/**
 * Restaura compras anteriores do usuário.
 * Necessário para usuários que reinstalaram o app ou trocaram de dispositivo.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { success: true, customerInfo };
  } catch (error) {
    const rcError = error as PurchasesError;
    console.error("[Purchases] Erro ao restaurar compras:", rcError);
    return {
      success: false,
      error: rcError.message ?? "Erro ao restaurar compras. Tente novamente.",
    };
  }
}

// --- Identificação do Usuário -------------------------------------------------

/**
 * Identifica o usuário no RevenueCat com um ID específico.
 * Use quando o usuário fizer login no app.
 * Isso sincroniza as compras entre dispositivos do mesmo usuário.
 *
 * @param userId - ID único do usuário no seu sistema
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    await Purchases.logIn(userId);
    if (__DEV__) {
      console.log("[Purchases] Usuário identificado:", userId);
    }
  } catch (error) {
    console.error("[Purchases] Erro ao identificar usuário:", error);
  }
}

/**
 * Remove a identificação do usuário (logout).
 * Volta para o ID anônimo gerado pelo RevenueCat.
 */
export async function logoutUser(): Promise<void> {
  try {
    await Purchases.logOut();
    if (__DEV__) {
      console.log("[Purchases] Usuário desconectado do RevenueCat");
    }
  } catch (error) {
    console.error("[Purchases] Erro ao desconectar usuário:", error);
  }
}
