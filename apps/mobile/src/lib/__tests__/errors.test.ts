import { AppError, toAppError, unwrap } from '../errors';

describe('toAppError', () => {
  it('detects network failures', () => {
    const e = toAppError({ message: 'TypeError: Network request failed' });
    expect(e.isNetwork).toBe(true);
  });

  it('turns RLS and FK violations into friendly messages', () => {
    expect(toAppError({ code: '42501', message: 'new row violates row-level security policy for table "transactions"' }).message).toBe(
      'You do not have permission to do that.',
    );
    expect(toAppError({ code: '23503', message: 'update or delete on table "bank_accounts" violates foreign key' }).message).toMatch(
      /still in use/,
    );
  });

  it('passes through messages raised deliberately by SQL functions', () => {
    expect(toAppError({ code: '22023', message: 'A family needs at least one admin' }).message).toBe('A family needs at least one admin');
    expect(toAppError({ code: '42501', message: 'Only family admins can invite members' }).message).toBe(
      'Only family admins can invite members',
    );
  });

  it('hides unexpected internal errors', () => {
    const e = toAppError({ code: 'XX000', message: 'internal: relation pg_secret does not exist' });
    expect(e.message).toBe('Something went wrong. Please try again.');
  });
});

describe('unwrap', () => {
  it('returns data or throws AppError', () => {
    expect(unwrap({ data: [1], error: null })).toEqual([1]);
    expect(() => unwrap({ data: null, error: { code: '22023', message: 'Nope' } })).toThrow(AppError);
  });
});
