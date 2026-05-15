create extension if not exists pgcrypto;

create sequence if not exists public.lunch_order_number_seq start 1;
create sequence if not exists public.lunch_pickup_code_seq minvalue 0 start 0;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.lunch_menu_items (
  day_name text primary key check (day_name in ('Montag','Dienstag','Mittwoch','Donnerstag','Freitag')),
  weekday smallint not null unique check (weekday between 1 and 5),
  dish text not null default '',
  unit_price numeric(10,2) not null default 0,
  quantity_available integer null check (quantity_available is null or quantity_available >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.lunch_orders (
  id uuid primary key default gen_random_uuid(),
  internal_number text not null unique,
  pickup_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'reserviert' check (status in ('reserviert','abgeholt','storniert')),
  customer_name text not null,
  firstname text not null,
  lastname text not null,
  phone text not null,
  email text not null,
  day_name text not null references public.lunch_menu_items(day_name) on update cascade,
  pickup_date date not null,
  pickup_time time not null,
  fulfillment text not null check (fulfillment in ('pickup','delivery')),
  dish text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0),
  total numeric(10,2) not null,
  notes text,
  payment_method text not null default 'Vor Ort',
  bundeswehr_delivery boolean not null default false,
  location text not null,
  delivery_street text,
  delivery_number text,
  delivery_zip text,
  delivery_city text,
  agb_accepted boolean not null default true,
  contract_accepted boolean not null default true,
  contract_concluded boolean not null default true,
  contract_text text
);

create index if not exists lunch_orders_status_idx on public.lunch_orders (status, created_at desc);
create index if not exists lunch_orders_pickup_date_idx on public.lunch_orders (pickup_date, pickup_time);
create index if not exists lunch_orders_email_idx on public.lunch_orders (lower(email));

drop trigger if exists trg_lunch_menu_items_updated_at on public.lunch_menu_items;
create trigger trg_lunch_menu_items_updated_at
before update on public.lunch_menu_items
for each row
execute function public.set_updated_at();

insert into public.lunch_menu_items (day_name, weekday, dish, unit_price, quantity_available, is_active)
values
  ('Montag', 1, 'Nudelgulasch', 7.90, null, true),
  ('Dienstag', 2, 'Hähnchen mit Reis', 8.90, null, true),
  ('Mittwoch', 3, 'Linsensuppe', 6.90, null, true),
  ('Donnerstag', 4, 'Frikadellen mit Kartoffeln', 8.50, null, true),
  ('Freitag', 5, 'Börek mit Salat', 7.50, null, true)
on conflict (day_name) do update
set weekday = excluded.weekday,
    dish = excluded.dish,
    unit_price = excluded.unit_price,
    is_active = excluded.is_active;

create or replace function public.create_lunch_order(order_payload jsonb)
returns public.lunch_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text := trim(order_payload->>'day');
  v_requested_dish text := trim(order_payload->>'dish');
  v_pickup_date date := (order_payload->>'pickup_date')::date;
  v_pickup_time time := ((order_payload->>'pickup_time') || ':00')::time;
  v_fulfillment text := coalesce(order_payload->>'fulfillment', 'pickup');
  v_quantity integer := greatest(coalesce((order_payload->>'quantity')::integer, 1), 1);
  v_menu public.lunch_menu_items%rowtype;
  v_total numeric(10,2);
  v_internal_number text;
  v_pickup_code text;
  v_order public.lunch_orders%rowtype;
  pickup_codes text[] := array[
    'SpiderMan','BudSpencer','TerenceHill','Manitou','RockyBalboa','Batman','Deadpool','IronMan','Thor','Superman',
    'IndianaJones','Zorro','Gandalf','HarryPotter','Yoda','Mario','Sonic','Messi','Kloppo','Einstein',
    'Stromberg','LuckyLuke','Asterix','Obelix','Spongebob','JohnWick','Maximus','Magnum','Sherlock','Neo'
  ];
  pickup_index bigint;
begin
  select *
    into v_menu
  from public.lunch_menu_items
  where day_name = v_day
  for update;

  if not found or not coalesce(v_menu.is_active, true) or coalesce(v_menu.dish, '') = '' then
    raise exception 'Für den gewählten Tag ist aktuell kein Gericht verfügbar.';
  end if;

  if v_requested_dish <> '' and v_requested_dish is distinct from v_menu.dish then
    raise exception 'Der Wochenplan wurde aktualisiert. Bitte wähle das aktuelle Gericht erneut aus.';
  end if;

  if v_menu.quantity_available is not null and v_menu.quantity_available < v_quantity then
    raise exception 'Für % sind nur noch % Portion(en) verfügbar.', v_menu.dish, v_menu.quantity_available;
  end if;

  v_total := round((v_menu.unit_price * v_quantity)::numeric, 2);
  v_internal_number := 'M' || lpad(nextval('public.lunch_order_number_seq')::text, 4, '0');

  if v_fulfillment = 'pickup' then
    pickup_index := nextval('public.lunch_pickup_code_seq');
    v_pickup_code := pickup_codes[((pickup_index % array_length(pickup_codes, 1)) + 1)::integer];
  else
    v_pickup_code := null;
  end if;

  insert into public.lunch_orders (
    internal_number,
    pickup_code,
    status,
    customer_name,
    firstname,
    lastname,
    phone,
    email,
    day_name,
    pickup_date,
    pickup_time,
    fulfillment,
    dish,
    unit_price,
    quantity,
    total,
    notes,
    payment_method,
    bundeswehr_delivery,
    location,
    delivery_street,
    delivery_number,
    delivery_zip,
    delivery_city,
    agb_accepted,
    contract_accepted,
    contract_concluded,
    contract_text
  ) values (
    v_internal_number,
    v_pickup_code,
    'reserviert',
    trim(coalesce(order_payload->>'firstname', '') || ' ' || coalesce(order_payload->>'lastname', '')),
    coalesce(order_payload->>'firstname', ''),
    coalesce(order_payload->>'lastname', ''),
    coalesce(order_payload->>'phone', ''),
    lower(coalesce(order_payload->>'email', '')),
    v_day,
    v_pickup_date,
    v_pickup_time,
    v_fulfillment,
    v_menu.dish,
    v_menu.unit_price,
    v_quantity,
    v_total,
    nullif(order_payload->>'notes', ''),
    coalesce(order_payload->>'payment_method', 'Vor Ort'),
    coalesce((order_payload->>'bundeswehr_delivery')::boolean, false),
    coalesce(order_payload->>'location', 'Simonsbrotkörbchen, Lenaustraße 1, 40472 Düsseldorf'),
    nullif(order_payload->>'delivery_street', ''),
    nullif(order_payload->>'delivery_number', ''),
    nullif(order_payload->>'delivery_zip', ''),
    nullif(order_payload->>'delivery_city', ''),
    coalesce((order_payload->>'agb_accepted')::boolean, true),
    coalesce((order_payload->>'contract_accepted')::boolean, true),
    coalesce((order_payload->>'contract_concluded')::boolean, true),
    coalesce(order_payload->>'contract_text', 'Mit Klick auf „Zahlungspflichtig reservieren" gebe ich eine verbindliche, zahlungspflichtige Reservierung ab.')
  )
  returning * into v_order;

  if v_menu.quantity_available is not null then
    update public.lunch_menu_items
    set quantity_available = quantity_available - v_quantity
    where day_name = v_day;
  end if;

  return v_order;
end;
$$;

alter table public.lunch_menu_items enable row level security;
alter table public.lunch_orders enable row level security;

drop policy if exists "Public can read lunch menu" on public.lunch_menu_items;
create policy "Public can read lunch menu"
on public.lunch_menu_items
for select
using (true);

drop policy if exists "Authenticated can manage lunch menu" on public.lunch_menu_items;
create policy "Authenticated can manage lunch menu"
on public.lunch_menu_items
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Public can insert lunch orders via rpc" on public.lunch_orders;
create policy "Public can insert lunch orders via rpc"
on public.lunch_orders
for insert
with check (true);

drop policy if exists "Authenticated can read lunch orders" on public.lunch_orders;
create policy "Authenticated can read lunch orders"
on public.lunch_orders
for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can update lunch orders" on public.lunch_orders;
create policy "Authenticated can update lunch orders"
on public.lunch_orders
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

grant execute on function public.create_lunch_order(jsonb) to anon, authenticated;
