# Portal de Cultura — Frontend (Fases 10, 11 e 12a: base, navegação, blocos e editor)

HTML/CSS/JS vanilla com módulos ES nativos. Sem build: a pasta é publicada como está na Vercel.

## Configurar
1. Em `js/config.js`, troque `API_URL` (URL `/exec` do Web App) e `GIS_CLIENT_ID`.
   Enquanto houver placeholder, a tela de login mostra o aviso e não tenta entrar.
2. No Google Cloud, em **Origens JavaScript autorizadas** do Client ID, inclua o domínio da
   Vercel e `http://localhost:5173` (setup.md §3.5).
3. Deploy: importe o repositório na Vercel (framework "Other", sem comando de build).
   O `vercel.json` aplica CSP e cabeçalhos de segurança.

## Rodar localmente
`npx serve -l 5173 .` (ou qualquer servidor estático) e abra `http://localhost:5173`.
Módulos ES não funcionam abrindo o arquivo direto (`file://`).

## Estrutura
| Arquivo | Responsabilidade |
|---|---|
| `js/config.js` | URL, Client ID, timeouts, retry, TTLs, allowlist de cache e mapa de invalidação |
| `js/api.js` | Transporte anti-CORS, envelope, timeout, retry, single-flight, SWR |
| `js/cache.js` | IndexedDB com fallback para localStorage; recusa ações fora da allowlist |
| `js/sessao.js` | ID token da aba (memória + sessionStorage) |
| `js/auth.js` | GIS: One Tap, botão oficial, trava de login, renovação silenciosa |
| `js/sincronia.js` | Bootstrap → cache, snapshot local, vigia do `check_update` |
| `js/shell.js`, `js/app.js` | Casca da interface e orquestração do ciclo de vida |
| `js/ui/*` | DOM seguro, ícones, tema, toast, modal, carregamento, efeitos |
| `js/rotas.js` | Rotas por hash: `#/` (início), `#/<slug>` (página) e `#/editar[/<id>]` (editor) |
| `js/navegacao.js` | Menu montado a partir de `paginas`; marca a página aberta |
| `js/paginas.js` | Início em grade bento, páginas de conteúdo, módulos (em breve) e estados vazios |
| `js/blocos/renderizador.js` | O `switch(tipo)` dos 9 tipos de bloco; o editor vai reaproveitá-lo na prévia |
| `js/blocos/markdown.js` | Markdown sanitizado (marked + DOMPurify, carregados só quando a página usa) |
| `js/blocos/midia.js` | Imagens, vídeo e documento: allowlist de host no cliente, marcador se não carregar |
| `js/blocos/modais.js` | Modais de vídeo (YouTube sem cookies), documento (prévia do Drive) e perfil |
| `js/vendor/*` | marked 18.0.14 e DOMPurify 3.4.16, com licenças (versões fixas, sem CDN) |
| `js/editor/editor.js` | Editor: estado, ações, reordenação otimista, sincronia com o portal |
| `js/editor/vista-menu.js` | Vista "Menu do portal": páginas (ocultas e com erro incluídas) |
| `js/editor/vista-pagina.js` | Vista da página: blocos em molduras de edição + modo "Pré-visualizar" |
| `js/editor/form-pagina.js` | Painel da página: nome, ícone, tipo, módulo, quem vê, visível, endereço |
| `js/editor/form-bloco.js` | Paleta de tipos e painel do bloco com prévia ao vivo (mesmo renderizador) |
| `js/editor/painel.js` | `<dialog>` que só fecha ao salvar com sucesso; pede confirmação ao descartar |
| `js/editor/campos.js`, `componentes.js` | Controles de formulário acessíveis, botões de ícone, selos |
| `js/editor/catalogo.js` | Nomes, rótulos e ajudas por tipo; normalização de mídia (espelho de `Blocos.gs`) |
| `js/editor/dados.js` | Rotas `editor_*`, validação da resposta e fila de escritas |
| `css/editor.css` | Estilos do editor (só tokens) |
| `css/paginas.css` | Estilos do menu, páginas e blocos (só tokens: tema claro/escuro continua valendo) |
| `css/tokens.css` | Todos os tokens (escuro e claro). Trocar o acento: 3 linhas aqui |

## Regras que o código garante
- Dado de nível 3 (resultados de feedback, análise de consultas, votos nominais) nunca vai
  para IndexedDB/localStorage: só ações de `POLITICA_CACHE` são gravadas.
- O cache local pertence a uma conta; ao sair, é apagado.
- Logs no console sem token, payload, nome ou e-mail.
- Nenhum `innerHTML` com dado da API: DOM via `createElement`/`textContent`.
- Markdown só com tags de texto (sem `<img>`, `<script>`, `style` ou eventos); links só
  `https:`/`mailto:` e externos abrem em nova aba com `noopener noreferrer`.
- Nenhum conteúdo de terceiro carrega antes do clique: o player do YouTube e a prévia do
  Drive só entram no DOM ao abrir o modal, em `iframe` com `sandbox`, e saem ao fechar.

## Editor no portal (Fase 12a)
Quem tem papel `admin` vê **Editar portal** no topo (e **Editar esta página** em cada página).
- **Menu do portal** (`#/editar`): criar página, subir/descer no menu, mostrar/ocultar
  (rascunho), configurar (nome, ícone, conteúdo ou módulo, quem vê, endereço) e excluir.
  Excluir uma página apaga os blocos dela; o editor informa quantos antes de confirmar.
- **Conteúdo da página** (`#/editar/<id>`): "Adicionar bloco aqui" entre os blocos abre a
  paleta dos 9 tipos; o painel mostra a **prévia ao vivo** com o mesmo renderizador do portal.
  Cada bloco tem subir/descer, publicar/ocultar, editar e excluir. **Pré-visualizar** mostra a
  página exatamente como o profissional vê.
- **Salvar publica na hora.** Rascunho = item com "visível/publicado" desligado.
- Mídia entra colando o link do Drive ou do YouTube; o campo diz na hora se reconheceu.
- Mover várias vezes seguidas gera **uma** gravação (a ordem vai ao servidor ~1 s depois do
  último clique). Se outra pessoa mudou a estrutura no meio tempo, o servidor recusa, o editor
  avisa e recarrega.
- Depois de cada gravação o menu público se atualiza sozinho (mesmo `check_update` de sempre).
- Linhas com erro vindas da planilha aparecem no editor com a explicação e podem ser
  corrigidas por lá. Linhas **sem id** só podem ser corrigidas na planilha.
- O editor é só atalho visual: **quem decide é o servidor** (papel `admin` em toda rota
  `editor_*`, mesmos contratos de `Blocos.gs`, auditoria nominal de cada alteração).

## Conteúdo pela planilha (continua valendo, em paralelo)
- Uma linha em `paginas` = uma seção no menu e um cartão no início. `icone` aceita:
  `casa`, `livro`, `pessoas`, `estrela`, `coracao`, `calendario`, `mensagem`, `escudo`,
  `grafico`, `video`, `documento` (vazio ou outro valor = sem ícone).
- Uma linha em `blocos` = um bloco da página (`pagina_id`). Contrato de cada tipo na aba `_ajuda`.
- `card` e `pessoa` consecutivos viram grade; `timeline` consecutivos viram uma linha do tempo.
- Depois de editar: menu **Portal de Cultura › Publicar alterações** (ou aguarde o gatilho).
- Linha com erro não quebra a página: é ignorada e aparece no log do Apps Script.
- Criar um **tipo novo** de bloco exige código: contrato em `Blocos.gs` + `case` em
  `js/blocos/renderizador.js` + nome/rótulos em `js/editor/catalogo.js` (o formulário do editor
  é gerado a partir do contrato).
- O endereço `editar` é reservado (abre o editor): uma linha com `slug = editar` é ignorada.

## Hosts de mídia (CSP)
`img-src` e `frame-src` do `vercel.json` liberam Drive, `*.googleusercontent.com`,
`i.ytimg.com` e `www.youtube-nocookie.com`. Host novo de imagem = acrescentar em três lugares:
CSP (`vercel.json`), `HOSTS_IMAGEM` (`js/config.js`) e `midia_hosts_permitidos` (aba `config`).
