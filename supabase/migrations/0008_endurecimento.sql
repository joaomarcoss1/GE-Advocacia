-- GE ADVOCACIA · 0008 · endurecimento (defesa em profundidade)
-- 1) Quem não fez login (papel "anon") não tem acesso direto a NENHUMA tabela: o ponto, a verificação de documentos e o envio do cliente
--    usam apenas funções. O RLS já barrava, mas o Supabase concede privilégios de tabela ao "anon" por padrão e aqui eles saem.
-- 2) Funções internas (nome começa com "_": gatilhos e auxiliares) deixam de ser chamáveis pela API. Os gatilhos continuam funcionando
--    (o privilégio de execução só é checado ao criar o gatilho) e as funções públicas não mudam.
-- Idempotente: pode rodar mais de uma vez.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '\_%' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

insert into public.schema_versao (versao, nome) values (8, 'endurecimento de permissões') on conflict (versao) do nothing;
