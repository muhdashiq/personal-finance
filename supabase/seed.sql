-- =============================================================================
-- Development seed data (runs after migrations on `supabase db reset`).
-- Creates two demo logins sharing one family, with accounts, cards and four
-- months of realistic transactions relative to today's date.
--
--   ashiq@example.com / FamilyFinance#2026   (admin)
--   sara@example.com  / FamilyFinance#2026   (member, spouse)
--
-- NEVER run this against a production database.
-- =============================================================================

do $$
declare
  v_ashiq uuid := '11111111-1111-4111-8111-111111111111';
  v_sara uuid := '22222222-2222-4222-8222-222222222222';
  v_family uuid;
  m_ashiq uuid;
  m_sara uuid;
  m_ayaan uuid;
  a_hdfc uuid;
  a_sbi uuid;
  c_icici uuid;
  c_millennia uuid;
  v_month date;
  i integer;
begin
  if exists (select 1 from auth.users where id = v_ashiq) then
    raise notice 'Seed data already present, skipping';
    return;
  end if;

  -- Demo logins (Supabase Auth schema).
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_ashiq, 'authenticated', 'authenticated', 'ashiq@example.com',
     extensions.crypt('FamilyFinance#2026', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Ashiq"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_sara, 'authenticated', 'authenticated', 'sara@example.com',
     extensions.crypt('FamilyFinance#2026', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Sara"}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_ashiq, v_ashiq::text, jsonb_build_object('sub', v_ashiq::text, 'email', 'ashiq@example.com'), 'email', now(), now(), now()),
    (gen_random_uuid(), v_sara, v_sara::text, jsonb_build_object('sub', v_sara::text, 'email', 'sara@example.com'), 'email', now(), now(), now());

  -- Family creation goes through the same RPC the app uses.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ashiq, 'email', 'ashiq@example.com', 'role', 'authenticated')::text, true);
  v_family := public.create_family('Ashiq''s Family', 'INR', 'Ashiq');
  select id into m_ashiq from public.family_members where family_id = v_family and user_id = v_ashiq;

  insert into public.family_members (family_id, user_id, display_name, relationship, role, color, joined_at)
  values (v_family, v_sara, 'Sara', 'spouse', 'member', '#D9547A', now())
  returning id into m_sara;
  insert into public.family_members (family_id, display_name, relationship, role, color)
  values (v_family, 'Ayaan', 'child', 'member', '#1A9E8F')
  returning id into m_ayaan;
  update public.profiles set default_family_id = v_family where id = v_sara;

  v_month := (date_trunc('month', current_date) - interval '3 months')::date;

  insert into public.bank_accounts (family_id, owner_member_id, bank_name, nickname, account_type, last4, opening_balance, opening_balance_date, created_by)
  values (v_family, m_ashiq, 'HDFC Bank', 'Salary account', 'salary', '4821', 85000, v_month, v_ashiq)
  returning id into a_hdfc;
  insert into public.bank_accounts (family_id, owner_member_id, bank_name, nickname, account_type, last4, opening_balance, opening_balance_date, created_by)
  values (v_family, m_sara, 'State Bank of India', 'Savings', 'savings', '1937', 42000, v_month, v_sara)
  returning id into a_sbi;
  insert into public.credit_cards (family_id, owner_member_id, issuer, nickname, network, last4, credit_limit, statement_day, payment_due_day, opening_outstanding, opening_balance_date, created_by)
  values (v_family, m_ashiq, 'ICICI Bank', 'Amazon Pay', 'visa', '7704', 250000, 18, 5, 0, v_month, v_ashiq)
  returning id into c_icici;
  insert into public.credit_cards (family_id, owner_member_id, issuer, nickname, network, last4, credit_limit, statement_day, payment_due_day, opening_outstanding, opening_balance_date, created_by)
  values (v_family, m_sara, 'HDFC Bank', 'Millennia', 'mastercard', '3310', 150000, 22, 10, 0, v_month, v_sara)
  returning id into c_millennia;

  create temporary table seed_txn (
    day integer, type public.transaction_type, title text, amount numeric, merchant text,
    cat text, sub text, member uuid, bank uuid, card uuid, to_bank uuid, to_card uuid,
    method public.payment_method, months integer[], private boolean default false
  ) on commit drop;

  insert into seed_txn (day, type, title, amount, merchant, cat, sub, member, bank, card, to_bank, to_card, method, months, private) values
    (1,  'income',   'Salary',                  125000,   'Acme Technologies', 'Salary', 'Salary', m_ashiq, a_hdfc, null, null, null, 'bank_transfer', '{0,1,2,3}', false),
    (1,  'income',   'Salary',                   85000,   'Northwind Health',  'Salary', 'Salary', m_sara,  a_sbi,  null, null, null, 'bank_transfer', '{0,1,2,3}', false),
    (2,  'transfer', 'Amazon Pay card bill',     12450,   null, null, null, m_ashiq, a_hdfc, null, null, c_icici,     'net_banking', '{0,1,2}', false),
    (3,  'transfer', 'Millennia card bill',       8930.75, null, null, null, m_sara,  a_sbi,  null, null, c_millennia, 'net_banking', '{0,1,2}', false),
    (3,  'expense',  'Weekly groceries',          4250.75, 'BigBasket',        'Household', 'Groceries', m_sara, null, c_millennia, null, null, null, '{0,1,2,3}', false),
    (5,  'expense',  'House rent',               32000,   'Landlord',          'Household', 'Rent', m_ashiq, a_hdfc, null, null, null, 'bank_transfer', '{0,1,2,3}', false),
    (6,  'expense',  'Dinner order',               512,   'Swiggy',            'Food', 'Food delivery', m_ashiq, null, c_icici, null, null, null, '{0,1,2,3}', false),
    (7,  'expense',  'Mutual fund SIP',          10000,   'Groww',             'Financial', 'Investment', m_ashiq, a_hdfc, null, null, null, 'auto_debit', '{0,1,2,3}', false),
    (8,  'expense',  'Electricity bill',          2140,   'BESCOM',            'Household', 'Electricity', m_ashiq, a_hdfc, null, null, null, 'upi', '{0,1,2,3}', false),
    (9,  'expense',  'Petrol',                    3500,   'Indian Oil',        'Transportation', 'Fuel', m_ashiq, null, c_icici, null, null, null, '{0,1,2,3}', false),
    (10, 'expense',  'Broadband',                 1179,   'ACT Fibernet',      'Household', 'Internet', m_sara, a_sbi, null, null, null, 'auto_debit', '{0,1,2,3}', false),
    (11, 'expense',  'Cab to airport',             386,   'Uber',              'Transportation', 'Taxi', m_sara, a_sbi, null, null, null, 'upi', '{0,1,2}', false),
    (12, 'expense',  'Milk and vegetables',        865,   'Zepto',             'Household', 'Groceries', m_sara, a_sbi, null, null, null, 'upi', '{0,1,2,3}', false),
    (14, 'expense',  'Lunch order',                689,   'Swiggy',            'Food', 'Food delivery', m_sara, null, c_millennia, null, null, null, '{0,1,2,3}', false),
    (15, 'expense',  'Netflix',                    649,   'Netflix',           'Lifestyle', 'Subscriptions', m_ashiq, null, c_icici, null, null, null, '{0,1,2,3}', false),
    (16, 'expense',  'Term school fee',          18500,   'Greenwood School',  'Family', 'Education', m_ayaan, a_hdfc, null, null, null, 'net_banking', '{1}', false),
    (17, 'expense',  'Monthly groceries',         3890,   'BigBasket',         'Household', 'Groceries', m_sara, null, c_millennia, null, null, null, '{0,1,2,3}', false),
    (19, 'expense',  'Family dinner',             2240,   'Zomato',            'Food', 'Restaurants', m_ashiq, null, c_icici, null, null, null, '{0,1,2,3}', false),
    (20, 'expense',  'Medicines',                 1120,   'Apollo Pharmacy',   'Family', 'Medical', m_sara, a_sbi, null, null, null, 'upi', '{0,2}', false),
    (21, 'expense',  'Coffee with friends',        540,   'Starbucks',         'Food', 'Coffee', m_sara, null, c_millennia, null, null, null, '{0,1,2,3}', false),
    (22, 'expense',  'Dinner order',               438,   'Swiggy',            'Food', 'Food delivery', m_ashiq, null, c_icici, null, null, null, '{0,1,2,3}', false),
    (23, 'expense',  'Headphones',                3499,   'Amazon',            'Lifestyle', 'Electronics', m_ashiq, null, c_icici, null, null, null, '{1}', false),
    (24, 'expense',  'Kids clothes',              2799,   'Myntra',            'Lifestyle', 'Clothing', m_ayaan, null, c_millennia, null, null, null, '{0,2}', false),
    (25, 'expense',  'Weekend trip – hotel',     8600,   'MakeMyTrip',        'Lifestyle', 'Travel', m_ashiq, null, c_icici, null, null, null, '{2}', false),
    (26, 'expense',  'Haircut',                    450,   'Local salon',       'Lifestyle', 'Personal care', m_ashiq, null, null, null, null, 'cash', '{0,1,2,3}', false),
    (27, 'refund',   'Headphones returned',       1299,   'Amazon',            'Lifestyle', 'Electronics', m_ashiq, null, c_icici, null, null, null, '{1}', false),
    (28, 'income',   'Savings interest',           612.40, 'SBI',              'Investments', 'Interest', m_sara, a_sbi, null, null, null, 'bank_transfer', '{1}', false),
    (1,  'expense',  'Anniversary gift',          4999,   'Tanishq',           'Family', 'Gifts', m_sara, a_sbi, null, null, null, 'upi', '{0}', true);

  for i in 0..3 loop
    insert into public.transactions (family_id, type, title, amount, currency, occurred_on, category_id, subcategory_id,
                                     payment_method, bank_account_id, credit_card_id, counterparty_bank_account_id,
                                     counterparty_credit_card_id, spent_by_member_id, created_by, merchant, visibility)
    select v_family, s.type, s.title,
           -- small month-to-month variation on variable spending
           case when s.type = 'expense' and s.cat in ('Food', 'Household') and s.sub not in ('Rent', 'Internet')
                then round(s.amount * (1 + (i * 0.07)), 2) else s.amount end,
           'INR',
           ((date_trunc('month', current_date) - make_interval(months => i))::date + (s.day - 1)),
           (select c.id from public.transaction_categories c where c.family_id = v_family and c.parent_id is null and c.name = s.cat),
           (select c.id from public.transaction_categories c join public.transaction_categories p on p.id = c.parent_id
             where c.family_id = v_family and p.name = s.cat and c.name = s.sub),
           s.method, s.bank, s.card, s.to_bank, s.to_card, s.member,
           case when s.member = m_sara then v_sara else v_ashiq end,
           s.merchant,
           case when s.private then 'private'::public.visibility else 'shared'::public.visibility end
    from seed_txn s
    where i = any (s.months)
      and ((date_trunc('month', current_date) - make_interval(months => i))::date + (s.day - 1)) <= current_date;
  end loop;

  -- A learned categorisation rule, as if a user had corrected it once.
  insert into public.transaction_rules (family_id, match_field, match_type, pattern, category_id, subcategory_id, origin, priority, created_by)
  select v_family, 'merchant', 'contains', 'GREENWOOD', p.id, c.id, 'learned', 50, v_ashiq
  from public.transaction_categories p
  join public.transaction_categories c on c.parent_id = p.id
  where p.family_id = v_family and p.name = 'Family' and c.name = 'Education';

  raise notice 'Seeded family % with demo users ashiq@example.com and sara@example.com', v_family;
end;
$$;
