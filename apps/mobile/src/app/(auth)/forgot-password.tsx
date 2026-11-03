import { useState } from 'react';
import { View } from 'react-native';
import { Button, Screen, Text, TextField } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { useTheme } from '@/theme/ThemeProvider';
import { sendPasswordReset } from '@/features/auth/api';

export default function ForgotPassword() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setMessage({ text: 'Enter a valid email address', error: true });
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email.trim().toLowerCase());
      // Same message whether or not the account exists (no account enumeration).
      setMessage({ text: 'If an account exists for that email, a reset link is on its way.', error: false });
    } catch (error) {
      setMessage({ text: toAppError(error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edgeTop contentStyle={{ paddingTop: 72, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <View style={{ gap: 6 }}>
        <Text variant="largeTitle">Reset password</Text>
        <Text variant="callout" color="textSecondary">
          We’ll email you a link to choose a new password.
        </Text>
      </View>
      <View style={{ gap: theme.spacing.md }}>
        <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        {message ? (
          <Text variant="footnote" color={message.error ? 'danger' : 'income'}>
            {message.text}
          </Text>
        ) : null}
        <Button label="Send reset link" onPress={() => void submit()} loading={busy} />
      </View>
    </Screen>
  );
}
