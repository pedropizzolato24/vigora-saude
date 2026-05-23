/**
 * caregiver-state.ts
 *
 * Pure types + reducer for the caregiver-side state. The state is wired to
 * a React provider in `lib/caregiver-context.tsx`; this file exists separately
 * so the reducer stays unit-testable and free of React/AsyncStorage imports.
 */

export type LinkMethod = 'code' | 'email_phone' | 'qr';

export interface LinkedMonitored {
  id: string;
  method: LinkMethod;
  identifier: string;
  displayName: string;
  relationship?: string;
  linkedAt: number;
  status: 'pending';
}

export interface CaregiverNotificationPrefs {
  missedMedication: boolean;
  sosTriggered: boolean;
  deadManSwitch: boolean;
}

export interface CaregiverState {
  linkedMonitored: LinkedMonitored | null;
  notificationPrefs: CaregiverNotificationPrefs;
}

export const DEFAULT_CAREGIVER_STATE: CaregiverState = {
  linkedMonitored: null,
  notificationPrefs: {
    missedMedication: true,
    sosTriggered: true,
    deadManSwitch: true,
  },
};

export type CaregiverAction =
  | { type: 'LOAD'; payload: CaregiverState }
  | { type: 'SET_LINK'; payload: LinkedMonitored }
  | { type: 'CLEAR_LINK' }
  | { type: 'UPDATE_PREFS'; payload: Partial<CaregiverNotificationPrefs> };

export function caregiverReducer(state: CaregiverState, action: CaregiverAction): CaregiverState {
  switch (action.type) {
    case 'LOAD':
      return action.payload;
    case 'SET_LINK':
      return { ...state, linkedMonitored: action.payload };
    case 'CLEAR_LINK':
      return { ...state, linkedMonitored: null };
    case 'UPDATE_PREFS':
      return {
        ...state,
        notificationPrefs: { ...state.notificationPrefs, ...action.payload },
      };
    default:
      return state;
  }
}
