# Google Agenda

Prazos, audiências, reuniões e demais compromissos com data podem ir para o Google Agenda de duas formas.

## 1. Sem configurar nada (já funciona)
Em cada compromisso há **Adicionar ao Google Agenda** (abre o Google já preenchido) e **Baixar .ics** (abre no Google, Outlook ou Apple). O funcionário também tem o atalho em **Minhas tarefas**, depois de digitar o PIN. Na Agenda há **Baixar .ics** com todos os compromissos em aberto.

## 2. Automático (conectar a conta Google)
Quem delega (administrador, gerência ou coordenação) conecta a **própria** conta em **Agenda → Conectar**. A partir daí, ao salvar uma tarefa com a opção *Marcar no meu Google Agenda*, o evento é criado na agenda dessa pessoa, com lembrete, local, número do processo e **convite por e-mail** para o responsável, o revisor e os participantes que tiverem e-mail no cadastro. Alterar a tarefa atualiza o evento; cancelar ou excluir remove.

Como funciona por dentro (e por que é seguro):
- A Edge Function `google-agenda` faz o login com o Google (OAuth). O navegador nunca vê tokens.
- O *refresh token* é guardado **cifrado (AES-GCM)** em `public.google_conexoes`, tabela com RLS ligado, sem política e sem privilégio para a API. Só a função (service_role) acessa.
- O pedido de acesso é só `calendar.events` (criar/alterar eventos), não lê nem apaga outros dados da pessoa.
- Cada ação confere o JWT do chamador, o papel e que a tarefa é do escritório dele. Um escritório nunca sincroniza tarefa de outro.
- A pessoa pode **Desconectar** quando quiser (apaga o token) e também revogar em myaccount.google.com/permissions.

### Configuração (uma vez, por instalação)
1. **Google Cloud Console** → criar um projeto → *APIs e serviços* → ativar **Google Calendar API**.
2. *Tela de consentimento OAuth*: tipo **Externo**; adicionar o escopo `.../auth/calendar.events`; enquanto estiver em "Teste", cadastre os e-mails de quem vai usar. Para uso aberto, publique o app (o Google pode pedir verificação).
3. *Credenciais* → **ID do cliente OAuth** (aplicativo da Web). Em **URIs de redirecionamento autorizados** coloque exatamente:
   `https://<ref-do-projeto>.supabase.co/functions/v1/google-agenda`
4. Gere a chave de cifra dos tokens (32 bytes em base64) e cadastre os segredos no Supabase:
   ```bash
   openssl rand -base64 32       # guarde o resultado
   supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_TOKEN_KEY=... \
     ALLOWED_ORIGINS=https://seu-app.vercel.app --project-ref <ref>
   ```
   `ALLOWED_ORIGINS` lista os endereços do app (separados por vírgula) para onde o Google pode devolver a pessoa. **Guarde a `GOOGLE_TOKEN_KEY`**: sem ela os tokens salvos não podem ser lidos (a pessoa só precisa conectar de novo).
5. Publique a função: `supabase functions deploy google-agenda --project-ref <ref>` (ou o workflow *Supabase — aplicar banco e funções*).

Sem esses segredos a tela **Agenda** mostra o Google como indisponível e o restante (link, .ics) segue funcionando.

### Limites conhecidos
- **Não testado contra o Google real** (depende das suas credenciais). A lógica de datas, o formato do evento e o .ics têm testes automáticos; a troca de tokens e as chamadas à API do Google precisam de uma verificação sua no primeiro uso (crie um prazo de teste e confira o convite).
- O evento fica na agenda de quem sincronizou. Se essa pessoa sair, remova e sincronize de novo a partir de outra conta.
- Convidados só recebem e-mail se o funcionário tiver **e-mail** no cadastro (Funcionários).
