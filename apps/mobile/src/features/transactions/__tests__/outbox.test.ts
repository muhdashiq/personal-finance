import type { TablesInsert } from '@/types/database';

const mockUpsert = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(() => ({ upsert: mockUpsert })) },
}));

// eslint-disable-next-line import/first
import { enqueueTransaction, syncOutbox, useOutbox } from '../outbox';

const row = (id: string): TablesInsert<'transactions'> => ({
  id,
  family_id: 'fam-1',
  type: 'expense',
  title: 'Chai',
  amount: 20,
  currency: 'INR',
  occurred_on: '2026-11-03',
  spent_by_member_id: 'm-1',
  created_by: 'u-1',
});

beforeEach(() => {
  useOutbox.getState().clear();
  mockUpsert.mockReset();
});

describe('offline outbox', () => {
  it('does not queue the same transaction twice', () => {
    enqueueTransaction(row('a'));
    enqueueTransaction(row('a'));
    expect(useOutbox.getState().items).toHaveLength(1);
  });

  it('syncs idempotently using the client id and removes synced rows', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    enqueueTransaction(row('a'));
    enqueueTransaction(row('b'));
    const changed = await syncOutbox();
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { onConflict: 'id', ignoreDuplicates: true });
    expect(useOutbox.getState().items).toHaveLength(0);
    expect([...changed]).toEqual(['fam-1']);
  });

  it('stops on network errors and keeps the rows for later', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'TypeError: Network request failed' } });
    enqueueTransaction(row('a'));
    enqueueTransaction(row('b'));
    await syncOutbox();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().items.map((i) => i.status)).toEqual(['pending', 'pending']);
  });

  it('marks server rejections as failed instead of dropping them', async () => {
    mockUpsert
      .mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy', code: '42501' } })
      .mockResolvedValueOnce({ error: null });
    enqueueTransaction(row('a'));
    enqueueTransaction(row('b'));
    await syncOutbox();
    const items = useOutbox.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'a', status: 'failed', error: 'You do not have permission to do that.' });

    // A retried item is attempted again.
    useOutbox.getState().retry('a');
    mockUpsert.mockResolvedValueOnce({ error: null });
    await syncOutbox();
    expect(useOutbox.getState().items).toHaveLength(0);
  });
});
