/**
 * location-permission.ts
 *
 * Manages location permission requests for the Vigora Saúde app.
 *
 * Two levels of permission:
 * 1. Foreground ("Enquanto usa o app") - required for SOS when app is open
 * 2. Background ("O tempo todo") - required for SOS when app is minimized/closed
 *
 * Android 10+ requires the user to manually enable "Allow all the time" in Settings.
 * We guide them with a step-by-step modal.
 */

import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export type LocationPermissionStatus =
  | 'not_requested'
  | 'foreground_granted'
  | 'background_granted'
  | 'denied';

/**
 * Request foreground location permission.
 * Returns true if granted.
 */
export async function requestForegroundLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Request background location permission.
 * On Android 10+, the user must manually enable "Allow all the time" in Settings.
 * Returns true if background permission is already granted.
 */
export async function requestBackgroundLocation(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Check current location permission status.
 */
export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') return 'background_granted';

    return 'foreground_granted';
  } catch {
    return 'not_requested';
  }
}

/**
 * Open the app's system settings page so the user can manually
 * enable "Allow all the time" for location.
 */
export async function openLocationSettings(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL('app-settings:');
  } else {
    await Linking.openSettings();
  }
}

/**
 * Check if background location is already granted.
 */
export async function isBackgroundLocationGranted(): Promise<boolean> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Check if foreground location is already granted.
 */
export async function isForegroundLocationGranted(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}
