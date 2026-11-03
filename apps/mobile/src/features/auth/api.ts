import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { AppError, check, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export const signInWithPassword = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new AppError(
      /invalid login credentials/i.test(error.message) ? 'Email or password is incorrect.' : error.message,
      { code: 'auth', cause: error },
    );
  }
};

/** Returns true when the project requires email confirmation before signing in. */
export const signUpWithPassword = async (displayName: string, email: string, password: string): Promise<boolean> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: Linking.createURL('/sign-in'),
    },
  });
  if (error) throw toAppError(error);
  return !data.session;
};

export const sendPasswordReset = async (email: string) => {
  check(await supabase.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/sign-in') }));
};

export const signOut = async () => {
  check(await supabase.auth.signOut());
};

/**
 * OAuth via the system browser with PKCE. Works for Google on iOS/Android
 * and for Apple on Android. Requires the redirect URL
 * (familyfinance://auth-callback) in Supabase Auth → URL Configuration.
 */
export const signInWithOAuth = async (provider: 'google' | 'apple') => {
  const redirectTo = Linking.createURL('/auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
  });
  if (error) throw toAppError(error);
  if (Platform.OS === 'web') return;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user cancelled

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  const errorDescription = typeof queryParams?.error_description === 'string' ? queryParams.error_description : null;
  if (errorDescription) throw new AppError(errorDescription, { code: 'auth' });
  if (!code) throw new AppError('Sign-in did not complete. Please try again.', { code: 'auth' });
  check(await supabase.auth.exchangeCodeForSession(code));
};

export const isNativeAppleSignInAvailable = async (): Promise<boolean> =>
  Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());

/** Native Sign in with Apple on iOS, exchanged for a Supabase session. */
export const signInWithAppleNative = async () => {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
    throw toAppError(error);
  }
  if (!credential.identityToken) throw new AppError('Apple did not return an identity token.', { code: 'auth' });

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw toAppError(error);

  // Apple only shares the name on the first sign-in; keep it.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  if (fullName) {
    await supabase.auth.updateUser({ data: { display_name: fullName } });
  }
};

/** Deletes the account through the delete-account Edge Function. */
export const deleteAccount = async () => {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = 'Could not delete your account. Please try again.';
    try {
      const body = (await context?.json()) as { error?: string } | undefined;
      if (body?.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new AppError(message, { code: 'delete_account', cause: error });
  }
  await supabase.auth.signOut({ scope: 'local' });
};
