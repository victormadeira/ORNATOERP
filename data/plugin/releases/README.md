# Plugin Releases — Storage Layout

Estrutura de diretórios para artefatos `.rbz` (ZIP) do plugin SketchUp Ornato CNC.

```
data/plugin/releases/
├── stable/   # releases públicos
├── beta/     # releases para testers
└── dev/      # builds internos / nightlies
```

Cada arquivo segue o padrão `<version>.rbz` (ex: `1.2.3.rbz`).
A linha de verdade é a tabela `plugin_releases` no SQLite — o filesystem é só storage.

Em produção (VPS) este diretório vive em `/home/ornato/data/plugin/releases/`
e é apontado pela env var `ORNATO_PLUGIN_DIR` (fallback: `<repo>/data/plugin/releases`).

Para publicar um release:
1. Buildar o `.rbz` (`ornato-plugin/scripts/build.sh`)
2. Calcular `sha256sum file.rbz`
3. Mover arquivo para `data/plugin/releases/<channel>/<version>.rbz`
4. Inserir registro com `status='published'` na tabela `plugin_releases`
   (a UI admin do Sprint A4 fará isso via POST /api/plugin/releases)
