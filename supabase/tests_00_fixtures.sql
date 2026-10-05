-- Fixtures compartilhadas: plataforma, dois escritórios (A e B) com administradores, gerente e funcionários.
-- Roda primeiro (tests_00) e deixa o estado para as demais suítes.
\set ON_ERROR_STOP on
create table t.ctx (k text primary key, v text not null);
grant all on t.ctx to anon, authenticated, service_role;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'plat@ge.t');
insert into public.plataforma_admins (id, nome, email) values ('00000000-0000-0000-0000-0000000000f1', 'Plataforma GE', 'plat@ge.t');

select t.como('00000000-0000-0000-0000-0000000000f1');
select plataforma_criar_escritorio('Almeida Teste Advocacia', 'almeida-t', 'Admin A', 'admin.a@t.com', 'segredo123');
select plataforma_criar_escritorio('Barbosa Teste Advocacia', 'barbosa-t', 'Admin B', 'admin.b@t.com', 'segredo123', 'America/Manaus');
reset role;

insert into t.ctx select 'escA', id::text from public.escritorios where slug = 'almeida-t';
insert into t.ctx select 'escB', id::text from public.escritorios where slug = 'barbosa-t';
insert into t.ctx select 'adminA', id::text from public.perfis where email = 'admin.a@t.com';
insert into t.ctx select 'adminB', id::text from public.perfis where email = 'admin.b@t.com';

-- gerente do escritório A, criado pelo admin A (testa criar_usuario)
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select criar_usuario('gerente.a@t.com', 'segredo123', 'Gerente A', 'gerente');
reset role;
insert into t.ctx select 'gerenteA', id::text from public.perfis where email = 'gerente.a@t.com';

-- escala "agora" (entrada = hora atual do escritório) para os testes de ponto
do $$
declare e text; v_local timestamp; v_now text; d jsonb; i int; v_esc uuid;
begin
  foreach e in array array['escA', 'escB'] loop
    v_esc := (select v::uuid from t.ctx where k = e);
    v_local := now() at time zone public._fuso(v_esc);
    v_now := to_char(v_local, 'HH24:MI');
    d := '{}';
    for i in 0..6 loop
      d := d || jsonb_build_object(i::text, jsonb_build_object('ativo', true, 'entrada', v_now, 'saida_intervalo', '', 'retorno_intervalo', '', 'saida', '23:59'));
    end loop;
    insert into public.escalas (escritorio_id, nome, dias) values (v_esc, 'T-agora', d);
  end loop;
end $$;

-- funcionários (inseridos pelo banco, com escritório explícito)
insert into public.funcionarios (id, escritorio_id, nome, salario_mensal, escala_id, cargo_id, vinculo, data_admissao) values
 ('00000000-0000-0000-0000-00000000a001', (select v::uuid from t.ctx where k = 'escA'), 'Ana Pontual',  3000,
   (select id from public.escalas where escritorio_id = (select v::uuid from t.ctx where k = 'escA') and nome = 'T-agora'),
   (select id from public.cargos where escritorio_id = (select v::uuid from t.ctx where k = 'escA') and nome like 'Advogado%'), 'clt', current_date - 90),
 ('00000000-0000-0000-0000-00000000a002', (select v::uuid from t.ctx where k = 'escA'), 'Beto Antunes', 2000,
   (select id from public.escalas where escritorio_id = (select v::uuid from t.ctx where k = 'escA') and nome = 'T-agora'),
   null, 'clt', current_date - 90),
 ('00000000-0000-0000-0000-00000000b001', (select v::uuid from t.ctx where k = 'escB'), 'Bia Pontual',  4000,
   (select id from public.escalas where escritorio_id = (select v::uuid from t.ctx where k = 'escB') and nome = 'T-agora'),
   null, 'clt', current_date - 90),
 ('00000000-0000-0000-0000-00000000b002', (select v::uuid from t.ctx where k = 'escB'), 'Caio Ana Barbosa', 2500,
   (select id from public.escalas where escritorio_id = (select v::uuid from t.ctx where k = 'escB') and nome = 'T-agora'),
   null, 'clt', current_date - 90);

-- PINs definidos pelos respectivos administradores
select t.como((select v::uuid from t.ctx where k = 'adminA'));
select definir_pin('00000000-0000-0000-0000-00000000a001', '482913'), definir_pin('00000000-0000-0000-0000-00000000a002', '739105');
select t.como((select v::uuid from t.ctx where k = 'adminB'));
select definir_pin('00000000-0000-0000-0000-00000000b001', '561847'), definir_pin('00000000-0000-0000-0000-00000000b002', '902716');
reset role;

-- geofence desligada por padrão nas fixtures (suíte de ponto liga quando precisa)
select 'fixtures ok: 2 escritórios, 4 funcionários' as msg;
