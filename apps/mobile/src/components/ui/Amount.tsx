import { formatMoney, formatMoneyCompact, type Minor, type TransactionType } from '@family-finance/core';
import { Text, type TextProps } from './Text';

type AmountProps = Omit<TextProps, 'children'> & {
  minor: Minor;
  currency?: string;
  /** Colour and sign by transaction type. */
  type?: TransactionType;
  compact?: boolean;
  wholeOnly?: boolean;
};

const typeColor = (type?: TransactionType): TextProps['color'] => {
  switch (type) {
    case 'income':
    case 'refund':
      return 'income';
    case 'expense':
      return 'text';
    case 'transfer':
      return 'textSecondary';
    default:
      return undefined;
  }
};

/** Formatted money with tabular figures and an accessible label. */
export const Amount = ({ minor, currency = 'INR', type, compact, wholeOnly, color, ...rest }: AmountProps) => {
  const signed = type === 'income' || type === 'refund';
  const value = type === 'expense' ? -Math.abs(minor) : minor;
  const text = compact ? formatMoneyCompact(value, currency) : formatMoney(value, currency, { signed, wholeOnly });
  return (
    <Text
      tabular
      accessibilityLabel={formatMoney(value, currency)}
      color={color ?? typeColor(type) ?? 'text'}
      {...rest}
    >
      {text}
    </Text>
  );
};
