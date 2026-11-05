import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const PIN_KEY = 'mygym_pin';

export async function hasPin(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(PIN_KEY));
}

export async function savePin(pin: string) {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function clearPin() {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function checkPin(pin: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) === pin;
}

export async function biometricsAvailable(): Promise<boolean> {
  const [hw, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hw && enrolled;
}

/** Fingerprint / face unlock. With `allowDeviceCredential` the phone's own screen lock also works (used for "Forgot PIN"). */
export async function unlockWithBiometrics(allowDeviceCredential = false): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: allowDeviceCredential ? 'Verify it is you to reset the PIN' : 'Unlock MyGym',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: !allowDeviceCredential,
  });
  return r.success;
}
