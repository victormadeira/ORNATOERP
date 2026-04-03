# Hierarquia do Modelo

## Estrutura obrigatoria

O plugin reconhece uma hierarquia de 3 niveis:

```
MODELO (arquivo .skp)
  └── MODULO (grupo nomeado com prefixo ORN_)
        ├── PECA (grupo nomeado com codigo de peca)
        ├── PECA
        ├── PECA
        └── SUBMODULO (opcional — modulo dentro de modulo)
              ├── PECA
              └── PECA
```

### Nivel 1 — Modelo

O arquivo SketchUp inteiro. Pode conter multiplos modulos (ex: cozinha completa com 5 armarios).

### Nivel 2 — Modulo

Um grupo ou componente que representa um movel completo. Exemplos:
- Um balcao de cozinha
- Um armario aereo
- Uma torre de forno
- Um gaveteiro

**Regras:**
- DEVE ser um grupo ou componente no nivel raiz do modelo (ou dentro de outro modulo)
- DEVE ter nome com prefixo `ORN_` seguido do codigo do tipo (ver 03_NOMENCLATURA)
- O nome pode ter sufixo descritivo livre: `ORN_BAL Pia Cozinha`
- Profundidade maxima de aninhamento: 3 niveis

### Nivel 3 — Peca

Um grupo ou componente dentro do modulo que representa uma chapa/painel individual. Exemplos:
- Lateral esquerda
- Topo
- Prateleira
- Porta

**Regras:**
- DEVE ser um grupo ou componente DENTRO de um modulo
- DEVE ter nome com codigo de peca (ver 03_NOMENCLATURA)
- DEVE ser geometricamente retangular (6 faces)
- A menor dimensao e interpretada como espessura

## Como o plugin identifica cada nivel

```
O plugin varre o modelo recursivamente:

1. Encontra grupo/componente no nivel raiz
   ├── Nome comeca com ORN_ ?
   │     SIM → e um MODULO → entra e procura pecas
   │     NAO → ignora (geometria decorativa, nao e movel)
   │
   └── Dentro do modulo, para cada subgrupo:
         ├── Contem subgrupos dentro?
         │     SIM → pode ser SUBMODULO (repete a logica)
         │     NAO → e uma PECA (folha da arvore)
         │
         └── E retangular (6 faces)?
               SIM → registra como peca valida
               NAO → ignora (ferragem visual, auxiliar)
```

## Exemplo completo — Cozinha

```
Modelo: Cozinha_Cliente_Silva.skp
│
├── ORN_BAL Balcao Pia                    ← modulo
│     ├── LAT_ESQ                         ← peca: lateral esquerda
│     ├── LAT_DIR                         ← peca: lateral direita
│     ├── BASE                            ← peca: base (fundo estrutural)
│     ├── TOPO                            ← peca: topo
│     ├── DIV_V                           ← peca: divisor vertical
│     ├── PRA                             ← peca: prateleira fixa
│     ├── FUN                             ← peca: fundo (painel traseiro)
│     ├── POR_ESQ                         ← peca: porta esquerda
│     └── POR_DIR                         ← peca: porta direita
│
├── ORN_BAL_GAV Gaveteiro                 ← modulo
│     ├── LAT_ESQ
│     ├── LAT_DIR
│     ├── BASE
│     ├── TOPO
│     ├── FUN
│     ├── GAV_FR                          ← peca: frente de gaveta
│     ├── GAV_LAT                         ← peca: lateral de gaveta
│     ├── GAV_LAT                         ← peca: lateral de gaveta (outra)
│     ├── GAV_FUN                         ← peca: fundo de gaveta
│     └── GAV_TRA                         ← peca: traseira de gaveta
│
├── ORN_AER Aereo Escorredor              ← modulo
│     ├── LAT_ESQ
│     ├── LAT_DIR
│     ├── TOPO
│     ├── BASE
│     ├── FUN
│     └── POR                             ← peca: porta (unica)
│
├── ORN_TOR_FOR Torre Forno               ← modulo
│     ├── LAT_ESQ
│     ├── LAT_DIR
│     ├── TOPO
│     ├── BASE
│     ├── FUN
│     ├── PRA                             ← prateleira fixa (apoio do forno)
│     ├── PRA_REG                         ← prateleira regulavel
│     ├── POR_ESQ                         ← porta superior
│     └── POR_DIR                         ← porta inferior
│
└── ORN_BAN Bancada                       ← modulo
      └── PAI                             ← peca: painel unico (tampo)
```

## Modulos aninhados

Quando um movel tem sub-conjuntos, use modulos dentro de modulos:

```
ORN_ARM Armario Quarto
  ├── LAT_ESQ                             ← peca do armario
  ├── LAT_DIR
  ├── TOPO
  ├── BASE
  ├── FUN
  │
  ├── ORN_GAV Gaveteiro Interno           ← submodulo
  │     ├── GAV_FR
  │     ├── GAV_LAT
  │     ├── GAV_LAT
  │     ├── GAV_FUN
  │     └── GAV_TRA
  │
  └── ORN_NIC Nicho Lateral               ← submodulo
        ├── DIV_V
        ├── PRA
        └── PRA
```

O plugin processa cada submodulo de forma independente — as juncoes sao detectadas dentro do escopo de cada modulo.

## Regras importantes

1. **Pecas soltas** (fora de qualquer grupo ORN_) sao ignoradas pelo plugin
2. **Grupos sem prefixo ORN_** dentro de um modulo sao ignorados (podem ser geometria auxiliar, ferragens visuais, etc.)
3. **Pecas com menos de 6 faces** sao ignoradas (nao sao chapas retangulares)
4. **A espessura e detectada automaticamente** — e sempre a menor dimensao da peca
5. **Componentes duplicados** (instancias) sao tratados individualmente — cada instancia pode ter usinagens diferentes dependendo da posicao
6. **Nomes sao case-insensitive** — `LAT_ESQ`, `lat_esq` e `Lat_Esq` sao equivalentes
7. **Sufixos sao ignorados** — `LAT_ESQ`, `LAT_ESQ mdf branco`, `LAT_ESQ#1` sao todos reconhecidos como lateral esquerda
