# Processos, documentos e backup

Três módulos ligados ao fluxo de delegação: **acompanhamento de processos**, **documentos com checklist e Google Drive** e **backup semanal**. Tudo respeita a separação entre escritórios (RLS por `escritorio_id`) e funciona em modo demonstração, sem Supabase.

> Apoio técnico, não parecer jurídico. Prazos e classificações de andamentos são **sugestões pela regra geral**: confira sempre no ato, no sistema do tribunal e no Diário.

## 1. Acompanhamento de processos

**O que faz.** Cadastro do processo com número CNJ validado (dígito verificador) e vínculo ao cliente, responsável e área. A consulta automática ao DataJud (CNJ) traz classe, assunto, órgão e os andamentos; cada andamento é classificado (sentença, decisão, despacho, citação, intimação, audiência, juntada, trânsito…). Os que exigem providência viram **uma tarefa** para o responsável, já com prioridade e **prazo sugerido em dias úteis** (feriados do escritório e recesso forense de 20/12 a 20/01).

**Como se parece com os sistemas de gestão jurídica.** Mesma lógica de "caixa de entrada de andamentos": o que é novo aparece como não lido, o que exige ação gera tarefa no quadro (com o prazo na Agenda), e tudo fica no histórico do processo. A diferença assumida: a fonte aqui é a base pública do DataJud, que **não é o Diário nem o sistema do tribunal** e pode ter atraso. Intimações e publicações podem ser registradas manualmente no processo.

**Regras que protegem o escritório.**
- Primeira consulta é só a linha de base: o histórico entra como lido e **não cria tarefas** (exceto andamento dos últimos 7 dias que exija ação).
- Cada andamento é gravado uma única vez (chave única) e **nunca é alterado**; uma tarefa por andamento (`origem_movimento_id` único). Consultar de novo não duplica nada.
- Falha do DataJud (chave recusada, limite, tempo esgotado, processo em segredo de justiça) vira aviso no processo, nunca perda de dados.
- Pode-se desligar a criação automática de tarefas em Configurações.

**Configuração (Edge Function `processos`).**
1. Peça/obtenha a chave pública do DataJud (a divulgada pelo CNJ na página de acesso à API pública).
2. `supabase secrets set DATAJUD_API_KEY=... CRON_SECRET=<valor longo e aleatório>`
3. `supabase functions deploy processos` (ou o workflow "Supabase — aplicar banco e funções", marcando publicar funções).
4. Segredos do GitHub `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `CRON_SECRET` ativam o workflow **Acompanhamento de processos e Drive**, que roda a cada 6 horas.

Sem a chave, o sistema continua funcionando com andamentos manuais, e a tela avisa que a consulta automática não está configurada.

## 2. Documentos, checklist e Google Drive

**Fluxo.** Cada cliente e cada processo tem uma **checklist** (modelo geral e modelos por área: trabalhista, cível, família e sucessões, previdenciário, empresarial e tributário, criminal; editáveis). Ao chegar um arquivo ligado a um item, o item passa a *recebido*; a equipe confere (*conferido*). Se o último arquivo de um item sai, ele volta a *pendente*.

**Entrada de arquivos.**
- Pelo painel (cliente, processo ou item).
- **Link de envio para o cliente** (`/enviar/<token>`): sem login, mostra apenas o que falta enviar. O token tem 192 bits, só o hash SHA-256 fica no banco, expira (1 a 60 dias), pode ser revogado e tem limite de arquivos. O endereço aparece **uma única vez**, ao criar.

**Validação.** Tipos aceitos: PDF, imagens (JPG, PNG, WEBP), Word e Excel; até 20 MB. O tipo é conferido pela **assinatura real** do arquivo, não pela extensão. Não há antivírus: baixe arquivos de origem desconhecida com cautela.

**Armazenamento.** Bucket privado `documentos` no Supabase, caminho `escritório/cliente/id`; o painel abre por URL assinada de 60 segundos e **cada abertura é registrada** (quem, quando). Excluir remove o arquivo do Storage e envia a cópia do Drive para a **lixeira do Drive** (recuperável).

**Google Drive.** Uma conexão por escritório (somente administrador). Escopo `drive.file`: o sistema enxerga apenas o que ele mesmo criou. Estrutura: `GE Advocacia – <Escritório>/<Cliente>/Processo <número>/<Item> - <arquivo>`. Se o Drive falhar, o documento já está guardado e fica *pendente/erro* no painel; a sincronização é refeita (botão e rotina agendada). Se o acesso for revogado no Google, a conexão é desfeita e nada fica pendente para sempre.

**Configuração (Edge Function `documentos`).**
1. Google Cloud: ative a *Google Drive API* no mesmo projeto OAuth da Agenda (`docs/GOOGLE-AGENDA.md`) e registre o URI de redirecionamento `https://<ref>.supabase.co/functions/v1/documentos`.
2. Segredos (os mesmos da Agenda): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (`openssl rand -base64 32`), `ALLOWED_ORIGINS` (endereço do app), `CRON_SECRET`.
3. `supabase functions deploy documentos`.
4. Em Configurações > Integrações, **Conectar Google Drive**.

## 3. Backup semanal

- **No sistema** (Configurações > Backup): exporta todos os dados do escritório em um arquivo, com criptografia opcional por senha (PBKDF2 + AES-GCM). Há lembrete semanal e, em navegadores compatíveis, gravação automática em uma pasta do computador. A senha **não é guardada**: sem ela o arquivo não abre. Os arquivos enviados (PDFs, imagens) não entram no JSON; ficam no Storage e no Drive.
- **Banco inteiro** (workflow **Backup semanal do banco**): todo domingo, `pg_dump` criptografado com `age` e disponível como artefato por 90 dias, para baixar e guardar localmente. Requer `SUPABASE_DB_URL` (Session pooler) e `BACKUP_AGE_RECIPIENT` (chave pública; a privada fica só com você). O workflow **Backup diário** (destino S3/R2) agora também copia o bucket `documentos`.

## O que ainda não foi testado contra serviços reais

As regras de negócio, o banco (SQL), o modo demonstração e a interface têm testes automáticos. As Edge Functions `processos` e `documentos` foram conferidas por tipagem e pela lógica compartilhada testada, mas **não rodaram contra o DataJud, o Google Drive nem um Supabase real**. No primeiro dia: consultar um processo conhecido, conectar o Drive, enviar um PDF pelo painel e pelo link do cliente, abrir e excluir.

Fora do escopo desta versão: leitura do Diário de Justiça (DJEN) e peticionamento; antivírus; OCR.
