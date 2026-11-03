import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Encrypted key/value storage (Supabase session, offline transaction queue).
 *
 * The Keychain/Keystore (expo-secure-store) limits values to ~2 KB, which a
 * Supabase session can exceed. Following Supabase's recommended pattern, the
 * session is encrypted with a random AES-256 key; the key lives in the secure
 * store and only the ciphertext goes to AsyncStorage.
 *
 * On web (development only) the browser's localStorage is used.
 */
export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keyName = (key: string) => `enc-key.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;

const encrypt = async (key: string, value: string): Promise<string> => {
  const encryptionKey = Crypto.getRandomBytes(32);
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(keyName(key), aesjs.utils.hex.fromBytes(encryptionKey), KEY_OPTIONS);
  return aesjs.utils.hex.fromBytes(encrypted);
};

const decrypt = async (key: string, value: string): Promise<string | null> => {
  const hexKey = await SecureStore.getItemAsync(keyName(key), KEY_OPTIONS);
  if (!hexKey) return null;
  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexKey), new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
};

const nativeStorage: StorageAdapter = {
  async getItem(key) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await decrypt(key, encrypted);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    await AsyncStorage.setItem(key, await encrypt(key, value));
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keyName(key), KEY_OPTIONS);
  },
};

const webStorage: StorageAdapter = {
  getItem: async (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key, value) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

export const encryptedStorage: StorageAdapter = Platform.OS === 'web' ? webStorage : nativeStorage;
