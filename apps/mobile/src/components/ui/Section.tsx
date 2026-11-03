import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from './Card';
import { Text } from './Text';

type SectionProps = {
  title?: string;
  action?: ReactNode;
  footer?: string;
  children: ReactNode;
  /** Render children inside a grouped card with separators (default). */
  grouped?: boolean;
};

/** A titled group of rows, iOS "inset grouped" style. */
export const Section = ({ title, action, footer, children, grouped = true }: SectionProps) => {
  const theme = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {title || action ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.xs }}>
          {title ? (
            <Text variant="title3" accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      ) : null}
      {grouped ? (
        <Card padded={false}>
          {items.map((child, index) => (
            <Fragment key={index}>
              {index > 0 ? (
                <View style={{ height: 1, backgroundColor: theme.colors.separator, marginLeft: theme.spacing.lg }} />
              ) : null}
              {child}
            </Fragment>
          ))}
        </Card>
      ) : (
        children
      )}
      {footer ? (
        <Text variant="footnote" color="textTertiary" style={{ paddingHorizontal: theme.spacing.xs }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
};
