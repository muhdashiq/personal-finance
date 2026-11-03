import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  formatDisplayDate,
  formatRange,
  formatRelativeDay,
  isISODate,
  parseStatementDate,
  previousRange,
  rangeForPreset,
  startOfWeek,
} from '../src/dates';

describe('calendar helpers', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-2-3')).toBe(false);
  });

  it('adds days and months with month-end clamping', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(endOfMonth('2026-11-03')).toBe('2026-11-30');
  });

  it('uses Monday as the start of the week', () => {
    expect(startOfWeek('2026-11-03')).toBe('2026-11-02'); // Tuesday -> Monday
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02'); // Sunday -> Monday
  });

  it('counts days across DST-free calendar dates', () => {
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
    expect(daysBetween('2026-11-03', '2026-11-01')).toBe(-2);
  });
});

describe('period presets', () => {
  const today = '2026-11-03';

  it('builds preset ranges', () => {
    expect(rangeForPreset('this_month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(rangeForPreset('last_month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeForPreset('last_6_months', today)).toEqual({ from: '2026-06-01', to: '2026-11-30' });
    expect(rangeForPreset('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(rangeForPreset('this_week', today)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('computes the comparison period', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange({ from: '2026-06-01', to: '2026-11-30' })).toEqual({ from: '2025-12-01', to: '2026-05-31' });
    expect(previousRange({ from: '2026-11-02', to: '2026-11-08' })).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });
});

describe('display formatting', () => {
  it('formats dates relative to today', () => {
    expect(formatRelativeDay('2026-11-03', '2026-11-03')).toBe('Today');
    expect(formatRelativeDay('2026-11-02', '2026-11-03')).toBe('Yesterday');
    expect(formatDisplayDate('2026-10-21', '2026-11-03')).toBe('21 Oct');
    expect(formatDisplayDate('2025-10-21', '2026-11-03')).toBe('21 Oct 2025');
    expect(formatRange({ from: '2026-11-01', to: '2026-11-30' }, '2026-11-03')).toBe('Nov 2026');
    expect(formatRange({ from: '2026-10-01', to: '2026-11-30' }, '2026-11-03')).toBe('1 Oct – 30 Nov');
  });
});

describe('parseStatementDate', () => {
  it.each([
    ['03/11/2026', '2026-11-03'],
    ['03-11-26', '2026-11-03'],
    ['03.11.2026', '2026-11-03'],
    ['3 Nov 2026', '2026-11-03'],
    ['03-NOV-26', '2026-11-03'],
    ['03Nov2026', '2026-11-03'],
    ['2026-11-03', '2026-11-03'],
    ['Nov 03, 2026', '2026-11-03'],
    ['29 Sept 2026', '2026-09-29'],
  ])('parses %s', (input, expected) => {
    expect(parseStatementDate(input)).toBe(expected);
  });

  it('supports month-first statements when told so', () => {
    expect(parseStatementDate('11/03/2026', { dayFirst: false })).toBe('2026-11-03');
  });

  it.each(['31/02/2026', 'yesterday', '', '2026/13/01'])('rejects %s', (input) => {
    expect(parseStatementDate(input)).toBeNull();
  });
});
