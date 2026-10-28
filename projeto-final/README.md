# ÉTER — Instrumento de ideias

Landing page estática para o estudo conceitual ÉTER: uma exploração de produto, matéria e gesto.

## Publicação

O projeto não precisa de build ou dependências. Publique a pasta `projeto-final` como um site estático. `index.html` é a entrada, `404.html` é a página de fallback e os arquivos em `assets/` são servidos diretamente.

- **Netlify:** arraste a pasta para o painel ou conecte o repositório; o `netlify.toml` já define a raiz de publicação.
- **Vercel:** importe o projeto como “Other” e deixe o comando de build vazio; o `vercel.json` configura cache dos assets.
- **GitHub Pages:** mantenha o arquivo `.nojekyll` na raiz e publique a branch escolhida.

## Desenvolvimento local

É necessário Node.js 18 ou superior apenas para o servidor local:

```bash
node serve.mjs
```

Abra `http://127.0.0.1:4173/`. O vídeo da quarta dobra usa MP4 e WebM em `assets/product/`; testar por HTTP evita as restrições de mídia de alguns navegadores em `file://`.

## Estrutura

```text
index.html          apresentação principal
hero.css            tokens, layout, componentes e motion
hero.js             interação, scroll, vídeo e acessibilidade
assets/brand        marca e favicon
assets/product      imagens e vídeo do produto
assets/hero         frames transparentes e manifestos do hero
tools/qa            scripts opcionais de auditoria
```

O diretório `projeto-final-archive`, ao lado desta pasta, guarda sequências antigas e artefatos de QA fora do payload de deploy.
