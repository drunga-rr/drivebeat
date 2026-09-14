# DriveBeat — login Google + Google Drive privado

Esta versão usa OAuth 2.0 do Google diretamente. Os MP3s não precisam ser públicos: o navegador recebe o áudio através de `/api/google/audio/:fileId`, e o servidor acessa o Google Drive com a autorização da conta conectada.

## 1. Criar credenciais no Google Cloud

No Google Cloud Console, crie/selecione um projeto e configure **Google Auth Platform**.

- Audience: se o app estiver em teste, adicione sua conta em **Test users**.
- Data Access: adicione os escopos `openid`, `email`, `profile` e `https://www.googleapis.com/auth/drive.readonly`.
- Clients: crie um **OAuth client ID** do tipo **Web application**.

Para teste local, adicione este URI em **Authorized redirect URIs**:

`http://localhost:3000/api/auth/google/callback`

## 2. Configurar o DriveBeat

Copie `.env.example` para `.env` e preencha:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET` com uma chave longa e aleatória
- `GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback`

## 3. Executar localmente

```powershell
npm install --legacy-peer-deps
npm run build
npm start
```

Abra `http://localhost:3000`.

Clique em **Entrar com Google** e autorize o acesso de leitura ao Drive.

## 4. Organização das músicas

O backend lista os MP3s da conta Google autenticada. Para manter a organização, pode usar:

`DriveBeat/Músicas/Artista/Álbum/arquivo.mp3`

A aplicação usa as pastas pai para preencher artista/álbum quando disponíveis.

## 5. Segurança

Os MP3s podem permanecer privados. O refresh token e o access token ficam dentro de um cookie de sessão criptografado e HTTP-only; eles não são enviados ao JavaScript da página.

Para publicar o frontend em GitHub Pages, o backend Node/Express precisa continuar hospedado em um servidor HTTPS separado. GitHub Pages sozinho não executa as rotas OAuth e o proxy de áudio.
