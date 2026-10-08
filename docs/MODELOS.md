# Modelos de documentos e listas por tipo de processo

Tela **Modelos** (menu lateral). Quem pode o quê:

| | Administrador / Gerência | Coordenação |
|---|---|---|
| Ver e usar modelos (preencher e baixar) | sim | sim |
| Criar, editar, excluir, carregar os padrão | sim | não |

## Peças e documentos
- **Carregar modelos padrão**: adiciona ~40 modelos profissionais (procurações e declarações, contratos de honorários e de prestação de serviços, petições iniciais, contestações, réplicas, recursos, manifestações, execução e cumprimento de sentença, notificações, pareceres, acordos, comunicação com o cliente e controles internos). Os que o escritório já tem não são alterados.
- **Usar**: escolha cliente, processo e advogado; o sistema preenche qualificação, número do processo, vara, partes, valor da causa (com extenso), OAB, cidade e data. O que não tem dado cadastrado fica **destacado em amarelo** (`[[PREENCHER: …]]`). Dá para editar o texto, copiar ou **baixar em Word (.docx)** — Times New Roman 12, margens 3/3/2/2 cm, espaçamento 1,5, rodapé com página.
- **Editar modelo**: texto livre com campos `{{cliente.nome}}`, `{{processo.numero}}`, `{{advogado.oab}}`, `{{honorarios.valor}}` etc. (seletor "Inserir campo"). `{{campo|padrão}}` usa um texto padrão quando não há dado. `[entre colchetes]` é preenchimento manual. `# Título`, `## Seção`, `>>` centralizado, `<<` à direita, `**negrito**`, `- item`.
- A cada alteração do texto a **versão** do modelo sobe.
- Os dados do cliente usados nas peças (RG, estado civil, profissão, nacionalidade, endereço) ficam em *Qualificação para procurações e peças* no cadastro do cliente.

## Listas de documentos (checklists)
- **Carregar listas padrão**: 19 listas por tipo de processo (reclamação trabalhista, defesa trabalhista, indenização, cobrança/execução, consumidor, despejo, divórcio, alimentos/guarda, inventário, aposentadoria/BPC, societário, criminal, mandado de segurança, execução fiscal, usucapião, acidentes e seguros, atendimento inicial, pessoa jurídica…).
- Cada lista tem **tipo de processo**, área e itens obrigatórios/opcionais. No dossiê do processo (Documentos), a lista cujo tipo combina com a classe/assunto do processo é **sugerida**.
- Em qualquer dossiê com itens, a gestão pode **Salvar esta lista como modelo** para reaproveitá-la em processos do mesmo tipo.

## Aviso
Os modelos e listas são **apoio técnico**: pontos de partida com a estrutura usual da prática forense (CPC, CLT, CDC, Estatuto da OAB…). Cabe ao advogado responsável adaptar ao caso, conferir a legislação vigente, a praxe do juízo e as exigências do tribunal antes de protocolar ou assinar.

## Banco
Migração `0010_modelos.sql`: tabela `modelos_documentos` (RLS: leitura por quem delega; escrita pela gestão; auditada), colunas `tipo`/`descricao` em `checklist_modelos` e de qualificação em `clientes`. Para aplicar, rode o workflow "Supabase — aplicar banco e funções".
