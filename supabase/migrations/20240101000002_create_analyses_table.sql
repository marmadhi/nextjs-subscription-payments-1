create table if not exists analyses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  project_name text not null,
  code text not null,
  status text check (status in ('pending', 'processing', 'completed', 'failed')) not null default 'pending',
  result jsonb,
  description text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS
alter table analyses enable row level security;

-- Policies
create policy "Users can view their own analyses"
  on analyses for select
  using (auth.uid() = user_id);

create policy "Users can create their own analyses"
  on analyses for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own analyses"
  on analyses for update
  using (auth.uid() = user_id); 