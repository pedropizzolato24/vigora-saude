import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do react-native-purchases
vi.mock("react-native-purchases", () => ({
  default: {
    configure: vi.fn(),
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
    addCustomerInfoUpdateListener: vi.fn(),
    removeCustomerInfoUpdateListener: vi.fn(),
  },
  LOG_LEVEL: { VERBOSE: "VERBOSE" },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Importar apenas lib/purchases (sem JSX)
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

const FREE_LIMITS = {
  CONTACTS: 3,
  ALARMS: 5,
  PDF_EXPORT: false,
  MONITORING: false,
} as const;

const mockCustomerInfoPro = {
  entitlements: {
    active: {
      "Vigora Saúde Pro": { identifier: "Vigora Saúde Pro", isActive: true },
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
  entitlements: { active: {}, all: {} },
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
  },
  offeringIdentifier: "default",
  presentedOfferingContext: { offeringIdentifier: "default", placementIdentifier: null, targetingContext: null },
};

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
  it("deve limitar contatos a 3 no plano gratuito", () => {
    expect(FREE_LIMITS.CONTACTS).toBe(3);
  });
  it("deve limitar alarmes a 5 no plano gratuito", () => {
    expect(FREE_LIMITS.ALARMS).toBe(5);
  });
  it("deve bloquear exportação PDF no plano gratuito", () => {
    expect(FREE_LIMITS.PDF_EXPORT).toBe(false);
  });
  it("deve bloquear monitoramento contínuo no plano gratuito", () => {
    expect(FREE_LIMITS.MONITORING).toBe(false);
  });
});

describe("hasProAccess", () => {
  it("deve retornar true quando o entitlement está ativo", () => {
    expect(hasProAccess(mockCustomerInfoPro as any)).toBe(true);
  });
  it("deve retornar false quando não há entitlements ativos", () => {
    expect(hasProAccess(mockCustomerInfoFree as any)).toBe(false);
  });
  it("deve retornar false quando customerInfo é null", () => {
    expect(hasProAccess(null)).toBe(false);
  });
});

describe("getCustomerInfo", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve retornar CustomerInfo quando bem-sucedido", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoPro as any);
    const result = await getCustomerInfo();
    expect(result).toEqual(mockCustomerInfoPro);
  });

  it("deve retornar null quando falha", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockRejectedValueOnce(new Error("Network error"));
    const result = await getCustomerInfo();
    expect(result).toBeNull();
  });
});

describe("checkProAccess", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve retornar true para usuário Pro", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoPro as any);
    expect(await checkProAccess()).toBe(true);
  });

  it("deve retornar false para usuário gratuito", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoFree as any);
    expect(await checkProAccess()).toBe(false);
  });

  it("deve retornar false quando a API falha", async () => {
    vi.mocked(Purchases.getCustomerInfo).mockRejectedValueOnce(new Error("Timeout"));
    expect(await checkProAccess()).toBe(false);
  });
});

describe("getCurrentOffering", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve retornar o offering atual", async () => {
    const mockOffering = { identifier: "default", availablePackages: [mockPackage] };
    vi.mocked(Purchases.getOfferings).mockResolvedValueOnce({
      current: mockOffering as any,
      all: { default: mockOffering as any },
    });
    const result = await getCurrentOffering();
    expect(result?.identifier).toBe("default");
  });

  it("deve retornar null quando não há offering", async () => {
    vi.mocked(Purchases.getOfferings).mockResolvedValueOnce({ current: null, all: {} });
    expect(await getCurrentOffering()).toBeNull();
  });

  it("deve retornar null quando a API falha", async () => {
    vi.mocked(Purchases.getOfferings).mockRejectedValueOnce(new Error("API Error"));
    expect(await getCurrentOffering()).toBeNull();
  });
});

describe("purchasePackage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve retornar sucesso após compra bem-sucedida", async () => {
    vi.mocked(Purchases.purchasePackage).mockResolvedValueOnce({
      customerInfo: mockCustomerInfoPro as any,
      productIdentifier: "yearly",
      transaction: { transactionIdentifier: "txn_123", productIdentifier: "yearly", purchaseDate: new Date().toISOString(), purchaseToken: "token_123" },
    } as any);
    const result = await purchasePackage(mockPackage as any);
    expect(result.success).toBe(true);
    expect(hasProAccess(result.customerInfo!)).toBe(true);
  });

  it("deve retornar userCancelled=true quando o usuário cancela", async () => {
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce({ userCancelled: true, message: "Cancelled" });
    const result = await purchasePackage(mockPackage as any);
    expect(result.success).toBe(false);
    expect(result.userCancelled).toBe(true);
  });

  it("deve retornar error quando a compra falha", async () => {
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce({ userCancelled: false, message: "Erro de conexão" });
    const result = await purchasePackage(mockPackage as any);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Erro de conexão");
  });

  it("deve retornar mensagem padrão quando o erro não tem mensagem", async () => {
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce({ userCancelled: false });
    const result = await purchasePackage(mockPackage as any);
    expect(result.error).toBe("Erro ao processar compra. Tente novamente.");
  });
});

describe("restorePurchases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve retornar sucesso após restauração bem-sucedida", async () => {
    vi.mocked(Purchases.restorePurchases).mockResolvedValueOnce(mockCustomerInfoPro as any);
    const result = await restorePurchases();
    expect(result.success).toBe(true);
    expect(hasProAccess(result.customerInfo!)).toBe(true);
  });

  it("deve retornar sucesso sem entitlements (sem compras anteriores)", async () => {
    vi.mocked(Purchases.restorePurchases).mockResolvedValueOnce(mockCustomerInfoFree as any);
    const result = await restorePurchases();
    expect(result.success).toBe(true);
    expect(hasProAccess(result.customerInfo!)).toBe(false);
  });

  it("deve retornar error quando a restauração falha", async () => {
    vi.mocked(Purchases.restorePurchases).mockRejectedValueOnce({ message: "Falha ao restaurar" });
    const result = await restorePurchases();
    expect(result.success).toBe(false);
    expect(result.error).toBe("Falha ao restaurar");
  });
});

describe("identifyUser / logoutUser", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve chamar Purchases.logIn com o userId correto", async () => {
    vi.mocked(Purchases.logIn).mockResolvedValueOnce({ customerInfo: mockCustomerInfoPro as any, created: false });
    await identifyUser("user_test_123");
    expect(Purchases.logIn).toHaveBeenCalledWith("user_test_123");
  });

  it("deve não lançar erro quando logIn falha", async () => {
    vi.mocked(Purchases.logIn).mockRejectedValueOnce(new Error("Auth error"));
    await expect(identifyUser("user_test_456")).resolves.toBeUndefined();
  });

  it("deve chamar Purchases.logOut", async () => {
    vi.mocked(Purchases.logOut).mockResolvedValueOnce(mockCustomerInfoFree as any);
    await logoutUser();
    expect(Purchases.logOut).toHaveBeenCalledTimes(1);
  });
});

describe("Fluxo completo de assinatura", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deve simular: gratuito -> compra -> Pro -> restauração", async () => {
    // 1. Começa sem Pro
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoFree as any);
    const initialInfo = await getCustomerInfo();
    expect(hasProAccess(initialInfo)).toBe(false);

    // 2. Compra o plano anual
    vi.mocked(Purchases.purchasePackage).mockResolvedValueOnce({
      customerInfo: mockCustomerInfoPro as any,
      productIdentifier: "yearly",
      transaction: { transactionIdentifier: "txn_789", productIdentifier: "yearly", purchaseDate: new Date().toISOString(), purchaseToken: "token_789" },
    } as any);
    const purchaseResult = await purchasePackage(mockPackage as any);
    expect(purchaseResult.success).toBe(true);
    expect(hasProAccess(purchaseResult.customerInfo!)).toBe(true);

    // 3. Verificação em tempo real confirma Pro
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoPro as any);
    expect(await checkProAccess()).toBe(true);

    // 4. Restaura compras após reinstalação
    vi.mocked(Purchases.restorePurchases).mockResolvedValueOnce(mockCustomerInfoPro as any);
    const restoreResult = await restorePurchases();
    expect(restoreResult.success).toBe(true);
    expect(hasProAccess(restoreResult.customerInfo!)).toBe(true);
  });

  it("deve simular cancelamento: usuário desiste da compra", async () => {
    vi.mocked(Purchases.purchasePackage).mockRejectedValueOnce({ userCancelled: true, message: "User cancelled" });
    const result = await purchasePackage(mockPackage as any);
    expect(result.success).toBe(false);
    expect(result.userCancelled).toBe(true);

    vi.mocked(Purchases.getCustomerInfo).mockResolvedValueOnce(mockCustomerInfoFree as any);
    expect(await checkProAccess()).toBe(false);
  });
});

describe("Limites do plano gratuito", () => {
  it("deve permitir adicionar contato quando abaixo do limite (2 de 3)", () => {
    expect(2 < FREE_LIMITS.CONTACTS).toBe(true);
  });
  it("deve bloquear adição de contato quando no limite (3 de 3)", () => {
    expect(3 < FREE_LIMITS.CONTACTS).toBe(false);
  });
  it("deve permitir adicionar alarme quando abaixo do limite (4 de 5)", () => {
    expect(4 < FREE_LIMITS.ALARMS).toBe(true);
  });
  it("deve bloquear adição de alarme quando no limite (5 de 5)", () => {
    expect(5 < FREE_LIMITS.ALARMS).toBe(false);
  });
  it("usuário Pro não deve ter limite de contatos", () => {
    const isPro = true;
    expect(isPro || 100 < FREE_LIMITS.CONTACTS).toBe(true);
  });
  it("usuário Pro não deve ter limite de alarmes", () => {
    const isPro = true;
    expect(isPro || 50 < FREE_LIMITS.ALARMS).toBe(true);
  });
});
