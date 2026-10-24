# Assistência opcional de descrições e categoria com Gemini

## Configuração privada do backend

A integração reutiliza GEMINI_API_KEY e GEMINI_MODEL do backend. O conteúdo
do arquivo privado não é inspecionado pelos testes. O teste real depende de
configuração válida, suporte multimodal do modelo e acesso à internet.

Edite somente o arquivo local `backend/.env`, já ignorado pelo Git. Preserve
a DATABASE_URL existente e acrescente a variável abaixo, preenchendo o valor
privadamente no editor:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_SECONDS=12
```

Obtenha sua própria chave no Google AI Studio. Não a copie para o chat,
frontend, app.json, variáveis EXPO_PUBLIC ou comandos compartilhados.
A chave vai ao Google pelo cabeçalho x-goog-api-key, nunca na URL.
Não foi criada ou inventada uma chave e nenhum arquivo .env foi alterado.

A configuração fica em backend/config.py, que também centraliza DATABASE_URL.
Variáveis do processo têm precedência sobre backend/.env. Reinicie o backend
depois de alterar a configuração. O timeout aceita 1 a 30 segundos; valores
inválidos usam 12 segundos.

O padrão gemini-3.5-flash-lite foi escolhido por ser um modelo estável para
baixa latência/custo segundo a documentação oficial consultada nesta etapa.
A disponibilidade depende da conta/projeto e pode mudar. Se necessário,
configure GEMINI_MODEL com outro modelo Gemini disponível que suporte
generateContent com resposta JSON e entrada de imagem. Não há troca automática de modelo.
Limites e cobrança são os da conta Google; não se presume gratuidade.

Referências:
- [Modelos Gemini](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [generateContent REST](https://ai.google.dev/api/generate-content)

## Contrato

### Descrição por fotografia

`POST /occurrences/describe-image`: multipart/form-data com o campo obrigatório
`file`, usando o mesmo File/FormData do Expo SDK 58 empregado no upload.
Aceita JPEG, PNG e WebP de até 8 MiB e 20 megapixels. O limite também é
aplicado a corpos sem Content-Length. O backend valida os bytes reais,
corrige a orientação, reduz para até 2048 × 2048 e reencoda em JPEG RGB novo,
sem EXIF/GPS, perfil ICC, nome original ou outros metadados. A imagem limpa
segue em inlineData/base64 no generateContent, sem usar a Files API do Google.
Não há gravação permanente em uploads nem acesso ao PostgreSQL nessa rota;
o parser multipart pode usar um arquivo temporário durante o recebimento,
que é fechado ao concluir a leitura. Nenhuma coordenada do formulário é enviada.

A interface pede confirmação explícita a cada envio e identifica o Google
como serviço externo. Cancelar não envia a foto. A remoção de metadados não
remove informações que aparecem visualmente, como rostos e placas; evite
fotografar dados pessoais. O processamento externo está sujeito aos termos
e políticas da conta Google, sem promessa de retenção zero pelo provedor.

### Melhoria textual

`POST /occurrences/improve-description`: JSON `{"description":"Galho caido na calçada."}`.
Reutiliza a validação textual: obrigatório, não vazio, máximo de 2.000
caracteres e sem campos extras. Envia somente esse texto. A instrução pede
correção de ortografia, clareza e concisão, preservando significado e
incertezas, sem acrescentar causas, consequências ou fatos.

### Resposta das duas rotas de descrição

HTTP 200:

```json
{"description":"Galho caído na calçada.","reason":"suggested","message":"Revise a sugestão antes de usar. A IA pode cometer erros."}
```

`description` é texto de até 600 caracteres ou null. O backend rejeita JSON
inválido, campos inesperados, texto vazio, tipos incorretos, controles
inválidos, saída longa e geração incompleta. Não trunca descrições para
evitar alterar o sentido. Normaliza apenas espaços da saída válida.
Além de suggested, reason pode ser not_identified (sem problema observável,
informação insuficiente ou bloqueio de segurança), unavailable, timeout,
rate_limited ou invalid_response; nesses casos description é null.
Timeout, modelo, chave e transporte são compartilhados com a categoria.
Imagens inválidas retornam 415; excesso de tamanho/dimensões, 413; campo
ausente ou texto inválido, 422. Falhas do provedor são fallback HTTP 200.

O prompt de imagem limita o relato ao que é visualmente observável e manda
retornar null quando não houver problema identificável. Prompts e validação
estrutural **não garantem** ausência de alucinações nem equivalência semântica.
O usuário deve conferir a foto/texto original antes de usar. Testes com mocks
verificam envio fiel da entrada, instruções de preservação e contratos, não
a qualidade de toda geração real do modelo.

As duas sugestões aparecem em prévia: Usar descrição preenche o campo
editável; Ignorar descrição mantém o texto original. Editar o texto, iniciar
troca/remoção de foto, sair da tela ou cadastrar invalida respostas antigas.
Envios duplicados são bloqueados e o cadastro manual permanece disponível.
Nenhuma sugestão cria uma ocorrência; só Registrar ocorrência grava dados.

Referências: [entrada multimodal Gemini](https://ai.google.dev/gemini-api/docs/image-understanding)
e [File/FormData no Expo](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/).

### Categoria existente

`POST /occurrences/suggest-category`

```json
{"description": "Uma árvore com galho quebrado sobre o passeio"}
```

Descrição obrigatória, não vazia, até 2.000 caracteres. O endpoint rejeita
campos extras: foto, coordenadas, categoria escolhida ou ID não são enviados
ao Gemini. A restrição de tamanho se aplica à IA, sem limitar o cadastro manual
existente.

Resposta de sugestão (HTTP 200):

```json
{
  "category": "Árvore",
  "reason": "suggested",
  "message": "Sugestão disponível. Você decide se deseja usá-la."
}
```

Quando não houver sugestão, category é null e a mensagem orienta a escolha
manual. Falhas conhecidas do provedor são resultados tratados com HTTP 200,
não uma classificação falsa. O campo reason distingue:

| reason | Significado |
| --- | --- |
| suggested | Categoria válida sugerida |
| not_classified | Texto ambíguo/fora das categorias ou bloqueio de segurança |
| unavailable | Sem chave, modelo/configuração inválida, conexão ou falha do provedor |
| timeout | Tempo de espera excedido |
| rate_limited | Provedor respondeu 429 |
| invalid_response | JSON, estrutura ou categoria inesperada |

Entrada inválida retorna HTTP 422. Falhas de comunicação entre celular e
FastAPI continuam sendo erros de rede na interface.

O backend normaliza espaços, maiúsculas e acentos, mas só aceita as três
categorias canônicas: Calçada, Árvore e Área verde. Não aproveita justificativas,
instruções ou categorias arbitrárias do modelo. Limita o corpo da resposta do
provedor a 64 KiB e a geração a 512 tokens, sem retries automáticos.
Não registra chave, corpo do erro do provedor ou descrição em logs da integração.

## Interface e fallback

O botão Sugerir categoria com IA aparece após a descrição e é habilitado
quando há texto válido para a IA. Mostra carregamento e permite aceitar com
Usar sugestão ou descartar com Ignorar. Nenhuma resposta sobrescreve
automaticamente a categoria selecionada. Editar a descrição invalida sugestões
e respostas antigas. O usuário pode cadastrar manualmente mesmo durante a
consulta opcional; uma resposta atrasada não altera o cadastro enviado.

O cadastro continua usando POST /occurrences, sem dependência da IA.
A sugestão não grava nem altera dados no PostgreSQL. Fotos e GPS permanecem
nos fluxos existentes. O formulário também bloqueia submissões duplicadas
antes da próxima renderização.

## Limitações

A sugestão pode estar semanticamente errada mesmo sendo uma categoria válida.
O usuário precisa revisá-la. Não inclua dados pessoais ou confidenciais na
descrição enviada ao serviço externo.

A API ainda não tem autenticação/autorização ou quota por usuário. Não exponha
a integração publicamente sem proteção: consultas podem consumir a quota ou
gerar custos na conta configurada. Esta versão é para demonstração acadêmica
em rede controlada.

A sugestão de categoria, a melhoria de texto e a geração de descrição por
imagem foram testadas pelo usuário no Expo Go SDK 58 em dispositivo real e
confirmadas como funcionais. O acesso à API e às fotos também foi validado
pelo celular. A configuração permanece em src/config/api.ts, e as fotos
usam essa mesma base. Esta consolidação não constitui uma nova execução
dos testes manuais no dispositivo.

A descrição gerada pela IA é apenas uma sugestão: depende de aceite
explícito do usuário, permanece editável e pode conter imprecisões, mesmo
com o prompt conservador. Confira cada afirmação antes de usar a descrição.

## Testes e roteiro manual

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test scripts/test-mobile-regressions.cjs
.\backend\.venv\Scripts\python.exe -B -m unittest discover -s backend/tests -v
git diff --check
```

Testes usam respostas Gemini simuladas, rede simulada e SQLite em memória.
Não enviam textos reais ao provedor, não leem .env nem acessam PostgreSQL.
Nenhuma nova dependência foi adicionada: REST usa urllib da biblioteca padrão
e os schemas usam Pydantic já instalado.

1. Configure a chave localmente e reinicie o backend, dentro de backend:
   `.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000`.
2. No celular, abra a URL base configurada com /occurrences e confirme acesso.
3. Na raiz, execute `npm run start -- --go` e abra o Expo Go.
4. Digite uma descrição de árvore, calçada ou praça e toque em Sugerir categoria
   com IA. Confira que a categoria selecionada permanece igual até aceitar.
5. Teste Usar sugestão, Ignorar e editar o texto enquanto uma consulta ocorre.
6. Sem chave ou com falha do provedor, confira a mensagem de fallback e que a
   escolha manual continua disponível. Restaurar a chave exige reiniciar o servidor.
7. Somente quando desejar gravar um teste, cadastre e confira foto/GPS, detalhes,
   status e contadores. Aceitar ou ignorar uma sugestão sozinho não grava no banco.

O projeto foi migrado para Expo SDK 58, com Node 24.22.1. Para verificar:
`npm.cmd run lint`, `npx.cmd expo-doctor@latest` e `npx.cmd expo install --check`.
Há três avisos preexistentes de dependências de callbacks de recarga no lint.

## Validação manual das descrições no Expo Go SDK 58

1. Reinicie o backend com o comando acima. Na raiz, execute
   `npx.cmd expo start --clear` e abra o QR Code no Expo Go Android.
2. Digite um relato com erros de escrita e toque em Melhorar texto com IA.
   Confira a prévia, ignore e confirme que o original permanece. Repita,
   aceite e edite o resultado. Verifique se nenhum fato foi acrescentado.
3. Selecione uma foto ou use a câmera. Toque em Gerar descrição com IA,
   cancele a confirmação e confira que não há consulta. Repita e confirme
   Enviar foto. Revise o relato visual, ignore ou use e edite a descrição.
4. Teste uma imagem sem problema ambiental: a resposta deve indicar ausência
   de sugestão. O comportamento real depende do modelo e precisa ser revisado.
5. Durante consultas, edite o texto, troque/remova a foto ou saia da tela;
   confira que sugestões antigas não aparecem. Teste também backend desligado
   e retomada: falhas não devem impedir o preenchimento/cadastro manual.
6. Confira que somente pedir/aceitar sugestões não muda a listagem nem os
   contadores. A sugestão de categoria continua independente e opcional.
7. Quando desejar gravar um teste manual, confirme o cadastro com foto/GPS,
   imagem e texto nos detalhes, listagem, status e contadores.

Os recursos contam com testes automatizados com mocks e com a validação
manual no Expo Go informada pelo usuário. Os mocks não demonstram a
qualidade de todas as respostas futuras do provedor; este roteiro permanece
disponível para repetir a validação após alterações.
