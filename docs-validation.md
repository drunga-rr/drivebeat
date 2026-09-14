# Validação do DriveBeat

## Verificações automatizadas

O comando `pnpm check` foi executado sem erros de TypeScript. A suíte `pnpm test` foi executada com 10 testes passando em 3 arquivos: autenticação/logout do template, regras da biblioteca local e controles do player/fila.

## Verificações visuais no preview

A tela inicial foi capturada em desktop com viewport de 1280 × 720 e em celular com viewport de 390 × 844. O layout confirmou sidebar persistente no desktop, menu compacto no celular, hero sem overflow horizontal, estado de coleção vazia e player fixo visível nos dois tamanhos.

## Cenários observados

Foi observado no preview que a tela inicial carrega sem erro, apresenta o estado de coleção vazia, mantém o player fixo visível, oferece os dois controles de importação e adapta a navegação para desktop e celular. A verificação automatizada confirma a lógica de seleção de pasta, filtro de MP3, separação entre pasta e álbum, controles de play/pause, seek, anterior/próxima e avanço circular da fila. O teste de integração `client/src/pages/Home.integration.test.tsx` também renderiza a página em jsdom, injeta dois arquivos MP3 sintéticos, verifica o `audio.src`, dispara play/pause, altera seek, dispara `ended`, confirma a próxima faixa e verifica a revogação das URLs ao limpar a coleção.

A validação com uma pasta real de MP3 permanece um passo do usuário: o seletor de arquivos exige interação com arquivos locais que não estão disponíveis ao ambiente de validação. O teste de integração cobre o fluxo do componente com arquivos sintéticos, restauração ordenada, armazenamento bloqueado e quota excedida; a seleção de uma pasta física, a reprodução de um arquivo pessoal e a conferência auditiva continuam sendo verificações do usuário. Depois da seleção, o fluxo implementado lê tags ID3 quando presentes, cria URLs temporárias locais e reproduz o arquivo sem enviá-lo para a nuvem.

## Limite da validação Android

A validação realizada neste ambiente cobre a interface em viewport móvel de 768 × 1024, testes jsdom do fluxo de restauração e testes unitários da camada IndexedDB. Ela não substitui a confirmação em hardware Android físico: o resultado final pode variar conforme o navegador, o modo normal ou anônimo, as permissões de armazenamento, a quota disponível e as configurações de limpeza de dados do tablet do usuário. Para confirmar, importe uma pasta no navegador Android normal, aguarde o indicador de salvamento e reabra o mesmo endereço no mesmo navegador e dispositivo.
