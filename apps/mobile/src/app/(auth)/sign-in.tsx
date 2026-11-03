import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInValues } from '@family-finance/core';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { BrandMark, Button, Screen, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { isNativeAppleSignInAvailable, signInWithAppleNative, signInWithOAuth, signInWithPassword } from '@/features/auth/api';

export default function SignIn() {
  const theme = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null);
  const [nativeApple, setNativeApple] = useState(false);

  useEffect(() => {
    void isNativeAppleSignInAvailable().then(setNativeApple);
  }, []);

  const { control, handleSubmit, formState } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signInWithPassword(values.email, values.password);
    } catch (error) {
      setFormError(toAppError(error).message);
    }
  });

  const oauth = async (provider: 'google' | 'apple') => {
    setFormError(null);
    setOauthBusy(provider);
    try {
      if (provider === 'apple' && nativeApple) await signInWithAppleNative();
      else await signInWithOAuth(provider);
    } catch (error) {
      setFormError(toAppError(error).message);
    } finally {
      setOauthBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edgeTop contentStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <BrandMark size={72} />
          </View>
          <Text variant="largeTitle" align="center">
            Family Finance
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            One place for your household’s money — together.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                label="Email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                error={formState.errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <TextField
                label="Password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={() => void submit()}
                error={formState.errors.password?.message}
              />
            )}
          />
          {formError ? (
            <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
          <Button label="Sign in" onPress={() => void submit()} loading={formState.isSubmitting} />
          <Link href="/forgot-password" style={{ alignSelf: 'center' }}>
            <Text variant="subhead" color="primary">
              Forgot password?
            </Text>
          </Link>
        </View>

        <View style={styles.divider}>
          <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
          <Text variant="caption" color="textTertiary">
            OR
          </Text>
          <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {nativeApple ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                theme.scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={theme.radii.md}
              style={{ height: 52 }}
              onPress={() => void oauth('apple')}
            />
          ) : (
            <Button label="Continue with Apple" icon="logo-apple" variant="secondary" loading={oauthBusy === 'apple'} onPress={() => void oauth('apple')} />
          )}
          <Button label="Continue with Google" icon="logo-google" variant="secondary" loading={oauthBusy === 'google'} onPress={() => void oauth('google')} />
        </View>

        <View style={styles.footer}>
          <Text variant="callout" color="textSecondary">
            New here?
          </Text>
          <Link href="/sign-up">
            <Text variant="headline" color="primary">
              Create an account
            </Text>
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 28, paddingTop: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 8 },
  logo: { marginBottom: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});
