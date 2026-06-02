import { describe, expect, it } from 'vitest';
import {
  caregiverReducer,
  DEFAULT_CAREGIVER_STATE,
  type CaregiverState,
  type LinkedMonitored,
} from '@/lib/caregiver-state';

const link: LinkedMonitored = {
  id: 'uuid-1',
  monitoredOpenId: 'open-maria',
  method: 'code',
  identifier: '123456',
  displayName: 'Maria',
  relationship: 'mãe',
  linkedAt: 1_700_000_000_000,
  status: 'active',
};

describe('caregiverReducer', () => {
  it('LOAD replaces the whole state', () => {
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, {
      type: 'LOAD',
      payload: { ...DEFAULT_CAREGIVER_STATE, linkedMonitored: link },
    });
    expect(next.linkedMonitored).toEqual(link);
  });

  it('SET_LINK stores the stub', () => {
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, { type: 'SET_LINK', payload: link });
    expect(next.linkedMonitored).toEqual(link);
  });

  it('CLEAR_LINK removes the stub', () => {
    const withLink: CaregiverState = { ...DEFAULT_CAREGIVER_STATE, linkedMonitored: link };
    const next = caregiverReducer(withLink, { type: 'CLEAR_LINK' });
    expect(next.linkedMonitored).toBeNull();
  });

  it('UPDATE_PREFS merges partial preferences', () => {
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, {
      type: 'UPDATE_PREFS',
      payload: { missedMedication: false },
    });
    expect(next.notificationPrefs.missedMedication).toBe(false);
    expect(next.notificationPrefs.sosTriggered).toBe(DEFAULT_CAREGIVER_STATE.notificationPrefs.sosTriggered);
  });

  it('DEFAULT_CAREGIVER_STATE has all notification prefs on', () => {
    expect(DEFAULT_CAREGIVER_STATE.linkedMonitored).toBeNull();
    expect(DEFAULT_CAREGIVER_STATE.notificationPrefs).toEqual({
      missedMedication: true,
      sosTriggered: true,
      deadManSwitch: true,
    });
  });

  it('unknown actions return the same state reference', () => {
    // toBe = reference equality. Important so React's useReducer doesn't
    // trigger spurious re-renders when an unrecognized action slips through.
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, { type: 'UNKNOWN' } as never);
    expect(next).toBe(DEFAULT_CAREGIVER_STATE);
  });
});
