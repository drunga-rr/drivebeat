# DriveBeat — Google Drive

A sincronização do DriveBeat usa OAuth do Google e a Google Drive API.

A biblioteca em nuvem é limitada à árvore:

`DriveBeat/Músicas/`

Todos os níveis de subpastas são percorridos recursivamente. A API também é paginada, portanto pastas/arquivos além da primeira página continuam sendo encontrados.

Os MP3 permanecem privados no Google Drive. A reprodução passa pelo servidor DriveBeat autenticado.
