-- Run this in Supabase Dashboard → SQL Editor

-- Canvas data: one row per canvas per user
create table if not exists canvases (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  canvas_id   text        not null,
  name        text        not null default '캔버스',
  nodes       jsonb       not null default '[]',
  edges       jsonb       not null default '[]',
  updated_at  timestamptz default now(),
  unique (user_id, canvas_id)
);

alter table canvases enable row level security;

create policy "users manage own canvases" on canvases
  for all using (auth.uid() = user_id);

-- User preferences: active canvas, stage types, canvas order
create table if not exists user_prefs (
  user_id           uuid  references auth.users(id) on delete cascade primary key,
  active_canvas_id  text,
  stage_types       jsonb,
  canvas_order      jsonb  -- [{id, name}]
);

alter table user_prefs enable row level security;

create policy "users manage own prefs" on user_prefs
  for all using (auth.uid() = user_id);
