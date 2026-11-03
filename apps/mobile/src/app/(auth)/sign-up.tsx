import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, type SignUpValues } from '@family-finance/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { signUpWithPassword } from '@/features/auth/api';

export default function SignUp() {
  const theme = useTheme();
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const needsConfirmation = await signUpWithPassword(values.displayName, values.email, values.password);
      if (needsConfirmation) setCheckEmail(values.email);
    } catch (error) {
      setFormError(toAppError(error).message);
    }
  });

  if (checkEmail) {
    return (
      <Screen edgeTop contentStyle={{ paddingTop: 96 }}>
        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="title2">Check your email</Text>
          <Text variant="callout" color="textSecondary">
            We sent a confirmation link to {checkEmail}. Open it on this device, then sign in.
          </Text>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} variant="secondary" />
        </Card>
      </Screen>
    );
  }

  const field = (name: keyof SignUpValues, label: string, props: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f }) => (
        <TextField label={label} value={f.value} onChangeText={f.onChange} onBlur={f.onBlur} error={formState.errors[name]?.message} {...props} />
      )}
    />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edgeTop contentStyle={{ paddingTop: 72, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 6 }}>
          <Text variant="largeTitle">Create account</Text>
          <Text variant="callout" color="textSecondary">
            You can create a family or join one after signing up.
          </Text>
        </View>
        <View style={{ gap: theme.spacing.md }}>
          {field('displayName', 'Your name', { autoComplete: 'name', textContentType: 'name' })}
          {field('email', 'Email', { autoCapitalize: 'none', keyboardType: 'email-address', autoComplete: 'email', textContentType: 'emailAddress' })}
          {field('password', 'Password', { secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword', helper: 'At least 8 characters with a letter and a number' })}
          {field('confirmPassword', 'Confirm password', { secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword' })}
          {formError ? (
            <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
          <Button label="Create account" onPress={() => void submit()} loading={formState.isSubmitting} />
          <Text variant="footnote" color="textTertiary" align="center">
            Your financial data is private to your family and protected by row-level security.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
