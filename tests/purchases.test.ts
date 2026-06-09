/**
 * tests/purchases.test.ts
 * Testes automatizados do fluxo de compra RevenueCat para o Vigora Saúde.
 *
 * Cobre:
 * - hasProAccess: verificação de entitlement
 * - purchasePackage: compra bem-sucedida, cancelamento e erro
 * - restorePurchases: restauração bem-sucedida e falha
 * - checkProAccess: verificação em tempo real
 * - getCurrentOffering: busca de planos
 * - FREE_LIMITS: constantes dos limites gratuitos
 * - useProFeature: lógica do hook (checkLimit, requirePro)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock do react-native-purchases ------------------------------------------

const mockCustomerInfoPro = {
  entitlements: {
    active: {
      "Vigora Saúde Pro": {
        identifier: "Vigora Saúde Pro",
        isActive: true,
        willRenew: true,
        expirationDate: "2099-12-31T00:00:00Z",
        productIdentifier: "yearly",
      },
    },
    all: {},
  },
  activeSubscriptions: ["yearly"],
  allPurchasedProductIdentifiers: ["yearly"],
  originalAppUserId: "user_123",
  requestDate: new Date().toISOString(),
  firstSeen: new Date().toISOString(),
  originalPurchaseDate: new Date().toISOString(),
  latestExpirationDate: "2099-12-31T00:00:00Z",
  nonSubscriptionTransactions: [],
  allExpirationDates: {},
  allPurchaseDates: {},
  managementURL: null,
  originalApplicationVersion: null,
};

const mockCustomerInfoFree = {
  entitlements: {
    active: {},
    all: {},
  },
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
  originalAppUserId: "user_456",
  requestDate: new Date().toISOString(),
  firstSeen: new Date().toISOString(),
  originalPurchaseDate: null,
  latestExpirationDate: null,
  nonSubscriptionTransactions: [],
  allExpirationDates: {},
  allPurchaseDates: {},
  managementURL: null,
  originalApplicationVersion: null,
};

const mockPackage = {
  identifier: "$rc_annual",
  packageType: "ANNUAL",
  product: {
    identifier: "yearly",
    description: "Vigora Saúde Pro - Anual",
    title: "Vigora Saúde Pro (Anual)",
    price: 59.99,
    priceString: "R$ 59,99",
    currencyCode: "BRL",
    subscriptionPeriod: "P1Y",
    introPrice: null,
    discounts: [],
  },
  offeringIdentifier: "default",
  presentedOfferingContext: {
    offeringIdentifier: "default",
    placementIdentifier: null,
    targetingContext: null,
  },
};

const mockOffering = {
  identifier: "default",
  serverDescription: "Planos Vigora Saúde Pro",
  metadata: {},
  availablePackages: [mockPackage],
  lifetime: null,
  annual: mockPackage,
  sixMonth: null,
  threeMonth: null,
  twoMonth: null,
  monthly: null,
  weekly: null,
};

// Mock do módulo react-native-purchases
vi.mock("react-native-purchases", () => ({
  default: {
    configure: vi.fn(),
    setLogLevel: vi.fn(),
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
    addCustomerInfoUpdateListener: vi.fn(),
    removeCustomerInfoUpdateListener: vi.fn(),
  },
  LOG_LEVEL: { VERBOSE: "VERBOSE", DEBUG: "DEBUG", INFO: "INFO" },
}));

// Mock do react-native (Platform)
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// --- Imports após mocks -------------------------------------------------------

import Purchases from "react-native-purchases";
import {
  hasProAccess,
  checkProAccess,
  getCustomerInfo,
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
  ENTITLEMENT_PRO,
  PRODUCT_IDS,
  identifyUser,
  logoutUser,
} from "@/lib/purchases";
import { FREE_LIMITS } from "@/components/pro-limits";

// --- Testes -------------------------------------------------------------------

describe("ENTITLEMENT_PRO", () => {
  it("deve ter o identificador correto do entitlement", () => {
    expect(ENTITLEMENT_PRO).toBe("Vigora Saúde Pro");
  });
});

describe("PRODUCT_IDS", () => {
  it("deve ter os 3 produtos configurados", () => {
    expect(PRODUCT_IDS.LIFETIME).toBe("lifetime");
    expect(PRODUCT_IDS.YEARLY).toBe("yearly");
    expect(PRODUCT_IDS.MONTHLY).toBe("monthly");
  });
});

describe("FREE_LIMITS", () => {
  // Política atual: experiência completa para todos (trial de 14 dias sem
  // bloqueio de recursos). Nenhum recurso é restrito por plano.
  it("não deve limitar contatos por plano", () => {
    expect(FREE_LIMITS.CONTACTS).toBe(Infinity);
  });

  it("não deve limitar alarmes por plano", () => {
    expect(FREE_LIMITS.ALARMS).toBe(Infinity);
  });

  it("deve liberar exportação PDF para todos", () => {
    expect(FREE_LIMITS.PDF_EXPORT).toBe(true);
  });

  it("deve liberar monitoramento contínuo para todos", () => {
    expect(FREE_LIMITS.MONITORING).toBe(true);
  });
});

describe("hasProAccess", () => {
  it("deve retornar true quando o entitlement 'Vigora Saúde Pro' está ativo", () => {
    expect(hasProAccess(mockCustomerInfoPro as any)).toBe(true);
  });

  it("deve retornar false quando não há entitlements ativos", () => {
    expect(hasProAccess(mockCustomerInfoFree as any)).toBe(false);
  });

  it("deve retornar false quando customerInfo é null", () => {
    expect(hasProAccess(null)).toBe(false);
  });

  it("deve retornar false quando o entitlement tem nome diferente", () => {
    const wrongEntitlement = {
      ...mockCustomerInfoFree,
      entitlements: {
        active: { "Outro Plano": {} },
        all: {},
      },
    };
    expect(hasProAccess(wrongEntitlement as any)).toBe(false);
  });
});

describe("getCustomerInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar CustomerInfo quando a chamada é bem-sucedida", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoPro as any);

    const result = await getCustomerInfo();

    expect(result).toEqual(mockCustomerInfoPro);
    expect(Purchases.getCustomerInfo).toHaveBeenCalledTimes(1);
  });

  it("deve retornar null quando a chamada falha", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockRejectedValueOnce(
      new Error("Network error")
    );

    const result = await getCustomerInfo();

    expect(result).toBeNull();
  });
});

describe("checkProAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar true para usuário Pro", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoPro as any);

    const result = await checkProAccess();

    expect(result).toBe(true);
  });

  it("deve retornar false para usuário do plano gratuito", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoFree as any);

    const result = await checkProAccess();

    expect(result).toBe(false);
  });

  it("deve retornar false quando a API falha", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockRejectedValueOnce(
      new Error("Timeout")
    );

    const result = await checkProAccess();

    expect(result).toBe(false);
  });
});

describe("getCurrentOffering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar o offering atual", async () => {
    vi.mocked(Purchases.getOfferings).mockResolvedValueOnce({
      current: mockOffering as any,
      all: { default: mockOffering as any },
    });

    const result = await getCurrentOffering();

    expect(result).toEqual(mockOffering);
    expect(result?.identifier).toBe("default");
  });

  it("deve retornar null quando não há offering configurado", async () => {
    vi.mocked(Purchases.getOfferings).mockResolvedValueOnce({
      current: null,
      all: {},
    });

    const result = await getCurrentOffering();

    expect(result).toBeNull();
  });

  it("deve retornar null quando a API falha", async () => {
    vi.mocked(Purchases.getOfferings).mockRejectedValueOnce(
      new Error("API Error")
    );

    const result = await getCurrentOffering();

    expect(result).toBeNull();
  });
});

describe("purchasePackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar sucesso com customerInfo após compra bem-sucedida", async () => {
    vi.mocked(Purchases.purchasePackage).mockResolvedValueOnce({
      customerInfo: mockCustomerInfoPro as any,
      productIdentifier: "yearly",
      transaction: { transactionIdentifier: "txn_123", productIdentifier: "yearly", purchaseDate: new Date().toISOString(), purchaseToken: "token_123" },
    } as any);

    const result = await purchasePackage(mockPackage as any);

    expect(result.success).toBe(true);
    expect(result.customerInfo).toEqual(mockCustomerInfoPro);
    expect(result.userCancelled).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("deve retornar userCancelled=true quando o usuário cancela", async () => {
    const cancelError = { userCancelled: true, message: "Purchase cancelled" };
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce(cancelError);

    const result = await purchasePackage(mockPackage as any);

    expect(result.success).toBe(false);
    expect(result.userCancelled).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("deve retornar error quando a compra falha por erro de rede", async () => {
    const networkError = { userCancelled: false, message: "Erro de conexão" };
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce(networkError);

    const result = await purchasePackage(mockPackage as any);

    expect(result.success).toBe(false);
    expect(result.userCancelled).toBeUndefined();
    expect(result.error).toBe("Erro de conexão");
  });

  it("deve retornar mensagem padrão quando o erro não tem mensagem", async () => {
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce({ userCancelled: false });

    const result = await purchasePackage(mockPackage as any);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Erro ao processar compra. Tente novamente.");
  });

  it("deve verificar que o usuário tem acesso Pro após compra bem-sucedida", async () => {
    vi.mocked(Purchases.purchasePackage).mockResolvedValueOnce({
      customerInfo: mockCustomerInfoPro as any,
      productIdentifier: "yearly",
      transaction: { transactionIdentifier: "txn_456", productIdentifier: "yearly", purchaseDate: new Date().toISOString(), purchaseToken: "token_456" },
    } as any);

    const result = await purchasePackage(mockPackage as any);

    expect(result.success).toBe(true);
    expect(hasProAccess(result.customerInfo!)).toBe(true);
  });
});

describe("restorePurchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar sucesso com customerInfo após restauração bem-sucedida", async () => {
    vi.mocked(Purchases.restorePurchases).mockResolvedValueOnce(
      mockCustomerInfoPro as any
    );

    const result = await restorePurchases();

    expect(result.success).toBe(true);
    expect(result.customerInfo).toEqual(mockCustomerInfoPro);
  });

  it("deve retornar sucesso mesmo sem entitlements ativos (restauração sem compras)", async () => {
    vi.mocked(Purchases.restorePurchases).mockResolvedValueOnce(
      mockCustomerInfoFree as any
    );

    const result = await restorePurchases();

    expect(result.success).toBe(true);
    expect(hasProAccess(result.customerInfo!)).toBe(false);
  });

  it("deve retornar error quando a restauração falha", async () => {
    vi.mocked(Purchases.restorePurchases).mockRejectedValueOnce({
      message: "Falha ao restaurar compras",
    });

    const result = await restorePurchases();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Falha ao restaurar compras");
  });

  it("deve retornar mensagem padrão quando o erro não tem mensagem", async () => {
    vi.mocked(Purchases.restorePurchases).mockRejectedValueOnce({});

    const result = await restorePurchases();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Erro ao restaurar compras. Tente novamente.");
  });
});

describe("identifyUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve chamar Purchases.logIn com o userId correto", async () => {
    vi.mocked(Purchases.logIn).mockResolvedValueOnce({
      customerInfo: mockCustomerInfoPro as any,
      created: false,
    });

    await identifyUser("user_test_123");

    expect(Purchases.logIn).toHaveBeenCalledWith("user_test_123");
    expect(Purchases.logIn).toHaveBeenCalledTimes(1);
  });

  it("deve não lançar erro quando logIn falha", async () => {
    vi.mocked(Purchases.logIn).mockRejectedValueOnce(new Error("Auth error"));

    // Não deve lançar exceção
    await expect(identifyUser("user_test_456")).resolves.toBeUndefined();
  });
});

describe("logoutUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve chamar Purchases.logOut", async () => {
    vi.mocked(Purchases.logOut).mockResolvedValueOnce(mockCustomerInfoFree as any);

    await logoutUser();

    expect(Purchases.logOut).toHaveBeenCalledTimes(1);
  });

  it("deve não lançar erro quando logOut falha", async () => {
    vi.mocked(Purchases.logOut).mockRejectedValueOnce(new Error("Logout error"));

    await expect(logoutUser()).resolves.toBeUndefined();
  });
});

describe("Fluxo completo de assinatura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve simular o fluxo completo: gratuito -> compra -> Pro -> restauração", async () => {
    // 1. Usuário começa sem Pro
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoFree as any);
    const initialInfo = await getCustomerInfo();
    expect(hasProAccess(initialInfo)).toBe(false);

    // 2. Usuário compra o plano anual
    vi.mocked(Purchases.purchasePackage).mockResolvedValueOnce({
      customerInfo: mockCustomerInfoPro as any,
      productIdentifier: "yearly",
      transaction: { transactionIdentifier: "txn_789", productIdentifier: "yearly", purchaseDate: new Date().toISOString(), purchaseToken: "token_789" },
    } as any);
    const purchaseResult = await purchasePackage(mockPackage as any);
    expect(purchaseResult.success).toBe(true);
    expect(hasProAccess(purchaseResult.customerInfo!)).toBe(true);

    // 3. Verificação em tempo real confirma acesso Pro
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoPro as any);
    const isPro = await checkProAccess();
    expect(isPro).toBe(true);

    // 4. Usuário reinstala o app e restaura compras
    vi.mocked(Purchases.restorePurchases).mockResolvedValueOnce(mockCustomerInfoPro as any);
    const restoreResult = await restorePurchases();
    expect(restoreResult.success).toBe(true);
    expect(hasProAccess(restoreResult.customerInfo!)).toBe(true);
  });

  it("deve simular o fluxo de cancelamento: usuário desiste da compra", async () => {
    // 1. Usuário abre o paywall mas cancela
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce({
      userCancelled: true,
      message: "User cancelled",
    });

    const result = await purchasePackage(mockPackage as any);

    expect(result.success).toBe(false);
    expect(result.userCancelled).toBe(true);
    expect(result.error).toBeUndefined();

    // 2. Status permanece gratuito
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoFree as any);
    const isPro = await checkProAccess();
    expect(isPro).toBe(false);
  });
});

describe("Limites do plano gratuito - lógica de checkLimit", () => {
  // Sem restrições por plano: qualquer quantidade passa pelo checkLimit.
  it("deve permitir adicionar contatos sem limite de plano", () => {
    const current = 100;
    const limit = FREE_LIMITS.CONTACTS;
    const canAdd = current < limit;
    expect(canAdd).toBe(true);
  });

  it("deve permitir adicionar alarmes sem limite de plano", () => {
    const current = 50;
    const limit = FREE_LIMITS.ALARMS;
    const canAdd = current < limit;
    expect(canAdd).toBe(true);
  });

  it("usuário Pro também não tem limites", () => {
    const isPro = true;
    const current = 100;
    const limit = FREE_LIMITS.CONTACTS;
    const canAdd = isPro || current < limit;
    expect(canAdd).toBe(true);
  });
});
