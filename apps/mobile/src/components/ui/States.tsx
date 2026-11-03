import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

export const EmptyState = ({ icon, title, message, actionLabel, onAction, compact }: EmptyStateProps) => {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? theme.spacing.xl : theme.spacing.xxxl * 1.5, gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xl }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.colors.primaryContainer,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: theme.spacing.xs,
        }}
      >
        <Ionicons name={icon} size={26} color={theme.colors.primary} />
      </View>
      <Text variant="headline" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" color="textSecondary" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} size="md" />
        </View>
      ) : null}
    </View>
  );
};

type ErrorStateProps = { message: string; onRetry?: () => void };

export const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
  <EmptyState icon="cloud-offline-outline" title="Couldn’t load this" message={message} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} compact />
);
