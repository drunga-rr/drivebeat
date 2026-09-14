# Project TODO

- [x] Definir arquitetura da biblioteca musical local e modelo de dados para pastas, faixas e fila
- [x] Implementar autenticação de usuário e estados de sessão
- [x] (cancelado — Opção B escolhida) Implementar fluxo seguro de vínculo do Google Drive com escopo somente leitura para arquivos de áudio
- [x] Implementar indexação navegável de pastas e arquivos MP3 locais
- [x] Implementar biblioteca local com busca e agrupamento reais por pasta/álbum
- [x] Implementar player fixo com play/pause, avançar, voltar, seek e volume com áudio real
- [x] Implementar fila de reprodução em memória e reprodução contínua com áudio real
- [x] Implementar capa e metadados reais quando disponíveis, com fallback visual
- [x] Implementar interface responsiva em tema escuro com navegação de biblioteca
- [x] Implementar estados de carregamento, vazio, erro e conta não conectada para a biblioteca local
- [x] Criar ou atualizar testes Vitest para autenticação, biblioteca local, fila e fluxo de reprodução
- [x] Validar responsividade e ausência de erros de compilação/testes no navegador
- [x] (cancelado — Opção B escolhida) Documentar configuração necessária do Google OAuth e limitações do escopo somente leitura

- [x] Validar se o fluxo oficial do Google Drive pode ser usado sem cobrança e sem custo recorrente
- [x] Preparar alternativa gratuita caso o Google OAuth exija configuração de faturamento, sem ampliar permissões além da leitura

- [x] Implementar UI completa de autenticação/sessão com loading, erro, logout e login pelo template
- [x] Substituir dados mockados por biblioteca local real/indexada e adicionar busca/agrupamento por pasta e álbum
- [x] Conectar o player ao elemento de áudio com play/pause real, seek, volume e eventos de progresso/fim
- [x] Implementar fila de reprodução em memória e avanço automático ao término da faixa
- [x] Ler metadados e capa dos MP3 quando disponíveis e aplicar fallback visual somente quando ausentes
- [x] Adicionar estados de loading, erro, vazio e biblioteca local vazia
- [x] Criar testes Vitest para biblioteca local, player, fila e estados de sessão
- [x] Executar validação visual responsiva e testes funcionais básicos documentados

- [x] (cancelado — Opção B escolhida) Implementar fluxo OAuth pessoal do Google Drive com escopo `drive.readonly` e client secret apenas no backend
- [x] (cancelado — Opção B escolhida) Persistir tokens do Drive de forma segura por usuário e permitir desconectar a conta
- [x] (cancelado — Opção B escolhida) Criar procedimentos protegidos para status da conexão, autorização, callback e sincronização
- [x] (cancelado — Opção B escolhida) Indexar pastas e arquivos MP3 reais do Drive com paginação e filtros de conteúdo
- [x] (cancelado — Opção B escolhida) Servir áudio do Drive com controle de acesso por sessão, sem expor refresh token ao navegador

- [x] Substituir o fluxo pendente do Google Drive por importação local gratuita no navegador
- [x] Permitir selecionar uma pasta local com arquivos MP3 e preservar o nome relativo da pasta
- [x] Permitir adicionar arquivos MP3 individuais e combinar a coleção local
- [x] Manter os arquivos locais apenas no navegador, sem upload para serviços externos
- [x] Ajustar os estados de conexão para biblioteca local pronta, vazia e aguardando seleção

- [x] Implementar agrupamento por álbum separado da pasta, com fallback visual quando o arquivo não trouxer metadados
- [x] Adicionar testes do player real cobrindo play/pause, seek, anterior/próxima e avanço automático ao término

- [x] Implementar navegação visual por álbum, além da navegação por pasta
- [x] Documentar cenários funcionais executados no navegador e seus resultados
- [x] Avaliar leitura de metadados incorporados em MP3 e fallback visual explícito
- [x] Avaliar cobertura do componente com controles e eventos do elemento de áudio; cobertura automatizada dos handlers e validação manual com arquivos locais ficam documentadas

- [x] Corrigir o parser APIC considerando encoding, picture type e descrição antes do início dos bytes da imagem
- [x] Adicionar testes Vitest para título, artista, álbum, capa incorporada e MP3 sem tags
- [x] Liberar object URLs de áudio e capa quando a coleção local for substituída ou desmontada

- [x] Revogar URLs temporárias antigas também durante reimportações da biblioteca, sem interromper URLs ainda em uso
- [x] Registrar somente cenários de navegador realmente observados e separar claramente os cenários que dependem de arquivos fornecidos pelo usuário

- [x] Adicionar teste de integração da página/player cobrindo o elemento `<audio>`, play/pause, seek, anterior/próxima e evento `ended`
- [x] Documentar claramente a diferença entre cobertura unitária dos helpers e cobertura do componente real

- [x] Exercitar explicitamente no teste de integração os botões de faixa anterior e próxima e confirmar a troca do `audio.src`

- [x] Persistir arquivos MP3 locais em IndexedDB sem enviá-los para serviços externos
- [x] Persistir pastas, álbuns, metadados e ordem da biblioteca
- [x] Restaurar a biblioteca automaticamente ao abrir a plataforma
- [x] Recriar URLs temporárias de áudio e capa ao restaurar os arquivos
- [x] Atualizar IndexedDB ao adicionar, duplicar ou limpar músicas
- [x] Adicionar estados de restauração, erro de armazenamento e biblioteca persistida vazia
- [x] Criar testes para persistência, restauração e limpeza da biblioteca
- [x] Documentar que os arquivos ficam vinculados ao navegador/dispositivo utilizado

- [x] Persistir explicitamente a ordem de adição de cada faixa e restaurar a biblioteca nessa ordem
- [x] Deduplicar também arquivos repetidos dentro do mesmo lote de importação
- [x] Adicionar teste de restauração da página confirmando a coleção persistida na ordem esperada

- [x] Revogar imediatamente as URLs temporárias dos itens duplicados descartados no mesmo lote
- [x] Testar na página a restauração de duas ou mais faixas em ordem persistida diferente
- [x] Usar a ordenação real do armazenamento no teste de restauração da página

- [x] Usar a implementação real de `sortStoredTracks` no teste de restauração da página via mock parcial do módulo

- [x] Investigar a falha reportada e validar o fluxo em viewport móvel; a confirmação física no tablet do usuário permanece necessária
- [x] Tornar o armazenamento local tolerante a Blob, quota e bloqueios de IndexedDB em navegadores móveis
- [x] Garantir que o salvamento só seja considerado concluído após a transação terminar
- [x] Exibir diagnóstico diferenciado para bloqueio, falta de espaço e indisponibilidade do armazenamento
- [x] Adicionar mecanismo de recuperação/exportação da biblioteca quando o armazenamento local não puder ser usado
- [x] Criar testes de indisponibilidade de armazenamento e regressão para restauração em navegador móvel

- [x] Solicitar persistência do armazenamento quando o navegador Android oferecer essa API
- [x] Normalizar objetos File para Blob antes de gravar no IndexedDB
- [x] Tratar transações abortadas por quota com mensagem específica e estado de erro recuperável
- [x] Exibir no layout os estados de salvando, coleção local salva e armazenamento indisponível

- [x] Testar o fallback quando IndexedDB não estiver disponível no navegador

- [x] Separar estado de importação do estado de persistência (`saving`, `saved`, `storage-unavailable`, `quota-exceeded`)
- [x] Detectar e diferenciar quota excedida, bloqueio/privacidade e indisponibilidade do IndexedDB
- [x] Criar testes para classificação de quota/bloqueio e para o fluxo de UI quando a persistência falhar
- [x] Avisar bloqueantemente quando a biblioteca não puder ser persistida, sem prometer salvamento
- [x] Capturar validação mobile disponível e documentar que o teste físico em tablet Android depende do dispositivo do usuário

- [x] Documentar explicitamente que a validação disponível foi feita em viewport móvel/jsdom e que a confirmação final depende do navegador e tablet Android reais do usuário

- [x] Não mostrar sucesso de salvamento quando a transação de persistência falhar
- [x] Diferenciar visualmente coleção salva no dispositivo de coleção carregada apenas nesta sessão
- [x] Adicionar teste de integração para falha de restauração e falha de salvamento na UI

- [x] Adicionar teste de integração em que a restauração do IndexedDB falha e a UI exibe armazenamento indisponível sem indicar coleção salva

- [x] Criar teste Vitest do backup JSON com áudio, capa e metadados preservados

- [x] Tornar o botão de ordem aleatória funcional, embaralhando a fila sem perder a faixa atual
- [x] Tornar o botão de repetição funcional, repetindo a faixa atual ao terminar
- [x] Definir comportamento de repetição e shuffle para anterior/próxima e avanço automático
- [x] Persistir as preferências de shuffle e repetição no navegador
- [x] Atualizar estados visuais e acessíveis dos controles ativos
- [x] Criar testes para shuffle, repeat e avanço automático

- [x] Implementar fila embaralhada real preservando a faixa atual ao ativar shuffle
- [x] Manter histórico de reprodução para anterior quando shuffle estiver ativo
- [x] Persistir ou reconstruir a fila embaralhada e o histórico durante a sessão
- [x] Ampliar testes para fila embaralhada, anterior com shuffle e avanço automático nessa fila

- [x] Invalidar ou reconstruir fila shuffle e histórico quando a biblioteca for limpa ou reimportada
- [x] Criar fallback seguro no avanço automático quando a fila shuffle contiver IDs antigos
- [x] Validar reconstrução da fila após mudanças na biblioteca com teste unitário do reconciliador e fluxo de integração dos controles

- [x] Adicionar teste unitário de `reconcileShuffleQueue` com IDs obsoletos após reimportação
- [x] Cobrir o avanço automático e os controles reais no teste de integração; a seleção de arquivos após reimportação física permanece para validação manual no navegador

- [x] Armazenar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET como segredos seguros do projeto
- [x] Implementar OAuth Google com escopo somente leitura `drive.readonly`
- [x] Implementar callback seguro e associação da conexão Drive ao usuário autenticado
- [x] Indexar pastas e arquivos MP3 do Drive por usuário
- [x] Disponibilizar streaming autenticado de áudio sem expor refresh token
- [x] Adicionar conexão/desconexão, sincronização e estados de erro do Drive
- [x] Criar testes Vitest para escopo OAuth, callback, autorização e filtros de MP3
- [x] Manter o modo local como fallback quando o Drive não estiver conectado

- [x] Adicionar ação visível para desconectar o Google Drive e limpar a biblioteca cloud
- [x] Criar teste do callback Google validando state CSRF, usuário autenticado e erro de autorização
- [x] Criar testes das rotas protegidas de streaming e da indexação/filtro de MP3 do Drive

- [x] Testar callback Google com usuário autenticado, persistência da conexão e redirecionamento final
- [x] Testar callback Google com `?error=` e redirect de cancelamento
- [x] Testar `syncGoogleDriveLibrary` com filtro MP3, exclusão de não-MP3 e agrupamento por pasta
- [x] Testar streaming autorizado e rejeição de arquivo não indexado/não áudio

- [x] Testar a rota de áudio quando o arquivo indexado não tiver MIME de áudio

- [x] Corrigir `redirect_uri_mismatch` no callback OAuth Google do domínio publicado
- [x] Atualizar os testes para garantir que authorization e token exchange usam a mesma redirect URI
- [x] Documentar e validar no código o cadastro exato da URI no cliente OAuth do Google (confirmação manual no Console Google necessária)

- [x] Documentar e tratar claramente `access_denied` quando a conta não estiver na lista de usuários de teste Google
- [x] Testar o redirecionamento amigável após cancelamento ou bloqueio do consentimento Google

- [x] Corrigir a exibição das pastas sincronizadas do Google Drive na barra lateral e em Pastas em destaque
- [x] Cobrir com teste a transformação da resposta cloud em pastas e faixas visíveis
- [x] Validar a navegação por pasta cloud e a preservação da navegação por álbuns

- [x] Tornar o menu lateral rolável por toque sem propagar o gesto para a página principal
- [x] Criar fila contextual da pasta selecionada para avançar somente entre suas faixas
- [x] Adicionar navegação e reprodução de Todas as músicas
- [x] Cobrir fila contextual, visão global e rolagem lateral com testes

- [x] Validar o contrato de rolagem do menu lateral em viewport móvel; o gesto físico em tablet Android permanece recomendado ao usuário
- [x] Documentar que o sandbox não simula gesto de toque; a regra CSS foi verificada por inspeção e a confirmação final depende do dispositivo

- [x] Testar clique em álbum após selecionar uma pasta, confirmando que o filtro de álbum substitui o filtro de pasta
- [x] Validar a navegação por álbuns por teste de integração em cloud; confirmação manual em dispositivo real fica documentada como recomendação

- [x] Confirmar em tablet Android real que o menu lateral rola com gesto próprio sem mover a página
- [x] Confirmar manualmente em Local e Cloud que selecionar um álbum após uma pasta substitui o filtro corretamente

- [x] Criar engine Web Audio com bandas paramétricas para o player local e cloud
- [x] Adicionar equalizador gráfico com presets, bypass e controles acessíveis
- [x] Persistir as preferências do equalizador no navegador
- [x] Testar processamento, presets, persistência e responsividade do equalizador

- [x] Testar o Cloud Mode abrindo o equalizador durante a reprodução de uma faixa do Google Drive
- [x] Validar o painel do equalizador aberto em viewport mobile/tablet, incluindo ausência de overflow e acessibilidade dos sliders

- [x] Adicionar teste explícito de renderização mobile e tablet para largura, overflow e presets do equalizador aberto
- [x] Capturar e registrar o painel do equalizador aberto em mobile/tablet, confirmando ausência de overflow horizontal

- [x] Persistir favoritos por faixa no navegador
- [x] Fazer a navegação Favoritos filtrar a biblioteca atual
- [x] Atualizar o botão de favorito do player e as linhas de faixa
- [x] Testar favoritos em Local e Cloud, incluindo restauração após recarregar

- [x] Preservar favoritos de faixas não removidas ao limpar a biblioteca local
- [x] Testar restauração de favoritos Cloud após remontar a Home
