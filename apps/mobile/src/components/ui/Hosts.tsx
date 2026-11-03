import { Button as PaperButton, Dialog, Portal, Snackbar } from 'react-native-paper';
import { useConfirmStore } from '@/stores/confirm';
import { useToast } from '@/stores/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** Renders global toasts (snackbars). Mount once at the root. */
export const ToastHost = () => {
  const theme = useTheme();
  const current = useToast((s) => s.current);
  const dismiss = useToast((s) => s.dismiss);
  const background = current?.tone === 'error' ? theme.colors.danger : current?.tone === 'success' ? theme.colors.income : theme.colors.text;
  return (
    <Portal>
      <Snackbar
        key={current?.id}
        visible={Boolean(current)}
        onDismiss={dismiss}
        duration={3500}
        style={{ backgroundColor: background, borderRadius: theme.radii.md, marginBottom: 90 }}
      >
        <Text variant="callout" style={{ color: theme.scheme === 'dark' && current?.tone === 'default' ? theme.colors.background : '#FFFFFF' }}>
          {current?.message ?? ''}
        </Text>
      </Snackbar>
    </Portal>
  );
};

/** Renders confirmation dialogs requested through confirm(). */
export const ConfirmHost = () => {
  const theme = useTheme();
  const request = useConfirmStore((s) => s.request);
  const close = useConfirmStore((s) => s.close);
  return (
    <Portal>
      <Dialog visible={Boolean(request)} onDismiss={() => close(false)} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl }}>
        <Dialog.Title style={[theme.typography.title3, { color: theme.colors.text }]}>{request?.title ?? ''}</Dialog.Title>
        {request?.message ? (
          <Dialog.Content>
            <Text variant="callout" color="textSecondary">
              {request.message}
            </Text>
          </Dialog.Content>
        ) : null}
        <Dialog.Actions>
          <PaperButton onPress={() => close(false)} textColor={theme.colors.textSecondary}>
            Cancel
          </PaperButton>
          <PaperButton onPress={() => close(true)} textColor={request?.destructive ? theme.colors.danger : theme.colors.primary}>
            {request?.confirmLabel ?? 'Confirm'}
          </PaperButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};
