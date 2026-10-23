# Atualização de status das ocorrências

## Contrato

`PATCH /occurrences/{occurrence_id}/status`

Corpo JSON obrigatório:

```json
{"status": "Em análise"}
```

Valores aceitos, exatamente: `Registrada`, `Em análise` e `Resolvida`.
O schema Pydantic exclusivo desse endpoint rejeita campos extras.

- **200:** ocorrência completa com o status persistido. Mantém id, categoria,
  descrição, foto, latitude e longitude.
- **404:** ocorrência inexistente. Não cria registros.
- **422:** status inválido, ausente, nulo, campos extras ou ID que não seja inteiro.
- **500:** falha de persistência; a sessão executa rollback e é fechada.

Somente a coluna status é atribuída. Não há alteração do modelo SQLAlchemy,
migração, criação de colunas ou mudança dos contratos anteriores.
Todos os três status podem ser escolhidos, inclusive para voltar a um status
anterior. Repetir o mesmo status é permitido na API e não cria ocorrências;
a interface desabilita o envio quando não há mudança.

## Interface e comunicação

A tela de detalhes mantém o status confirmado separado da seleção em edição.
Salvar status bloqueia novos envios e mostra o indicador de salvamento.
O status confirmado só muda depois da resposta válida da API; falhas preservam
o valor anterior e a seleção para tentar novamente. Ao perder o foco, uma
resposta antiga não sobrescreve os dados carregados posteriormente.

Detalhes, listagem e início mantêm a recarga ao receber foco. O contador
Registradas continua sendo o total de ocorrências, incluindo as que mudaram de
status. Em análise e Resolvidas contam os respectivos status. Nenhuma chamada
extra para atualizar contadores é necessária durante o salvamento.

Se houver timeout ou perda de conexão após o servidor ter confirmado a
transação, o aplicativo pode não receber a confirmação apesar de a alteração
ter sido persistida. Reabra os detalhes para conferir. Atualizações simultâneas
não possuem controle de versão: a última gravação confirmada prevalece.

## Limitação de acesso

**Este endpoint ainda não possui autenticação nem autorização. Qualquer cliente
com acesso à API pode alterar o status de qualquer ocorrência. Esta versão é
adequada à demonstração acadêmica em ambiente controlado e não é apropriada
para produção.** Não foi adicionado controle de acesso nesta etapa.

## Validação automatizada

Na raiz do projeto:

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test scripts/test-mobile-regressions.cjs
.\backend\.venv\Scripts\python.exe -B -m unittest discover -s backend/tests -v
git diff --check
```

Testes backend usam SQLite em memória e arquivos temporários, sem importar a
conexão real, ler .env ou acessar PostgreSQL. Cobrem os três status,
persistência por nova sessão, preservação de foto/GPS e outros registros,
422, 404 e rollback em erro de commit.

Testes frontend simulam rede, navegação e hooks; verificam o JSON do PATCH,
falha de rede, resposta inválida, seleção separada do status confirmado,
duplicidade, retry, respostas antigas e atualização das telas por foco.

## Testar no Expo Go

1. Reinicie o backend para carregar a nova rota. Dentro de backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

2. Na raiz, execute `npm run start -- --go` e abra no Expo Go.
3. Abra os detalhes de uma ocorrência reservada para testes. Anote seu status
   inicial e confira foto, coordenadas e descrição.
4. Selecione Em análise: o badge e o campo Status ainda devem mostrar o valor
   confirmado anterior. Toque em Salvar status e espere a confirmação.
5. Volte à listagem e à tela inicial. O status e o contador Em análise devem
   refletir a alteração; Registradas permanece com o mesmo total.
6. Repita com Resolvida e confira o contador Resolvidas.
7. Reabra os detalhes depois de reiniciar o backend para conferir persistência.
8. Para testar falha, carregue os detalhes primeiro, pare o backend, selecione
   outro status e tente salvar. O valor confirmado deve permanecer e a tela deve
   permitir repetir o salvamento após reiniciar a API.

Os passos manuais de salvar alteram o status da ocorrência escolhida. Não foram
executados contra o PostgreSQL real durante a implementação. Não há necessidade
de executar qualquer migração.
