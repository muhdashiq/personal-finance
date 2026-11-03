import * as ExpoCrypto from 'expo-crypto';

/**
 * Hermes (the React Native JS engine) has no WebCrypto. supabase-js uses
 * crypto.getRandomValues and crypto.subtle.digest to create the PKCE
 * challenge for OAuth sign-in; without them it falls back to the weaker
 * "plain" method. expo-crypto provides native implementations of both.
 * Must be imported before the Supabase client is created.
 */
type CryptoLike = {
  getRandomValues?: typeof ExpoCrypto.getRandomValues;
  subtle?: { digest: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer> };
};

const g = globalThis as unknown as { crypto?: CryptoLike };
g.crypto ??= {};

if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = ExpoCrypto.getRandomValues;
}

if (!g.crypto.subtle) {
  g.crypto.subtle = {
    digest: (algorithm, data) => ExpoCrypto.digest(algorithm as ExpoCrypto.CryptoDigestAlgorithm, data),
  };
}
