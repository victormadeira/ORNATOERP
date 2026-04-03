# Sistema de Colisao

## Como funciona a deteccao automatica

O sistema de colisao e o nucleo do plugin. Ele analisa o contato fisico entre pecas para determinar automaticamente quais usinagens sao necessarias.

## Etapas da deteccao

### Etapa 1 — Extrair faces de cada peca

Cada peca retangular tem 6 faces. O plugin extrai as 6 faces como planos no espaco 3D:

```
         ┌─────────────────┐
        /  TOP             /│
       /                  / │
      ┌─────────────────┐  │
      │                 │  │ ← RIGHT
LEFT →│   FRONT         │  │
      │                 │  /
      │                 │ /
      └─────────────────┘
            BOTTOM

Cada face tem:
  - eixo (X, Y ou Z)
  - posicao no eixo (em mm)
  - direcao normal (+1 ou -1)
  - area (comprimento x largura)
```

As faces sao classificadas em dois tipos:
- **FACE** — superficie grande (area principal da chapa)
- **EDGE** — superficie fina (borda/espessura da chapa)

A classificacao depende das dimensoes: se a menor dimensao da face e proxima da espessura da chapa, e uma EDGE.

### Etapa 2 — Testar contato entre pares

Para cada par de pecas no mesmo modulo, o plugin testa todas as combinacoes de faces (6 x 6 = 36 testes):

```
Peca A (lateral)          Peca B (base)
┌──────────┐              ┌──────────────┐
│          │──── face A    │              │
│          │               │──── face B   │
│          │               │              │
└──────────┘              └──────────────┘

Teste: face A e face B estao em contato?
```

Criterios para contato:
1. **Mesmo eixo** — as duas faces devem estar no mesmo eixo (ambas em X, ou Y, ou Z)
2. **Direcoes opostas** — uma face aponta para +X e outra para -X (se nao, estao "de costas")
3. **Distancia** — a distancia entre as faces deve ser <= tolerancia
4. **Sobreposicao** — as areas das faces devem se sobrepor (overlap >= 10mm em ambas direcoes)
5. **Area minima** — a area de contato deve ser >= 100mm2

### Etapa 3 — Classificar o tipo de juncao

Quando duas faces estao em contato, o tipo de juncao depende de quais tipos de face estao envolvidos:

```
FACE + EDGE  =  BUTT (juncao de topo)
                 A borda de uma peca encosta na face de outra.
                 Tipo mais comum em marcenaria.

                 ┌────┐
                 │    │ ← edge (borda)
                 │    │
    ─────────────┴────┘
    ↑ face (superficie)

    Resultado: minifix + cavilha


FACE + FACE  =  OVERLAY (sobreposicao)
                 Uma face inteira encosta em outra face.
                 Tipico de portas sobre laterais.

    ┌──────────────────┐
    │   PORTA          │ ← face
    │                  │
    ├──────────────────┤
    │   LATERAL        │ ← face
    └──────────────────┘

    Resultado: dobradica (porta) ou parafuso (reforco)


EDGE + EDGE  =  MITER (esquadria)
                 Duas bordas se encontram em angulo.
                 Tipico de molduras.

         ╲
          ╲ ← edge
           ╲
            ├── edge
            │
            │

    Resultado: chanfro 45 + cola


FACE + EDGE  =  DADO (com offset)
com offset       A borda nao encosta na face diretamente,
                 esta recuada (offset > 0.5mm).
                 Tipico de fundo encaixado em rasgo.

    ┌────────────────────┐
    │                    │ ← face (lateral)
    │    ┌──────┐        │
    │    │ FUN  │ ← edge (fundo, recuado)
    │    │      │        │
    │    └──────┘        │
    │  ↑ offset (8mm)   │
    └────────────────────┘

    Resultado: rasgo de fundo na lateral
```

### Etapa 4 — Aplicar regras de ferragem

Com a juncao classificada, o plugin consulta a **matriz de regras** (ver 05_MATRIZ_USINAGENS) para determinar qual usinagem aplicar.

A regra considera:
- O tipo de juncao (butt, overlay, dado, miter)
- O papel de cada peca (lateral, base, porta, gaveta, etc.)
- As configuracoes do usuario (tipo de minifix, espacamento, etc.)

## Sistema de coordenadas

### Coordenadas de mundo vs coordenadas locais

O SketchUp trabalha em **coordenadas de mundo** (X, Y, Z globais). Mas a CNC precisa de **coordenadas locais** (relativas ao canto da peca).

O plugin faz a transformacao automaticamente:

```
MUNDO (SketchUp)                    PECA (CNC)

  Y ↑                               comprimento →
    │   Z                           ┌───────────────────┐
    │  /                            │                   │
    │/                              │  (0,0)            │ largura
    └──────→ X                      │   ●               │   ↓
                                    └───────────────────┘

Transformacao:
  1. Pegar bounding box da peca no mundo
  2. Definir canto de referencia (min da bounding box)
  3. Identificar orientacao (qual eixo e a espessura)
  4. Projetar coordenadas 3D em 2D (face de trabalho)
  5. Calcular posicao relativa ao canto de referencia
```

### As 6 faces (quadrantes)

```
                    REAR (traseira)
                   ┌─────────────┐
                  /             /│
                /    TOP      /  │
              ┌─────────────┐    │
              │             │    │ ← RIGHT
     LEFT  →  │   FRONT     │    │
              │             │   /
              │             │  /
              └─────────────┘/
                  BOTTOM

    TOP    = face superior (Z+ em peca horizontal, Y+ em peca vertical)
    BOTTOM = face inferior
    LEFT   = lateral esquerda (inicio do comprimento)
    RIGHT  = lateral direita (fim do comprimento)
    FRONT  = face frontal (frente do movel)
    REAR   = face traseira (fundo do movel)
```

Para furacoes CNC:
- **TOP/BOTTOM** — furacoes verticais (a maioria: minifix, cavilha, copa de dobradica)
- **LEFT/RIGHT/FRONT/REAR** — furacoes horizontais (eixo minifix, cavilha lateral)

### Posicionamento dos furos

Cada furo e posicionado com:
- `position_x` — distancia do canto esquerdo ao longo do comprimento
- `position_y` — distancia da borda frontal ao longo da largura
- `depth` — profundidade do furo (entrando na espessura)
- `quadrant` — em qual face o furo esta (top, bottom, left, right, front, rear)

```
    Exemplo: 2 furos de minifix numa prateleira

    ┌──────────────────────────┐
    │                          │
    │  ○ (50, 37)              │  ← furo 1: x=50mm, y=37mm (centro largura)
    │                          │
    │              ○ (250, 37) │  ← furo 2: x=250mm, y=37mm
    │                          │
    └──────────────────────────┘
      ↑                        ↑
      x=0                      x=comprimento
```

## Tolerancias

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| PROXIMITY_TOLERANCE | 1.0 mm | Distancia maxima para considerar contato direto |
| DADO_TOLERANCE | 2.0 mm | Distancia maxima para considerar dado/rebaixo |
| MIN_OVERLAP | 10 mm | Sobreposicao minima em cada direcao para contato valido |
| MIN_CONTACT_AREA | 100 mm2 | Area minima de contato para juncao valida |
| THICKNESS_TOLERANCE | 0.5 mm | Tolerancia na deteccao de espessura |
| MIN_PANEL_THICKNESS | 3 mm | Espessura minima para considerar como chapa |

Todas as tolerancias sao configuraveis na aba Configuracoes do plugin.

## Limitacoes

1. **So detecta pecas retangulares** — pecas com recortes, curvas ou chanfros na geometria principal nao sao detectadas como chapas validas
2. **Colisao por bounding box** — nao analisa geometria interna, so a caixa delimitadora
3. **Nao detecta angulos** — pecas em angulo (que nao sao ortogonais aos eixos) podem nao ter juncoes detectadas corretamente
4. **Profundidade maxima de 3 niveis** — modulos com mais de 3 niveis de aninhamento nao sao percorridos
