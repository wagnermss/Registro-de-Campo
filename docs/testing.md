# Plano de validação do MVP

Este roteiro cobre os requisitos funcionais e os principais riscos da arquitetura offline-first. Antes de começar, siga o setup do [README](../README.md) e mantenha API, web, mobile, PostgreSQL e MinIO em execução.

## Verificação automatizada

```bash
pnpm typecheck
pnpm format:check
pnpm --filter @registro/api build
pnpm --filter @registro/web build
pnpm test:smoke
```

O smoke test exige a API e a infraestrutura ativas. Ele cria e remove seus próprios dados temporários.

## Preparação do teste manual

- [ ] Entrar no web com as credenciais `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`.
- [ ] Criar dois usuários de campo diferentes.
- [ ] Manter o simulador com câmera, localização e acesso à rede disponíveis.
- [ ] Separar um arquivo PDF pequeno para testar documentos.

Não registre senhas reais, chaves JWT ou o conteúdo do `.env` em capturas de tela.

## 1. Autenticação e usuários

- [ ] Confirmar que credenciais inválidas não autenticam.
- [ ] Entrar como administrador e atualizar a página; a sessão deve ser restaurada.
- [ ] Criar um usuário `FIELD_USER` pelo painel.
- [ ] Entrar no mobile com esse usuário.
- [ ] Bloquear o usuário no web e confirmar que novas chamadas autenticadas deixam de funcionar.
- [ ] Reativar o usuário e confirmar que um novo login funciona.
- [ ] Redefinir sua senha e confirmar que sessões anteriores são invalidadas.

Resultado esperado: ações administrativas são restritas ao administrador e sessões revogadas não continuam acessando a API.

## 2. Criação offline

- [ ] Entrar no mobile enquanto há conexão, para salvar uma sessão válida.
- [ ] Ativar modo avião ou interromper a API.
- [ ] Fechar e reabrir o aplicativo.
- [ ] Confirmar que o aplicativo abre e restaura a sessão local.
- [ ] Capturar uma foto e a localização.
- [ ] Criar um registro com título e descrição.
- [ ] Confirmar que ele aparece imediatamente como pendente.
- [ ] Fechar e reabrir o aplicativo novamente.
- [ ] Confirmar que registro, foto e dados continuam disponíveis.

Resultado esperado: nenhuma etapa de leitura ou criação local depende da API.

## 3. Sincronização e idempotência

- [ ] Restaurar a rede ou reiniciar a API.
- [ ] Aguardar a sincronização automática.
- [ ] Confirmar a mudança visual de pendente para sincronizado.
- [ ] Acionar “Sincronizar agora” novamente.
- [ ] Abrir o dashboard web e localizar o registro uma única vez.
- [ ] Conferir fotografia, título, coordenadas, autor e horário.

Resultado esperado: repetir a sincronização não duplica o registro nem incrementa sua versão sem uma nova edição.

## 4. Isolamento entre usuários

- [ ] Criar um registro com o primeiro usuário de campo e sincronizá-lo.
- [ ] Sair e entrar no mesmo aparelho com o segundo usuário.
- [ ] Confirmar que registros, pendências e conflitos da primeira conta não aparecem.
- [ ] Criar e sincronizar um registro da segunda conta.
- [ ] Confirmar que cada usuário recebe apenas os próprios registros no mobile.
- [ ] Confirmar que o administrador visualiza ambos no dashboard.

Resultado esperado: o cache local e o pull são particionados por usuário, enquanto a visão administrativa permanece global.

## 5. Conflito de versão

Uma forma simples de demonstrar o conflito é manter uma edição pendente no mobile e excluir no web a versão que já estava no servidor.

- [ ] Sincronizar um registro do mobile.
- [ ] Desativar a conexão do mobile.
- [ ] Editar esse registro localmente.
- [ ] Excluir o registro pelo dashboard administrativo.
- [ ] Restaurar a conexão e sincronizar.
- [ ] Confirmar que o mobile exibe conflito, e não uma falha genérica.
- [ ] Abrir a comparação das versões.
- [ ] Testar “Usar servidor” e confirmar que a exclusão é aceita localmente.

Repita o cenário com outro registro:

- [ ] Escolher “Manter local”.
- [ ] Confirmar que uma nova operação pendente é criada com base na versão atual.
- [ ] Sincronizar e conferir o resultado esperado no dashboard.

Resultado esperado: nenhuma versão é descartada silenciosamente; a decisão pertence ao usuário.

## 6. Documentos offline

- [ ] Publicar um PDF no painel administrativo.
- [ ] Atualizar o catálogo no mobile.
- [ ] Baixar e abrir o documento.
- [ ] Desativar a rede.
- [ ] Fechar e reabrir o aplicativo.
- [ ] Abrir novamente o documento baixado.
- [ ] Restaurar a rede e substituir o arquivo pelo web.
- [ ] Confirmar que o mobile indica a nova versão.
- [ ] Antes de baixar a nova versão, confirmar que a anterior continua disponível.
- [ ] Baixar a atualização e abrir o novo arquivo.
- [ ] Desativar o documento e atualizar o catálogo.

Resultado esperado: arquivos já baixados permanecem utilizáveis offline, e atualizações incompletas não removem antecipadamente a versão local anterior.

## 7. Exclusão

- [ ] Excluir um registro pelo dashboard.
- [ ] Confirmar que ele deixa a lista administrativa padrão.
- [ ] Sincronizar o mobile proprietário.
- [ ] Confirmar que o tombstone remove ou oculta a cópia sincronizada.
- [ ] Repetir com uma edição local pendente e confirmar que ocorre `RECORD_DELETED`.

Resultado esperado: exclusões são propagadas sem permitir recriação silenciosa por um dispositivo desatualizado.

## 8. Validação e arquivos inválidos

- [ ] Tentar salvar latitude ou longitude fora do intervalo permitido por chamada direta à API.
- [ ] Tentar enviar um arquivo de texto renomeado para `.jpg`.
- [ ] Tentar enviar um tipo de documento não permitido.
- [ ] Confirmar que um usuário de campo não acessa rotas administrativas.

Resultado esperado: a API rejeita entradas inválidas antes de persistir dados ou arquivos.

## 9. Interface e responsividade

- [ ] Verificar o web em largura desktop e mobile.
- [ ] Confirmar que mapa, textos e ações não se sobrepõem.
- [ ] Verificar estados vazios, carregamento, erro e confirmação de exclusão.
- [ ] Confirmar contraste e legibilidade dos estados de sincronização.
- [ ] Verificar teclado, foco e rótulos dos principais controles web.
- [ ] Confirmar que o mobile respeita a área segura do dispositivo.

## Evidências recomendadas para apresentação

- Uma captura do registro pendente em modo offline.
- A mesma coleta sincronizada no dashboard.
- A tela de comparação de conflito.
- Um documento aberto sem conexão.
- A execução bem-sucedida de `pnpm test:smoke`.

Essas evidências demonstram o requisito central melhor do que capturas isoladas das telas de login.

## Critério de aceite do MVP

O MVP pode ser considerado pronto para apresentação quando:

- [ ] os comandos de verificação automatizada passam;
- [ ] o projeto inicia a partir das instruções do README;
- [ ] criação e leitura offline funcionam após reiniciar o aplicativo;
- [ ] sincronização não duplica registros;
- [ ] isolamento entre usuários está confirmado;
- [ ] conflitos permitem escolher servidor ou local;
- [ ] documentos baixados abrem sem conexão;
- [ ] o administrador consulta e exclui registros e gerencia documentos;
- [ ] não existem erros bloqueadores nos terminais durante a demonstração.

## Registro de resultado

Para uma rodada final, anote data, commit, dispositivo/simulador e resultado. Exemplo:

```text
Data:
Commit:
Ambiente mobile:
Navegador web:
Smoke test: PASS/FAIL
Teste manual: PASS/FAIL
Observações:
```
