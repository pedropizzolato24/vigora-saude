/**
 * permission-texts.ts
 *
 * Os textos da central de permissões: o que cada item faz (`description`) e,
 * enquanto ele não está liberado, o passo a passo para liberar (`steps`).
 *
 * Fica fora de `permissions-check.ts` porque são só textos — função pura, sem
 * React Native —, e eles já são mais compridos que a lógica de checagem.
 *
 * Os passos descrevem o que o botão "Liberar" realmente abre, em cada sistema:
 * - uma pergunta do sistema (notificações, localização, alarme do iPhone);
 * - ou a tela de ajustes do Vigora, quando o sistema já decidiu e não pergunta
 *   mais (os dois casos aparecem juntos: o idoso não sabe qual vai cair).
 * Nomes de tela só aparecem quando existem no sistema (Android 13–15 / One UI,
 * iOS 18–26); onde o nome varia por fabricante, o passo descreve a ação.
 *
 * Linguagem: "celular", nunca a plataforma nem a marca. A numeração é da tela.
 */
import { oemBatteryHint } from '@/lib/_core/oem-battery-hint';

export type PermissionKey =
  | 'notifications'
  | 'exactAlarm'
  | 'fullScreen'
  | 'battery'
  | 'alarmKit'
  | 'locationForeground'
  | 'locationBackground';

export interface PermissionTexts {
  description: string;
  steps: string[];
}

type Os = 'android' | 'ios';

const LIBERAR = 'Toque em "Liberar" aqui embaixo.';
const VOLTAR = 'Quando terminar, volte para o Vigora.';

interface Entry {
  description: string;
  /** Só a plataforma em que o item existe tem passos. */
  steps: Partial<Record<Os, string[]>>;
}

const ENTRIES: Record<Exclude<PermissionKey, 'battery'>, Entry> = {
  notifications: {
    description:
      'São os avisos que o Vigora mostra na tela do celular, como o lembrete de remédio e o alarme. ' +
      'Também é por eles que chegam os avisos da família. ' +
      'Sem eles, o celular não mostra nada e você pode perder a hora do remédio.',
    steps: {
      android: [
        LIBERAR,
        'Se aparecer uma pergunta, toque em "Permitir".',
        'Se abrir a tela de ajustes do Vigora, toque em "Notificações" e ligue a chave.',
        VOLTAR,
      ],
      ios: [
        LIBERAR,
        'Se aparecer uma pergunta, toque em "Permitir".',
        'Se abrir os Ajustes do Vigora, toque em "Notificações" e ligue "Permitir Notificações".',
        VOLTAR,
      ],
    },
  },
  exactAlarm: {
    description:
      'Faz o alarme do remédio tocar exatamente na hora marcada. ' +
      'Sem isso, o celular pode atrasar o alarme por vários minutos.',
    steps: {
      android: [
        LIBERAR,
        'Na tela "Alarmes e lembretes" que abrir, procure o Vigora (se aparecer uma lista) e ligue a chave dele.',
        VOLTAR,
      ],
    },
  },
  fullScreen: {
    description:
      'Faz o alarme ocupar a tela toda, até com o celular bloqueado, para você ver e responder com facilidade. ' +
      'Sem isso, o alarme chega como um aviso pequeno no alto da tela, fácil de não perceber.',
    steps: {
      android: [
        LIBERAR,
        'Na tela "Notificações em tela cheia" que abrir, procure o Vigora (se aparecer uma lista) e ligue a chave dele.',
        VOLTAR,
      ],
    },
  },
  alarmKit: {
    description:
      'Faz o alarme tocar alto mesmo com o celular no silencioso ou no modo Foco. ' +
      'Sem isso, o alarme fica mudo nesses casos e você pode perder a hora do remédio.',
    steps: {
      ios: [
        LIBERAR,
        'Se aparecer uma pergunta sobre alarmes, toque em "Permitir".',
        'Se abrir os Ajustes do Vigora, procure a opção de alarmes e ligue a chave dela.',
        VOLTAR,
      ],
    },
  },
  locationForeground: {
    description:
      'Deixa o Vigora saber onde você está enquanto o aplicativo está aberto. ' +
      'É o que permite mandar o seu lugar para a família quando você pede ajuda. ' +
      'Sem isso, o pedido de ajuda vai sem dizer onde você está.',
    steps: {
      android: [
        LIBERAR,
        'Se aparecer uma pergunta, toque em "Durante o uso do app" (ou parecido, como "Enquanto o app está em uso"). Se houver a escolha entre "Precisa" e "Aproximada", prefira "Precisa".',
        'Se abrir a tela de ajustes do Vigora, toque em "Permissões", depois em "Localização", e escolha a opção que permite o uso com o app aberto.',
        VOLTAR,
      ],
      ios: [
        LIBERAR,
        'Se aparecer uma pergunta, toque em "Permitir ao Usar o App".',
        'Se abrir os Ajustes do Vigora, toque em "Localização" e escolha "Ao Usar o App".',
        VOLTAR,
      ],
    },
  },
  locationBackground: {
    description:
      'Deixa o Vigora achar onde você está mesmo com o aplicativo fechado e o celular no bolso. ' +
      'Sem isso, se você precisar de ajuda com o Vigora fechado, a família não recebe o seu lugar.',
    steps: {
      android: [
        LIBERAR,
        'Se aparecer uma pergunta, toque em "Permitir o tempo todo".',
        'Se abrir a tela de ajustes do Vigora, toque em "Permissões", depois em "Localização", e escolha "Permitir o tempo todo".',
        VOLTAR,
      ],
      ios: [
        LIBERAR,
        'Se aparecer uma pergunta, toque na opção que diz "Sempre" (por exemplo, "Alterar para Sempre Permitir").',
        'Se abrir os Ajustes do Vigora, toque em "Localização" e escolha "Sempre".',
        VOLTAR,
      ],
    },
  },
};

const BATTERY: Entry = {
  description:
    'Para economizar energia, o celular pode fechar o Vigora sozinho, sem avisar. ' +
    'Com o Vigora fechado, o alarme não toca. ' +
    'Esta opção pede ao celular que deixe o Vigora em paz.',
  steps: {
    android: [
      LIBERAR,
      'Na pergunta que aparecer, toque em "Permitir". Se abrir uma lista de apps, toque em "Vigora" e escolha a opção que não limita a bateria.',
    ],
  },
};

/**
 * Textos de um item para o sistema do aparelho.
 *
 * `manufacturer` só importa na bateria: Samsung e Xiaomi têm listas próprias
 * que fecham o app mesmo com a isenção padrão concedida — sem os passos extras
 * o idoso "libera" a permissão e o alarme continua não tocando.
 */
export function permissionTexts(key: PermissionKey, os: Os, manufacturer = ''): PermissionTexts {
  const entry = key === 'battery' ? BATTERY : ENTRIES[key];
  const steps = [...(entry.steps[os] ?? [])];
  if (key === 'battery' && os === 'android') {
    steps.push(...(oemBatteryHint(manufacturer) ?? []));
  }
  return { description: entry.description, steps };
}
