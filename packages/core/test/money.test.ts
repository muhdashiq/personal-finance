import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatMoneyCompact,
  fromDb,
  maskLast4,
  parseAmountInput,
  percentChange,
  percentOf,
  sumMinor,
  toDecimalString,
  toInputString,
  tryParseAmountInput,
} from '../src/money';

describe('parseAmountInput', () => {
  it.each([
    ['450', 45_000],
    ['450.5', 45_050],
    ['450.50', 45_050],
    ['1,23,456.75', 12_345_675],
    ['₹ 2,999.99', 299_999],
    ['Rs. 100', 10_000],
    ['0.01', 1],
    ['-25.10', -2_510],
  ])('parses %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '12..3', '1e5', '--5'])('rejects %s', (input) => {
    expect(tryParseAmountInput(input)).toBeNull();
  });

  it('rejects amounts beyond numeric(14,2)', () => {
    expect(tryParseAmountInput('1000000000000')).toBeNull();
    expect(parseAmountInput('999999999999.99')).toBe(99_999_999_999_999);
  });

  it('avoids floating point errors that naive parsing would introduce', () => {
    // parseFloat('0.29') * 100 = 28.999999999999996
    expect(parseAmountInput('0.29')).toBe(29);
    expect(parseAmountInput('1.005'.slice(0, 4))).toBe(100);
  });
});

describe('fromDb / toDecimalString', () => {
  it('reads numbers and strings from the database exactly', () => {
    expect(fromDb(4250.75)).toBe(425_075);
    expect(fromDb('4250.75')).toBe(425_075);
    expect(fromDb('85000')).toBe(8_500_000);
    expect(fromDb(0.1 + 0.2)).toBe(30);
    expect(fromDb(null)).toBe(0);
    expect(fromDb('-12.50')).toBe(-1_250);
  });

  it('round-trips to the exact decimal string sent to numeric columns', () => {
    expect(toDecimalString(45_050)).toBe('450.50');
    expect(toDecimalString(5)).toBe('0.05');
    expect(toDecimalString(-1_250)).toBe('-12.50');
    expect(toInputString(45_000)).toBe('450');
    expect(toInputString(45_050)).toBe('450.50');
    for (const minor of [0, 1, 99, 100, 123_456_789]) {
      expect(fromDb(toDecimalString(minor))).toBe(minor);
    }
  });

  it('refuses non-integer minor units', () => {
    expect(() => toDecimalString(1.5)).toThrow();
  });
});

describe('formatting', () => {
  it('uses Indian digit grouping for INR', () => {
    expect(formatMoney(12_345_650, 'INR')).toBe('₹1,23,456.50');
    expect(formatMoney(10_000_000_000, 'INR')).toBe('₹10,00,00,000.00');
    expect(formatMoney(99_900, 'INR')).toBe('₹999.00');
  });

  it('uses Western grouping for other currencies', () => {
    expect(formatMoney(12_345_650, 'USD')).toBe('$123,456.50');
  });

  it('supports signs and whole-number display', () => {
    expect(formatMoney(-45_050, 'INR')).toBe('−₹450.50');
    expect(formatMoney(45_050, 'INR', { signed: true })).toBe('+₹450.50');
    expect(formatMoney(45_050, 'INR', { wholeOnly: true })).toBe('₹451');
    expect(formatMoney(45_000, 'INR', { trimZeroFraction: true })).toBe('₹450');
  });

  it('formats compact amounts with lakh and crore for INR', () => {
    expect(formatMoneyCompact(15_000_000, 'INR')).toBe('₹1.5L');
    expect(formatMoneyCompact(2_500_000_000, 'INR')).toBe('₹2.5Cr');
    expect(formatMoneyCompact(4_500_000, 'INR')).toBe('₹45K');
    expect(formatMoneyCompact(80_000, 'INR')).toBe('₹800');
    expect(formatMoneyCompact(250_000_000, 'USD')).toBe('$2.5M');
  });

  it('masks account numbers', () => {
    expect(maskLast4('1234')).toBe('•• 1234');
    expect(maskLast4(null)).toBe('');
  });
});

describe('arithmetic helpers', () => {
  it('sums and computes percentages', () => {
    expect(sumMinor([45_050, 299_999, -99_999])).toBe(245_050);
    expect(percentOf(2_500, 10_000)).toBe(25);
    expect(percentOf(1, 0)).toBeNull();
    expect(percentChange(11_800, 10_000)).toBe(18);
    expect(percentChange(8_000, 10_000)).toBe(-20);
    expect(percentChange(5, 0)).toBeNull();
  });
});
