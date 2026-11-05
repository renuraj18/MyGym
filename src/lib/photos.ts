import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

const DIR = FileSystem.documentDirectory + 'photos/';

async function keep(uri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  const dest = `${DIR}${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Lets the user take or pick a square photo; resolves to a permanent file uri, or null if cancelled. */
export async function pickPhoto(source: 'camera' | 'gallery'): Promise<string | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access in phone settings to take member photos.');
      return null;
    }
    const r = await ImagePicker.launchCameraAsync(opts);
    if (r.canceled || !r.assets?.[0]) return null;
    return keep(r.assets[0].uri);
  }
  const r = await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  return keep(r.assets[0].uri);
}

export function choosePhoto(onPicked: (uri: string) => void, onRemove?: () => void) {
  const buttons: any[] = [
    { text: 'Take photo', onPress: async () => { const u = await pickPhoto('camera'); if (u) onPicked(u); } },
    { text: 'From gallery', onPress: async () => { const u = await pickPhoto('gallery'); if (u) onPicked(u); } },
  ];
  if (onRemove) buttons.push({ text: 'Remove photo', style: 'destructive', onPress: onRemove });
  buttons.push({ text: 'Cancel', style: 'cancel' });
  Alert.alert('Member photo', undefined, buttons);
}
