-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Все данные приложения (рецепты, сеты, дни меню, избранное, сохранённые меню, оценки, продукты дома) хранятся в одной таблице,
-- каждая строка видна только своему владельцу.

create table if not exists public.items (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text    not null,
  id         text    not null,
  data       jsonb   not null,
  updated_at bigint  not null,              -- время изменения на устройстве, мс
  deleted    boolean not null default false,
  synced_at  timestamptz not null default now(), -- время записи на сервер, курсор для загрузки изменений
  primary key (user_id, kind, id)
);

-- Вид данных — короткое слово латиницей; конкретные виды не перечисляются, чтобы новые разделы приложения
-- синхронизировались без повторного запуска скрипта. Отдельно от таблицы: повторный запуск обновит и старую базу.
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind ~ '^[a-z]{1,32}$');

create index if not exists items_user_synced on public.items (user_id, synced_at);

-- Более старая версия записи не перезаписывает более новую.
create or replace function public.items_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    old.synced_at := now(); -- пусть устройства заново скачают актуальную версию
    return old;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();

alter table public.items enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
