# Foto e GPS — execução e revisão

Ponto de recuperação da arquitetura: commit `e42321f`.
Versão funcional validada pelo usuário no Expo Go: acesso à API pelo celular,
listagem, detalhes, cadastro com foto/GPS, exibição da imagem e coordenadas,
e persistência após reiniciar o backend.

## Antes de usar o novo backend com o banco existente

Atualização: a migração 001 já foi aplicada ao banco ecomap nesta instalação,
com backup e restauração de teste validados e os dois registros preservados.
Não execute a migração novamente. O procedimento abaixo fica como referência
para outra instalação que ainda não possua as três colunas.

A versão nova consulta três colunas opcionais: `latitude`, `longitude` e
`photo_path`. Até aplicar a migração, GET/POST /occurrences não devem ser
usados com o esquema antigo: as consultas falharão por ausência das colunas.
O servidor não executa migrações ou criação de tabelas na inicialização.

1. Pare o backend e revise `backend/migrations/001_add_photo_location.sql`.
2. Faça um backup do banco pela ferramenta PostgreSQL que já utiliza,
   guardando-o fora do versionamento. Não coloque credenciais em comandos
   compartilhados ou no repositório.
3. Confira o banco selecionado no seu ambiente. Preserve o `backend/.env` existente.
4. Somente depois da aprovação da migração, execute na raiz:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python migrate.py --apply
uvicorn main:app --host 0.0.0.0 --port 8000
```

O runner usa a mesma DATABASE_URL do aplicativo e uma transação. O SQL adiciona
somente três colunas anuláveis, sem atualizar ou apagar registros. A espera por
lock é limitada a 5 segundos: se falhar, a transação é revertida. Execute uma
única vez; repetir com as colunas já presentes gera erro e rollback. Não use
drop/recriação para corrigir erros. Não há rollback destrutivo automático.

Para reconstruir o ambiente Python, se necessário, as dependências diretas estão
em `backend/requirements.txt` (Python 3.11 foi usado nesta etapa). O ambiente
existente já recebeu apenas python-multipart e Pillow; não é preciso reinstalar
para testar.

## Contratos HTTP

| Método e caminho | Entrada | Sucesso |
| --- | --- | --- |
| GET / | — | 200, mensagem existente |
| GET /occurrences | — | 200, lista com campos existentes mais latitude, longitude e photo_path |
| POST /occurrences | JSON, category e description obrigatórios; latitude, longitude e photo_path opcionais | 200, ocorrência criada |
| POST /uploads | multipart/form-data, campo file | 201, {"photo_path": "/uploads/<identificador>.jpg"} |
| GET /uploads/{filename} | nome retornado pelo upload | 200, image/jpeg |

Latitude deve estar entre -90 e 90, longitude entre -180 e 180; ambas devem ser
informadas juntas ou omitidas. Coordenadas zero são válidas. Campos em branco,
pares incompletos e referências de arquivo inválidas retornam 422.
Uma referência bem formada, mas sem arquivo existente, retorna 404.
Os registros anteriores terão os três novos campos nulos.

O upload aceita JPEG, PNG e WebP reais, até 8 MiB e 20 megapixels. Formato/MIME
inválido ou imagem corrompida retorna 415; tamanho/dimensões excessivos retornam
413; ausência do campo file retorna 422. O nome enviado pelo cliente é ignorado.
A imagem é decodificada e salva como JPEG até 2048 × 2048, com nome aleatório
gerado pelo servidor e sem EXIF. A referência no banco é um caminho relativo
servido pela API, nunca uma URI local do aparelho.

Os arquivos ficam em `backend/uploads/`, ignorado pelo Git e criado no primeiro
upload válido. Preserve esse diretório junto com o backup do banco para manter as
fotos. O upload ocorre antes do cadastro; se o usuário abandonar o formulário
depois de um upload ou o cadastro falhar, pode sobrar uma foto sem vínculo.
Uma nova tentativa no mesmo formulário reutiliza o upload bem-sucedido.
Não há limpeza automática para evitar remover fotos utilizadas.

Este armazenamento é adequado à demonstração local: os endpoints não possuem
autenticação (como o backend anterior), e quem conhece a referência pode ler a
foto. Não exponha essa versão como serviço público sem proteção adicional.

## Testes sem PostgreSQL

Na raiz:

```powershell
.\backend\.venv\Scripts\python.exe -B -m unittest discover -s backend/tests -v
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Os testes Python substituem o módulo database antes dos imports: usam SQLite
em RAM e diretório temporário, não leem .env e não acessam PostgreSQL.
Verificam os endpoints reais via ASGI, cadastro antigo/novo, preservação de um
registro simulado, upload/download, formatos, limites, coordenadas e erros.

ESLint não está instalado; não foi instalado só para rodar lint.
A instalação Expo avisou que Node 22.11.0 está abaixo do requisito das versões
atuais de Metro/React Native (na linha 22, mínimo 22.13.0). Utilize uma versão
compatível se o Metro não iniciar; não foi feita atualização automática do Node.
O npm também reportou 24 vulnerabilidades no conjunto instalado; não foi aplicado
audit fix, pois ele pode alterar dependências fora desta etapa.

`npx expo install --check` apontou somente estes patches de dependências
preexistentes, que não foram atualizados nesta etapa:

| Pacote | Instalado | Esperado pela verificação |
| --- | --- | --- |
| @expo/ui | 57.0.22 | ~57.0.26 |
| expo | 57.0.27 | ~57.0.31 |
| expo-constants | 57.0.21 | ~57.0.22 |
| expo-linking | 57.0.12 | ~57.0.13 |
| expo-router | 57.0.25 | ~57.0.29 |
| expo-splash-screen | 57.0.9 | ~57.0.10 |

Os novos módulos instalados são expo-image-picker ~57.0.20 e expo-location
~57.0.22. No backend, foram acrescentados python-multipart 0.0.32 e Pillow
13.0.0. `pip check` passou. O middleware de uploads limita também o corpo
multipart, inclusive quando não há Content-Length.

## Expo Go e validação completa

Somente depois da migração revisada/aprovada e do backend iniciado:

1. Mantenha celular e computador na mesma rede. O endereço central continua
   `http://192.168.10.10:8000`, em `src/config/api.ts`.
2. Confira no celular que `http://192.168.10.10:8000/` retorna a mensagem da API.
3. Em outro terminal na raiz, execute `npm run start -- --go` e abra o QR code
   no Expo Go compatível com SDK 57.
4. Consulte ocorrências existentes e seus detalhes: foto placeholder e
   localização não informada devem continuar aparecendo.
5. No cadastro, confira a validação da descrição vazia.
6. Abra a galeria, cancele e repita selecionando uma imagem. Confira a prévia,
   remova e selecione outra. Teste também Tirar foto, aceitando ou negando
   a permissão de câmera.
7. Obtenha a localização, confira o indicador e as coordenadas; remova e
   obtenha novamente. Teste permissão negada e localização do aparelho desligada.
   Há espera máxima de 20 segundos pela posição, sem rastreamento contínuo.
8. Após autorizar gravações de teste, cadastre uma ocorrência sem evidências e
   outra com foto/GPS. Verifique ambas na listagem e nos detalhes.
9. Reinicie o backend e reabra os detalhes: a referência e as coordenadas devem
   permanecer, com o arquivo de imagem preservado em backend/uploads/.

Os passos de cadastro gravam novos registros e uploads. Eles não foram executados
no PostgreSQL existente pelos testes automatizados. A migração foi aplicada
separadamente após autorização, backup e validação da restauração.

Galeria usa o seletor do sistema sem pedir acesso amplo à biblioteca; câmera e
GPS solicitam suas permissões. ImagePicker e localização pontual estão incluídos
no Expo Go SDK 57. Os textos dos config plugins são usados em builds próprias;
o Expo Go usa suas próprias mensagens de permissão.

Referências:
- [ImagePicker SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)
- [Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [Uploads FastAPI](https://fastapi.tiangolo.com/tutorial/request-files/)

## Correção do multipart e da listagem no Expo Go

No SDK 57, o fetch global usa o encoder do Expo. Um objeto apenas com uri,
name e type não é um Blob nem um File com bytes() e gera
`Unsupported FormDataPart implementation`. O serviço usa agora um File real
de expo-file-system (dependência direta ~57.0.7) com FormData e expo/fetch.
O campo multipart continua sendo file e o limite continua em 8 MiB.

O IP antigo 192.168.1.103 deixou de responder; o IP LAN atual do computador,
192.168.10.10, respondeu GET /occurrences com HTTP 200 e dois registros.
A configuração central foi atualizada para esse endereço confirmado. Se o
IP da rede mudar novamente, atualize somente src/config/api.ts. O acesso pelo
celular ainda depende de ambos estarem na mesma rede e da liberação da porta
8000 no firewall; um túnel do Metro não publica automaticamente a API.

Listagem e detalhes distinguem falhas de comunicação, resposta inválida e
resultado vazio/não encontrado. Há retry, timeout e recarga ao voltar à tela.

Teste de regressão adicional, na raiz:

```powershell
node --test scripts/test-mobile-regressions.cjs
```

Os testes usam o encoder multipart do Expo instalado e simulam o acesso nativo
ao arquivo, a rede e a navegação. Não substituem o teste final no aparelho.
Para retestar: confirme GET /occurrences no navegador do celular, reinicie o
Metro com `npm run start -- --go --clear`, reabra o app no Expo Go e teste
cadastro sem foto e com foto/GPS. Pare o backend temporariamente e use
Tentar novamente para confirmar que uma falha não aparece como lista vazia.
