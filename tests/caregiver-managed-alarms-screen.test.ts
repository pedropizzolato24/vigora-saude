/**
 * A tela "Alarmes de [nome]" do cuidador (spec 6.1): os estados, os dois modos,
 * o AlarmFormModal reaproveitado e o tratamento de lista velha.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const screen = read('app/(caregiver-tabs)/managed-alarms.tsx');

describe('managed-alarms.tsx — estados e textos da spec 6.1', () => {
  it('cobre os quatro estados (mais o pedido de outro cuidador)', () => {
    for (const mode of ["'no-agreement'", "'pending'", "'pending-other'", "'active-mine'", "'active-other'"]) {
      expect(screen, mode).toContain(mode);
    }
  });

  it('textos de cada estado', () => {
    expect(screen).toContain('Pedir para cuidar dos alarmes');
    expect(screen).toMatch(/Aguardando \$\{personName\} aceitar/);
    expect(screen).toContain('Cancelar pedido');
    expect(screen).toMatch(/\$\{managerName\} cuida dos alarmes de \$\{personName\}/);
    expect(screen).toContain('Parar de cuidar dos alarmes');
    expect(screen).toContain('Novo remédio');
    expect(screen).toContain('Novo check-in');
  });

  it('as ações perigosas pedem confirmação em AppDialog (nunca Alert.alert)', () => {
    expect(screen).not.toMatch(/Alert\.alert/);
    expect(screen).toMatch(/<AppDialog \{\.\.\.dialogProps\} \/>/);
    expect(screen).toMatch(/<AppToast \{\.\.\.toastProps\} \/>/);
    for (const title of ['Pedir para cuidar dos alarmes?', 'Cancelar o pedido?', 'Parar de cuidar dos alarmes?', 'Apagar o alarme?']) {
      expect(screen, title).toContain(title);
    }
  });

  it('reaproveita o AlarmFormModal e salva pelas rotas do servidor', () => {
    expect(screen).toMatch(/import \{ AlarmFormModal \} from '@\/components\/alarm-form-modal'/);
    expect(screen).toMatch(/<AlarmFormModal/);
    for (const proc of ['forCaregiver', 'request', 'cancelRequest', 'stopManaging', 'createAlarm', 'updateAlarm', 'deleteAlarm']) {
      expect(screen, proc).toMatch(new RegExp(`trpc\\.managedAlarms\\.${proc}\\.use(Query|Mutation)`));
    }
    // o cuidador não grava nada no estado local do app dele
    expect(screen).not.toMatch(/useAppContext/);
  });

  it('lista velha: relê o servidor e usa o texto da spec (via describeMutationError)', () => {
    expect(screen).toMatch(/describeMutationError\(err, \{ staleList \}\)/);
    expect(screen).toMatch(/managed\.refetch\(\)/);
    expect(read('lib/managed-alarms-caregiver.ts')).toContain("'A lista mudou. Confira de novo.'");
  });

  it('o status por alarme usa as frases de entrega e o resumo do topo', () => {
    expect(screen).toMatch(/deliveryText\(/);
    expect(screen).toMatch(/listSummary\(/);
    expect(screen).toMatch(/alarmDeliveryStatus\(/);
  });

  it('segue as regras de tela: modo acessível, safe area, tokens, alvo de toque', () => {
    expect(screen).toContain('useAccessibility');
    expect(screen).toContain('isAccessibilityMode');
    expect(screen).toContain('useSafeAreaInsets');
    expect(screen).toContain('as_.touchTarget');
    expect(screen).toMatch(/refetchOnWindowFocus: true/);
    expect(screen).toMatch(/CaregiverRefreshControl/);
    expect(screen).not.toMatch(/['"]#[0-9A-Fa-f]{6}['"]/);
    expect(screen).not.toMatch(/fontSize:\s*\d+\s*[,}]/);
  });
});

describe('integração da área com o resto do app do cuidador', () => {
  it('a tela da pessoa tem a entrada "Alarmes de [nome]"', () => {
    const person = read('app/(caregiver-tabs)/person.tsx');
    expect(person).toContain("'/(caregiver-tabs)/managed-alarms'");
    expect(person).toMatch(/Alarmes de \{linked\.displayName\}/);
  });

  it('a linha de apoio da entrada tem pelo menos 15px no modo normal', () => {
    const person = read('app/(caregiver-tabs)/person.tsx');
    const fim = person.indexOf('Ver e, se {linked.displayName} aceitar');
    const linha = person.slice(person.lastIndexOf('<Text', fim), fim);
    expect(linha).toMatch(/fontSize: isAccessibilityMode \? sz\.body : fs\.base/);
  });

  it('o push do cuidador conhece os tipos da Fase 4 e recarrega a área', () => {
    const push = read('components/caregiver-push-initializer.tsx');
    for (const type of ['management_accepted', 'management_declined', 'management_ended', 'management_expired', 'management_changed', 'dms_paused']) {
      expect(push, type).toContain(`'${type}'`);
    }
    expect(push).toMatch(/managedAlarms\.forCaregiver\.invalidate/);
    expect(push).toContain("'/(caregiver-tabs)/managed-alarms'");
  });
});
