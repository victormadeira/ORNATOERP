# Nomenclatura

## Codigos de Modulo (prefixo ORN_)

O nome do grupo no SketchUp DEVE comecar com um destes codigos. Tudo apos o codigo e tratado como descricao livre.

### Moveis de cozinha

| Codigo | Descricao | Exemplo no SketchUp |
|--------|-----------|---------------------|
| `ORN_BAL` | Balcao | `ORN_BAL Pia Central` |
| `ORN_BAL_PIA` | Balcao com pia | `ORN_BAL_PIA Cuba Inox` |
| `ORN_BAL_CK` | Balcao cooktop | `ORN_BAL_CK 5 bocas` |
| `ORN_BAL_CAN` | Balcao de canto | `ORN_BAL_CAN L` |
| `ORN_BAL_GAV` | Balcao gaveteiro | `ORN_BAL_GAV 4 gavetas` |
| `ORN_AER` | Aereo | `ORN_AER Escorredor` |
| `ORN_AER_ESC` | Aereo escorredor | `ORN_AER_ESC` |
| `ORN_AER_CAN` | Aereo de canto | `ORN_AER_CAN` |
| `ORN_TOR` | Torre (generico) | `ORN_TOR Despenseiro` |
| `ORN_TOR_FOR` | Torre forno/micro | `ORN_TOR_FOR Forno Embutir` |
| `ORN_TOR_GEL` | Torre geladeira | `ORN_TOR_GEL Side by Side` |
| `ORN_PAN` | Paneleiro | `ORN_PAN` |

### Moveis de dormitorio/closet

| Codigo | Descricao | Exemplo no SketchUp |
|--------|-----------|---------------------|
| `ORN_ARM` | Armario (generico) | `ORN_ARM Suite` |
| `ORN_ARM_POR` | Armario com portas de abrir | `ORN_ARM_POR 3 portas` |
| `ORN_ARM_COR` | Armario portas de correr | `ORN_ARM_COR 2 folhas` |
| `ORN_GAV` | Gaveteiro avulso | `ORN_GAV 5 gavetas` |
| `ORN_SAP` | Sapateira | `ORN_SAP` |
| `ORN_CAB` | Cabideiro | `ORN_CAB` |
| `ORN_COM` | Comoda | `ORN_COM` |
| `ORN_CRI` | Criado mudo | `ORN_CRI` |

### Moveis diversos

| Codigo | Descricao | Exemplo no SketchUp |
|--------|-----------|---------------------|
| `ORN_NIC` | Nicho | `ORN_NIC Decorativo` |
| `ORN_BAN` | Bancada/tampo | `ORN_BAN Escritorio` |
| `ORN_MES` | Mesa | `ORN_MES Jantar` |
| `ORN_EST` | Estante | `ORN_EST Livros` |
| `ORN_PAI` | Painel avulso | `ORN_PAI TV` |
| `ORN_MOL` | Moldura | `ORN_MOL Teto` |
| `ORN_ROD` | Rodape | `ORN_ROD Cozinha` |
| `ORN_PRA` | Prateleira avulsa | `ORN_PRA Decorativa` |
| `ORN_DIV` | Divisoria | `ORN_DIV Ambiente` |
| `ORN_HOM` | Home theater | `ORN_HOM` |
| `ORN_LAV` | Lavanderia | `ORN_LAV` |

### Banheiro

| Codigo | Descricao | Exemplo no SketchUp |
|--------|-----------|---------------------|
| `ORN_BAN_WC` | Gabinete banheiro | `ORN_BAN_WC Suspenso` |
| `ORN_ESP` | Espelheira | `ORN_ESP Banheiro` |

---

## Codigos de Peca (dentro do modulo)

O nome do grupo/componente DENTRO do modulo deve comecar com um destes codigos.

### Estrutura (caixa do movel)

| Codigo | Descricao | Papel na usinagem |
|--------|-----------|-------------------|
| `LAT_ESQ` | Lateral esquerda | Recebe furos de minifix/cavilha nas juncoes com topo, base, prateleiras. Recebe rasgo de fundo. |
| `LAT_DIR` | Lateral direita | Idem lateral esquerda (espelhado). |
| `TOPO` | Topo (tampo superior) | Recebe furos de minifix/cavilha nas juncoes com laterais. |
| `BASE` | Base (fundo estrutural) | Recebe furos de minifix/cavilha nas juncoes com laterais. |
| `FUN` | Fundo (painel traseiro) | Gera rasgo de fundo nas laterais, topo e base. Espessura tipica: 3mm ou 6mm. |
| `DIV_V` | Divisor vertical | Recebe furos de cavilha nas juncoes com topo e base. Recebe rasgo de fundo. |
| `DIV_H` | Divisor horizontal | Recebe furos de cavilha nas juncoes com laterais. |
| `TAM` | Tamponamento | SEM usinagem — fixacao por cola/silicone. |
| `TEST` | Testeira | SEM usinagem — fixacao por parafuso externo ou cola. |
| `ROD` | Rodape (base do movel) | SEM usinagem — fixacao por parafuso externo. |

### Prateleiras

| Codigo | Descricao | Papel na usinagem |
|--------|-----------|-------------------|
| `PRA` | Prateleira fixa | Recebe furos de cavilha nas juncoes com laterais/divisores. |
| `PRA_REG` | Prateleira regulavel | SEM usinagem direta — gera furos de System32 nas laterais/divisores. |

### Portas

| Codigo | Descricao | Papel na usinagem |
|--------|-----------|-------------------|
| `POR` | Porta (unica) | Recebe copa de dobradica (35mm). Gera furos de calco na lateral. |
| `POR_ESQ` | Porta esquerda | Idem POR, dobradica no lado esquerdo. |
| `POR_DIR` | Porta direita | Idem POR, dobradica no lado direito. |
| `POR_COR` | Porta de correr | SEM furacao de dobradica — gera canal de trilho no topo/base. |
| `POR_BAS` | Porta basculante | Dobradica de pistao — furacao especifica. |
| `POR_VID` | Porta de vidro | Canal para perfil de aluminio — sem copa de dobradica. |

### Gavetas

| Codigo | Descricao | Papel na usinagem |
|--------|-----------|-------------------|
| `GAV_FR` | Gaveta frente | Furacao para puxador (se configurado). Encaixe com laterais. |
| `GAV_LAT` | Gaveta lateral | Encaixe com frente e traseira. Rasgo de fundo para base da gaveta. |
| `GAV_FUN` | Gaveta fundo | Gera rasgo de fundo nas laterais da gaveta. |
| `GAV_TRA` | Gaveta traseira | Encaixe com laterais. |
| `GAV_BASE` | Gaveta base | Fundo da gaveta (se separado do FUN). |

### Elementos decorativos e complementares

| Codigo | Descricao | Papel na usinagem |
|--------|-----------|-------------------|
| `MOL` | Moldura | Chanfro 45 graus nas juncoes entre molduras. |
| `PAI` | Painel (generico) | SEM usinagem — fixacao externa. |
| `CEN` | Cenefas / abas | SEM usinagem — cola ou parafuso. |
| `SUP` | Suporte/reforco | Cavilha nas juncoes (se em contato). |

---

## Regras de reconhecimento

### Por prefixo (recomendado)

O plugin reconhece pelo inicio do nome. Tudo apos o codigo e descricao livre:

```
LAT_ESQ                    ← reconhecido como lateral esquerda
LAT_ESQ mdf branco         ← reconhecido como lateral esquerda
LAT_ESQ#1                  ← reconhecido como lateral esquerda
lat_esq                    ← reconhecido (case-insensitive)
Lateral Esquerda           ← NAO reconhecido (nao segue o padrao)
```

### Nomes alternativos aceitos

Para facilitar, o plugin tambem reconhece variantes comuns:

| Padrao principal | Variantes aceitas |
|------------------|-------------------|
| `LAT_ESQ` | `LATERAL_ESQ`, `LAT_E` |
| `LAT_DIR` | `LATERAL_DIR`, `LAT_D` |
| `TOPO` | `TOP`, `TAMPO_SUP` |
| `BASE` | `BAS`, `FUNDO_EST` |
| `FUN` | `FUNDO`, `TRASEIRO`, `BACK` |
| `PRA` | `PRAT`, `PRATELEIRA` |
| `PRA_REG` | `PRAT_REG`, `PRATELEIRA_REG` |
| `POR` | `PORTA` |
| `DIV_V` | `DIVISOR_V`, `DIV_VERT` |
| `DIV_H` | `DIVISOR_H`, `DIV_HORIZ` |
| `GAV_FR` | `GAVETA_FR`, `GAV_FRENTE` |
| `GAV_LAT` | `GAVETA_LAT`, `GAV_LATERAL` |
| `GAV_FUN` | `GAVETA_FUN`, `GAV_FUNDO` |
| `GAV_TRA` | `GAVETA_TRA`, `GAV_TRASEIRA` |

### Pecas nao reconhecidas

Se o nome nao corresponder a nenhum codigo, o plugin tenta inferir o papel pela posicao e dimensoes:
- Peca vertical alta → provavelmente lateral
- Peca horizontal larga → provavelmente base/topo
- Peca fina e grande → provavelmente fundo

Se nao conseguir inferir, classifica como `UNKNOWN` e aplica regra padrao (cavilha em juncoes butt).

---

## Compatibilidade UPMobb

Para modelos que vem do sistema UPMobb, o plugin tambem reconhece o prefixo `CM_`:

| Codigo UPMobb | Equivalente Ornato |
|---------------|-------------------|
| `CM_BAL` | `ORN_BAL` |
| `CM_AR_AL` | `ORN_ARM` |
| `CM_AR_AE` | `ORN_AER` |
| `CM_LAT_ESQ` | `LAT_ESQ` |
| `CM_LAT_DIR` | `LAT_DIR` |
| `CM_PAI_VER` | `PAI` |
| `CM_PRA` | `PRA` |
| `CM_CHPOR_VER_ESQ` | `POR_ESQ` |
| `CM_CHPOR_VER_DIR` | `POR_DIR` |
| `CM_USI_AV` | (usinagem avulsa — tratado como modulo customizado) |

O plugin detecta automaticamente se o modelo usa nomenclatura Ornato ou UPMobb.
