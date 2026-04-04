# Funcionalidades Avancadas

## Processamento em lote

O plugin pode processar **todos os modulos** do modelo de uma vez:

```
Menu: Plugins > Ornato CNC > Processar Modelo Inteiro
```

O processamento em lote:
1. Analisa todos os grupos com prefixo ORN_ no modelo
2. Detecta pecas e juncoes em cada modulo
3. Aplica as 14 regras de hardware em sequencia
4. Gera visualizacao 3D de todas as ferragens
5. Executa o SmartAdvisor para sugestoes automaticas
6. Mostra resumo com estatisticas e avisos

---

## Regras de hardware — Lista completa (14 regras)

O motor de regras (`RulesEngine`) aplica 14 regras em sequencia:

| # | Regra | Descricao | Tipo de juncao |
|---|-------|-----------|----------------|
| 1 | HingeRule | Copa de dobradica 35mm + furos piloto | overlay (porta ↔ lateral) |
| 2 | GasPistonRule | Furos para pistao a gas (porta basculante) | overlay (POR_BAS ↔ lateral) |
| 3 | SlidingDoorRule | Canais de trilho sup/inf (porta de correr) | overlay (POR_COR ↔ topo/base) |
| 4 | System32Rule | Serie de furos 5mm a cada 32mm | presenca de PRA_REG no modulo |
| 5 | MinifixRule | Corpo 15mm + eixo 8mm + cavilha intercalada | butt (lateral ↔ base/topo) |
| 6 | ConfirmatRule | Pre-furo 8mm face + 5mm borda (europarafuso) | butt (quando configurado) |
| 7 | DowelRule | Cavilha 8mm em ambos os lados | butt (divisores, ou quando configurado) |
| 8 | HandleRule | Furo(s) passante para puxador | papel da peca (porta/gaveta) |
| 9 | DrawerSlideRule | Furos para fixacao de corrediça | lateral com gaveta adjacente |
| 10 | BackPanelRule | Rasgo de fundo para encaixar painel traseiro | dado (lateral ↔ fundo) |
| 11 | ShelfRule | Furos de cavilha para prateleira fixa | butt (prateleira ↔ lateral) |
| 12 | MiterRule | Chanfro 45 graus (meia-esquadria) | miter (moldura ↔ moldura) |
| 13 | LEDChannelRule | Canal para fita LED embutida | atributo led_channel = true |
| 14 | PassThroughRule | Furo passante para passa-fio | atributo passafio = true |

### Regras por atributo (sem colisao)

As regras 13 e 14 sao ativadas por **atributos na peca**, nao por colisao:

```ruby
# LED Channel
peca.set_attribute('ornato', 'led_channel', 'true')
peca.set_attribute('ornato', 'led_width', '10')      # largura do canal (mm)
peca.set_attribute('ornato', 'led_depth', '8')        # profundidade (mm)
peca.set_attribute('ornato', 'led_position', 'front') # front, rear, center
peca.set_attribute('ornato', 'led_face', 'top')       # top ou bottom

# Passa-fio (suporta multiplos furos)
peca.set_attribute('ornato', 'passafio', 'true')
peca.set_attribute('ornato', 'passafio_diameter', '60')
peca.set_attribute('ornato', 'passafio_x', '200')
peca.set_attribute('ornato', 'passafio_y', '150')
# Segundo furo:
peca.set_attribute('ornato', 'passafio_2_x', '400')
peca.set_attribute('ornato', 'passafio_2_y', '150')
peca.set_attribute('ornato', 'passafio_2_diameter', '35')
```

---

## SmartAdvisor — Inteligencia de sugestao

O SmartAdvisor analisa o modelo processado e gera avisos automaticos:

| Verificacao | Severidade | Descricao |
|-------------|-----------|-----------|
| Peso da porta vs dobradicas | Warning | Calcula peso pela densidade (~720 kg/m3) e recomenda quantidade de dobradicas |
| Porta alta (>2000mm) | Warning | Portas acima de 2m precisam de 4+ dobradicas |
| Vao de prateleira | Info | Prateleiras acima de 800mm de vao podem flexionar |
| Gaveta larga (>600mm) | Info | Gavetas largas precisam de corrediça de carga pesada |
| Peca sem usinagem | Warning | Peca estrutural sem nenhuma operacao (possivel falta de contato) |
| Furo perto da borda (<30mm) | Error | Risco de romper a chapa durante usinagem |
| Pecas duplicadas | Warning | Mesma posicao e dimensoes (sobreposicao) |
| Material inconsistente | Info | Mais de 2 materiais diferentes num modulo |
| Bordas faltando | Info | Peca visivel sem fita de borda definida |
| Profundidade vs espessura | Error | Furo com mais de 85% da espessura (risco de perfurar) |
| Completude do modulo | Warning | Modulo sem 2 laterais ou sem base/topo |

---

## Validacoes avancadas (20 verificacoes)

O validador agora executa 20 verificacoes antes da exportacao:

### Validacoes basicas (1-15)
1. Material atribuido em cada peca
2. Dimensoes validas (>0mm)
3. Espessura suspeita (<6mm e nao e fundo)
4. Furos dentro dos limites da peca
5. Distancia minima furo-borda (10mm)
6. Juncao detectada sem usinagem associada
7. Furacao orfã (dobradica sem porta)
8. Consistencia de fita de borda
9. Material nao mapeado
10. Pecas duplicadas (mesma posicao)
11. Modulo vazio (sem pecas)
12. Furos sobrepostos
13. Geometria nao-retangular
14. Estatisticas gerais
15. Conexao com ERP

### Validacoes avancadas (16-20)
16. **Interferencia entre modulos** — dois moveis se sobrepondo no espaco
17. **Limites de transporte** — peca excede 2750mm (tamanho maximo de chapa)
18. **Borda vs posicao do furo** — borda de 2mm+ pode deslocar furacao
19. **Simetria** — LAT_ESQ e LAT_DIR com dimensoes diferentes
20. **Profundidade vs espessura** — furo >85% da espessura da chapa

---

## Integracao com otimizador de corte

O plugin gera uma lista de corte agrupada por material e envia ao servico do ERP:

```ruby
optimizer = Integration::CutOptimizer.new(config)

# Gerar lista de corte
cut_list = optimizer.generate_cut_list(analysis, machining)
# => { materials: { "MDF_18" => { pieces: [...], total_area_m2: 2.5 } } }

# Enviar para otimizacao
result = optimizer.optimize(cut_list)

# Gerar relatorio
report = optimizer.generate_report(cut_list)
```

A lista de corte inclui:
- Pecas agrupadas por material + espessura
- Area total em m2 por material
- Direcao do veio (grain) por peca
- Se a peca pode ser rotacionada
- Bordas por lado (para calculo de fita)
- Se a peca tem usinagem (para programacao CNC)

---

## Catalogo de materiais

O `MaterialCatalog` gerencia precos e calcula custos:

```ruby
catalog = Catalog::MaterialCatalog.new

# Precos
catalog.sheet_price("MDF_18_BRANCO_TX")  # => 78.0 R$/m2
catalog.edge_price("BOR_2x22_BRANCO_TX") # => 4.80 R$/m

# Custo total do projeto
cost = catalog.calculate_cost(analysis)
# => { sheets: { "MDF_18" => { area_m2: 5.2, cost: 405.60 } },
#      edges: { "BOR_2x22" => { length_m: 12.5, cost: 60.00 } },
#      total: 465.60 }

# Chapas necessarias (estimativa)
catalog.sheets_needed("MDF_18", 5.2) # => 2 chapas
```

Precos sao configuraveis via:
1. Defaults internos (precos de referencia)
2. JSON em `biblioteca/materiais/chapas.json`
3. Override nas configuracoes do plugin

---

## Leitura de Dynamic Components

O plugin le atributos de componentes dinamicos do SketchUp:

```ruby
# Verificar se e um DC
DynamicComponentReader.dynamic_component?(entity) # => true

# Ler todos os atributos
dc_data = DynamicComponentReader.read(entity)
# => { is_dynamic_component: true,
#      dc_name: "Armario Parametrico",
#      dimensions: { length: 800, width: 600, height: 2100 },
#      material: "MDF Branco",
#      custom_attributes: { "num_prateleiras" => "4" },
#      formulas: { "altura_prateleira" => "=({altura}-50)/({num_prateleiras}+1)" } }

# Converter para atributos Ornato
ornato_attrs = DynamicComponentReader.to_ornato_attributes(entity)

# Escanear todos os DCs do modelo
results = DynamicComponentReader.scan_entities(model.active_entities)
```

Atributos de DC sao lidos e usados como fallback:
- Dimensoes do DC → dimensoes da peca (se nao detectadas pela geometria)
- Material do DC → material Ornato (via mapeamento)
- Atributos customizados → acessiveis com prefixo `dc_`
- Atributos Ornato (`ornato.*`) sempre tem prioridade sobre DC
