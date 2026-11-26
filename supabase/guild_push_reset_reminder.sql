-- 성벽 초기화(매일 09:00 KST) 10분 전 알림 대기열 등록
create or replace function public.enqueue_guild_wall_reset_reminder()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
begin
  insert into public.guild_notification_queue (user_id, notification_type, title, body, payload)
  select gm.user_id, 'wall_reset_reminder', '성벽 인증 초기화 안내',
         '성벽 인증 초기화까지 10분 남았습니다.',
         jsonb_build_object('url', '/Myweb1/')
  from public.guild_members gm
  where gm.is_active = true
    and not exists (
      select 1 from public.guild_notification_queue q
      where q.user_id = gm.user_id
        and q.notification_type = 'wall_reset_reminder'
        and q.created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_guild_wall_reset_reminder() from public, anon, authenticated;
grant execute on function public.enqueue_guild_wall_reset_reminder() to service_role;
