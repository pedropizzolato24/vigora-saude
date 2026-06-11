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
const REVENUECAT_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "test_vRsfCVmxAKkKikyiJxZLkiqYliI";

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

    // Configurar SDK - chave lida de EXPO_PUBLIC_REVENUECAT_API_KEY
    // Configure via painel Manus -> Settings -> Secrets
    if (!process.env.EXPO_PUBLIC_REVENUECAT_API_KEY) {
      console.warn(
        "[Purchases] EXPO_PUBLIC_REVENUECAT_API_KEY ausente — usando chave placeholder; offerings não vão carregar."
      );
    }
    if (Platform.OS === "ios" || Platform.OS === "android") {
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
 * Busca todos os offerings disponíveis.
 */
export async function getAllOfferings(): Promise<Record<string, PurchasesOffering>> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all;
  } catch (error) {
    console.error("[Purchases] Erro ao buscar todos os offerings:", error);
    return {};
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
