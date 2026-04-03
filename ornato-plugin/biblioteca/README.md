# Biblioteca Ornato — Guia Completo

## O que é

A biblioteca é o coração do plugin. Contém tudo que o plugin precisa para transformar
um modelo 3D em dados de produção:

- **Móveis** — Módulos paramétricos (armários, gaveteiros, torres, etc.)
- **Ferragens** — Especificações técnicas de dobradiças, minifix, corrediças, etc.
- **Usinagens** — Padrões de furação e operações CNC pré-configurados
- **Materiais** — Chapas e painéis com códigos e espessuras
- **Bordas** — Fitas de borda com espessuras e cores

Todos os itens são arquivos `.json` que você pode **editar manualmente** com qualquer
editor de texto, ou gerenciar pela interface do plugin.

---

## Estrutura de Pastas

```
biblioteca/
├── moveis/              ← Módulos paramétricos de móveis
│   ├── cozinha/         ← Organizados por ambiente
│   ├── dormitorio/
│   ├── banheiro/
│   ├── escritorio/
│   ├── closet/
│   ├── area_servico/
│   └── comercial/
├── ferragens/           ← Especificações de ferragens
│   ├── dobradicas/
│   ├── minifix/
│   ├── cavilhas/
│   ├── corredicas/
│   ├── puxadores/
│   ├── suportes/
│   └── especiais/
├── usinagens/           ← Padrões de usinagem CNC
│   ├── furacoes/
│   ├── canais/
│   ├── rebaixos/
│   └── contornos/
├── materiais/           ← Chapas e painéis
│   └── chapas.json
└── bordas/              ← Fitas de borda
    └── bordas.json
```

---

## Como Criar Seus Próprios Itens

### Criar um Móvel Customizado

1. Copie um arquivo `.json` de um móvel existente parecido
2. Renomeie (ex: `meu_armario_especial.json`)
3. Edite os campos no editor de texto
4. Salve na pasta do ambiente correto
5. O plugin carrega automaticamente na próxima abertura

**Campos de um móvel:**

```json
{
  "id": "identificador_unico",
  "nome": "Nome que aparece na biblioteca",
  "descricao": "Descrição curta do módulo",
  "categoria": "cozinha",
  "tags": ["base", "pia", "2portas"],
  "icone": "armario_base",

  "parametros": {
    "largura":       { "default": 800, "min": 300, "max": 2400, "step": 50, "unidade": "mm" },
    "altura":        { "default": 850, "min": 400, "max": 2700, "step": 50, "unidade": "mm" },
    "profundidade":  { "default": 580, "min": 250, "max": 800, "step": 10, "unidade": "mm" },
    "espessura":     { "default": 18,  "min": 9,   "max": 25,  "step": 0.5, "unidade": "mm" },
    "n_prateleiras": { "default": 1,   "min": 0,   "max": 6,   "step": 1 },
    "tipo_porta":    { "default": "2_abrir", "opcoes": ["sem", "1_abrir_e", "1_abrir_d", "2_abrir", "basculante", "correr"] },
    "tipo_juncao":   { "default": "minifix", "opcoes": ["minifix", "cavilha", "confirmat", "parafuso"] },
    "com_fundo":     { "default": true },
    "com_rodape":    { "default": true, "altura_rodape": 100 },
    "puxador":       { "default": "modelo_160mm" }
  },

  "pecas": [
    {
      "nome": "Lateral Esquerda",
      "role": "lateral_esq",
      "largura": "{altura}",
      "altura": "{profundidade}",
      "espessura": "{espessura}",
      "posicao": { "x": 0, "y": 0, "z": 0 },
      "bordas": { "frontal": true, "traseira": false, "dir": false, "esq": false },
      "notas": "Fita na borda frontal (visível)"
    },
    {
      "nome": "Lateral Direita",
      "role": "lateral_dir",
      "largura": "{altura}",
      "altura": "{profundidade}",
      "espessura": "{espessura}",
      "posicao": { "x": "{largura} - {espessura}", "y": 0, "z": 0 },
      "bordas": { "frontal": true, "traseira": false, "dir": false, "esq": false }
    },
    {
      "nome": "Base",
      "role": "base",
      "largura": "{largura} - 2 * {espessura}",
      "altura": "{profundidade}",
      "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": 0, "z": 0 },
      "bordas": { "frontal": true, "traseira": false, "dir": false, "esq": false }
    },
    {
      "nome": "Traseira",
      "role": "traseira",
      "largura": "{largura} - 2 * {espessura}",
      "altura": "{altura} - {espessura}",
      "espessura": 3,
      "condicao": "{com_fundo}",
      "posicao": { "x": "{espessura}", "y": "{profundidade} - 13", "z": "{espessura}" },
      "bordas": { "frontal": false, "traseira": false, "dir": false, "esq": false }
    }
  ],

  "ferragens_auto": [
    { "regra": "minifix", "juncao": "lateral_esq × base", "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix", "juncao": "lateral_dir × base", "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "cavilha", "juncao": "lateral_esq × base", "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha", "juncao": "lateral_dir × base", "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "dobradica", "peca": "lateral_esq", "condicao": "{tipo_porta} != 'sem' && {tipo_porta} != 'correr'" },
    { "regra": "rebaixo_fundo", "pecas": ["lateral_esq", "lateral_dir", "base"], "condicao": "{com_fundo}" },
    { "regra": "puxador", "peca": "porta", "condicao": "{tipo_porta} != 'sem'" },
    { "regra": "system32", "pecas": ["lateral_esq", "lateral_dir"], "condicao": "{n_prateleiras} > 0" }
  ]
}
```

**Campos com `{variavel}`** são resolvidos automaticamente usando os parâmetros.
**Campos com `condicao`** só geram a peça/ferragem se a condição for verdadeira.

### Criar uma Ferragem Customizada

```json
{
  "id": "minha_dobradica_especial",
  "nome": "Dobradiça Especial 120°",
  "marca": "Marca X",
  "modelo": "Modelo Y",
  "categoria": "dobradica",
  "angulo": 120,

  "especificacoes": {
    "furo_principal": { "diametro": 35, "profundidade": 12.0 },
    "furos_piloto": { "diametro": 2.5, "profundidade": 10, "distancia_centro": 24 },
    "offset_borda": 22.5,
    "distancia_topo_base": 100,
    "regra_quantidade": {
      "ate_600mm": 2,
      "ate_1200mm": 3,
      "ate_1800mm": 4,
      "acima": 5
    }
  },

  "bom": {
    "codigo_compra": "DOB-120-MX",
    "preco_unitario": 12.50,
    "unidade": "par",
    "fornecedor": "Distribuidor ABC"
  }
}
```

### Criar uma Usinagem Customizada

```json
{
  "id": "meu_rebaixo_custom",
  "nome": "Rebaixo para Vidro 4mm",
  "categoria": "rebaixo",
  "descricao": "Rebaixo na face interna para encaixe de vidro 4mm",

  "operacao": {
    "tipo": "pocket",
    "ferramenta": "fresa_6mm",
    "largura": 6,
    "profundidade": 4.5,
    "offset_borda": 15,
    "lado": "a",
    "percurso": "perimetro_interno"
  },

  "aplicacao": {
    "pecas": ["porta", "lateral"],
    "condicao_manual": true
  }
}
```

---

## Referência de Campos

### Roles (papéis das peças)
| Role | Descrição |
|------|-----------|
| `lateral_esq` | Lateral esquerda do módulo |
| `lateral_dir` | Lateral direita do módulo |
| `base` | Base/fundo inferior |
| `topo` | Tampo/topo |
| `traseira` | Painel traseiro (fundo) |
| `prateleira` | Prateleira (fixa ou regulável) |
| `divisoria` | Divisória vertical interna |
| `porta` | Porta de abrir |
| `porta_correr` | Porta de correr |
| `frente_gaveta` | Frente de gaveta |
| `lateral_gaveta` | Lateral de gaveta |
| `fundo_gaveta` | Fundo de gaveta |
| `traseira_gaveta` | Traseira de gaveta |
| `rodape` | Rodapé/saia |
| `tamponamento` | Painel de acabamento lateral |

### Regras de Ferragem Disponíveis
| Regra | O que gera |
|-------|-----------|
| `dobradica` | Furos Ø35mm + piloto para dobradiça |
| `system32` | Fileira de Ø5mm a cada 32mm |
| `minifix` | Ø15mm corpo + Ø8mm pino |
| `cavilha` | Ø8mm em ambas as peças |
| `puxador` | 2x Ø5mm passante |
| `corredica` | Padrão de furos para corrediça |
| `rebaixo_fundo` | Canal para encaixe do fundo |
| `prateleira_fixa` | 2x Ø8mm para apoio |
| `confirmat` | Furo Ø5mm + Ø7mm escareado |
| `parafuso` | Furo piloto Ø3mm |

### Tipos de Porta
| Valor | Descrição |
|-------|-----------|
| `sem` | Sem porta |
| `1_abrir_e` | 1 porta abrindo para esquerda |
| `1_abrir_d` | 1 porta abrindo para direita |
| `2_abrir` | 2 portas abrindo |
| `basculante` | Porta basculante (abre para cima) |
| `correr` | Portas de correr |

### Tipos de Junção
| Valor | Descrição |
|-------|-----------|
| `minifix` | Minifix (cam lock) — padrão industrial |
| `cavilha` | Cavilha Ø8mm — alternativa econômica |
| `confirmat` | Parafuso confirmat — visível |
| `parafuso` | Parafuso com bucha — mais simples |

---

## Dicas para Criação Manual

1. **Sempre valide o JSON** — Use jsonlint.com ou o editor do VS Code
2. **Copie um existente** — Nunca crie do zero, copie o mais parecido
3. **IDs únicos** — Cada item precisa de um `id` único (use snake_case)
4. **Teste incrementalmente** — Adicione uma peça, teste, adicione outra
5. **Parâmetros com fórmula** — Use `{largura}`, `{altura}`, etc. para dimensões dinâmicas
6. **Condições** — Use `"condicao": "{campo} == 'valor'"` para peças opcionais
7. **Backup** — Antes de editar, copie o arquivo original

---

## Suporte

- **No plugin:** Menu Ornato CNC → Biblioteca → Gerenciar
- **Na web:** Documentação completa em gestaoornato.com/docs/biblioteca
- **Suporte:** suporte@gestaoornato.com
