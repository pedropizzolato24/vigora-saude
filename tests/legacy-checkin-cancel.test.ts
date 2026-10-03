import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), multiRemove: vi.fn(async () => undefined) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { cancelLegacyCheckinNotifications } from '../lib/legacy-checkin-cancel';

const sched = (identifier: string, type?: string) =>
  ({ identifier, content: { data: type ? { type } : {} } }) as never;

describe('cancelLegacyCheckinNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancela prompt e timeout do sistema antigo, por tipo e por id guardado, e nada mais', async () => {
    vi.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
      sched('p1', 'checkin_prompt'),
      sched('t1', 'checkin_timeout'),
      sched('alarm-1', 'alarm'),
      sched('x'),
    ]);
    vi.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
      k === 'vigora_checkin_prompt_id' ? 'stored-p' : null
    );

    await cancelLegacyCheckinNotifications();

    const cancelled = vi.mocked(Notifications.cancelScheduledNotificationAsync).mock.calls.map((c) => c[0]).sort();
    expect(cancelled).toEqual(['p1', 'stored-p', 't1']);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      'vigora_checkin_prompt_id', 'vigora_checkin_timeout_id',
    ]);
  });

  it('falha do sistema é logada, não engolida nem lançada', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(Notifications.getAllScheduledNotificationsAsync).mockRejectedValue(new Error('boom'));
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    await expect(cancelLegacyCheckinNotifications()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
