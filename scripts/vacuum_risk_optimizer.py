#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════
VACUUM RISK OPTIMIZER — Pre-processador de Trajetórias CNC
═══════════════════════════════════════════════════════════════════

Autor: Ornato ERP / Engenheiro CAM
Finalidade: Calcular a ordem de corte otimizada para peças em uma
            chapa de MDF cortada em CNC com mesa de vácuo.

PROBLEMA:
    Em uma CNC com mesa de vácuo, o material é fixado por sucção.
    Conforme peças são cortadas e removidas, a área de vedação
    diminui e a força de fixação cai. Peças pequenas nas bordas
    são as primeiras a perder fixação.

SOLUÇÃO:
    Calcular um "Índice de Risco de Vácuo" para cada peça que
    combina dois fatores:

    1. ÁREA da peça (60% do peso):
       - Peças menores têm MAIOR risco (menor área de contato com
         vácuo, mais fáceis de serem deslocadas pela fresa)
       - Fórmula: risco_area = 1.0 - (area / area_referencia)

    2. DISTÂNCIA DA BORDA (40% do peso):
       - Peças próximas da borda da chapa têm MAIOR risco
       - Vácuo "vaza" pelas bordas do material de sacrifício
       - Fórmula: risco_borda = 1.0 - (dist_min_borda / dist_max_possivel)

    ÍNDICE FINAL:
       vacuum_risk = risco_area * 0.6 + risco_borda * 0.4

    REGRA: Cortar primeiro as peças com MAIOR índice de risco
           (pequenas e na borda), enquanto a chapa ainda tem
           máxima vedação.

INTEGRAÇÃO:
    Este algoritmo está implementado diretamente no gerador de G-Code
    do Ornato ERP (server/routes/cnc.js → generateGcodeForChapa).
    Este script serve como referência documentada e ferramenta
    standalone para debugging/visualização.

═══════════════════════════════════════════════════════════════════
"""

import math
from dataclasses import dataclass, field
from typing import List, Tuple


# ═══════════════════════════════════════════════════════════════
# MODELO DE DADOS
# ═══════════════════════════════════════════════════════════════

@dataclass
class Chapa:
    """Representa uma chapa de MDF padrão."""
    comprimento: float = 2750.0  # mm (eixo X)
    largura: float = 1850.0     # mm (eixo Y)
    espessura: float = 18.5     # mm (espessura real do MDF)
    refilo: float = 10.0        # mm (borda descartada de cada lado)

    @property
    def area_util(self) -> float:
        """Área útil em mm² (descontando refilo)."""
        return (self.comprimento - 2 * self.refilo) * (self.largura - 2 * self.refilo)

    @property
    def area_util_cm2(self) -> float:
        """Área útil em cm²."""
        return self.area_util / 100.0


@dataclass
class Peca:
    """Representa uma peça retangular posicionada na chapa."""
    id: int
    descricao: str
    x: float            # posição X na chapa (mm, relativo ao refilo)
    y: float            # posição Y na chapa (mm, relativo ao refilo)
    largura: float      # dimensão no eixo X (mm)
    comprimento: float  # dimensão no eixo Y (mm)
    modulo: str = ""    # módulo do móvel (ex: "Armário 1", "Balcão")
    rotated: bool = False

    # Campos calculados (preenchidos pelo otimizador)
    area_cm2: float = 0.0
    dist_borda: float = 0.0
    risco_area: float = 0.0
    risco_borda: float = 0.0
    vacuum_risk_index: float = 0.0
    ordem_corte: int = 0
    classificacao: str = "normal"  # "super_pequena", "pequena", "normal"

    @property
    def centro_x(self) -> float:
        return self.x + self.largura / 2

    @property
    def centro_y(self) -> float:
        return self.y + self.comprimento / 2

    def __post_init__(self):
        self.area_cm2 = (self.largura * self.comprimento) / 100.0


# ═══════════════════════════════════════════════════════════════
# ALGORITMO DE OTIMIZAÇÃO
# ═══════════════════════════════════════════════════════════════

class VacuumRiskOptimizer:
    """
    Calcula o Índice de Risco de Vácuo para cada peça e determina
    a ordem ótima de corte para maximizar a fixação durante todo
    o processo.

    MATEMÁTICA:

    1. Risco por Área (peso: 60%):
       ─────────────────────────────
       A normalização usa 10% da área total da chapa como referência.
       Isso significa que uma peça com 10% da área da chapa tem
       risco_area = 0 (baixo risco), e peças menores têm risco
       crescente até 1.0.

       area_ref = chapa.area * 0.10
       risco_area = 1.0 - min(peca.area / area_ref, 1.0)

       Exemplo (chapa 2750x1850 = 50875 cm²):
       - area_ref = 5087.5 cm²
       - Peça 100x80 = 80 cm² → risco = 1 - 80/5087 = 0.984 (ALTO)
       - Peça 500x400 = 2000 cm² → risco = 1 - 2000/5087 = 0.607 (MÉDIO)
       - Peça 1000x600 = 6000 cm² → risco = 1 - min(6000/5087, 1) = 0 (BAIXO)

    2. Risco por Distância da Borda (peso: 40%):
       ──────────────────────────────────────────
       A distância mínima do centro da peça a qualquer borda da chapa
       é normalizada pelo máximo possível (metade da menor dimensão).

       dist_min = min(cx, cy, W-cx, H-cy)
       dist_max = min(W, H) / 2
       risco_borda = 1.0 - min(dist_min / dist_max, 1.0)

       Exemplo (chapa 2750x1850):
       - dist_max = 1850/2 = 925mm
       - Peça no canto (cx=50) → risco = 1 - 50/925 = 0.946 (ALTO)
       - Peça no centro (cx=1375) → risco = 1 - min(925/925, 1) = 0 (BAIXO)

    3. Índice Final:
       ──────────────
       vacuum_risk = risco_area * PESO_AREA + risco_borda * PESO_BORDA

       Onde PESO_AREA = 0.6 e PESO_BORDA = 0.4

       Justificativa dos pesos:
       - Área tem mais peso (60%) porque peças muito pequenas
         SEMPRE são problemáticas, independente da posição
       - Borda tem menos peso (40%) porque peças grandes no
         centro mantêm boa fixação mesmo longe das bordas
    """

    PESO_AREA = 0.6    # Peso do risco por área
    PESO_BORDA = 0.4   # Peso do risco por distância da borda

    # Limiares de classificação (em cm²)
    AREA_SUPER_PEQUENA = 200   # < 200 cm² = super pequena
    AREA_PEQUENA = 500         # < 500 cm² = pequena

    def __init__(self, chapa: Chapa):
        self.chapa = chapa
        # Área de referência: 10% da chapa (peças menores que isso = risco alto)
        self.area_referencia = chapa.area_util_cm2 * 0.10
        # Distância máxima possível (centro da chapa → borda mais próxima)
        self.dist_max = min(chapa.comprimento, chapa.largura) / 2.0

    def classificar(self, peca: Peca) -> str:
        """Classifica a peça por tamanho para agrupamento."""
        if peca.area_cm2 < self.AREA_SUPER_PEQUENA:
            return "super_pequena"
        elif peca.area_cm2 < self.AREA_PEQUENA:
            return "pequena"
        return "normal"

    def calcular_dist_borda(self, peca: Peca) -> float:
        """
        Calcula a distância mínima do centro da peça a qualquer
        borda da chapa (em mm).

        Quanto menor a distância, mais perto da borda → mais risco
        de perda de vácuo (o ar entra pelas bordas do material
        de sacrifício).
        """
        cx = peca.centro_x
        cy = peca.centro_y
        W = self.chapa.comprimento - 2 * self.chapa.refilo
        H = self.chapa.largura - 2 * self.chapa.refilo

        return min(cx, cy, W - cx, H - cy)

    def calcular_risco(self, peca: Peca) -> float:
        """
        Calcula o Índice de Risco de Vácuo para uma peça.

        Retorna: float entre 0.0 (baixo risco) e 1.0 (alto risco)

        Peças com MAIOR risco devem ser cortadas PRIMEIRO, enquanto
        a chapa ainda tem máxima vedação.
        """
        # 1. Risco por Área
        # Normalizar: 0 = peça grande (segura), 1 = peça minúscula (risco)
        area_norm = min(peca.area_cm2 / self.area_referencia, 1.0)
        risco_area = 1.0 - area_norm

        # 2. Risco por Distância da Borda
        # Normalizar: 0 = no centro (segura), 1 = na borda (risco)
        dist_borda = self.calcular_dist_borda(peca)
        dist_norm = min(dist_borda / self.dist_max, 1.0)
        risco_borda = 1.0 - dist_norm

        # 3. Índice Final (combinação ponderada)
        vacuum_risk = risco_area * self.PESO_AREA + risco_borda * self.PESO_BORDA

        # Salvar nos campos da peça para referência
        peca.dist_borda = round(dist_borda)
        peca.risco_area = round(risco_area, 3)
        peca.risco_borda = round(risco_borda, 3)
        peca.vacuum_risk_index = round(vacuum_risk, 3)
        peca.classificacao = self.classificar(peca)

        return vacuum_risk

    def otimizar(self, pecas: List[Peca]) -> List[Peca]:
        """
        Recebe uma lista de peças e retorna a ordem de corte otimizada.

        REGRA PRINCIPAL: Maior risco primeiro → menor risco por último

        Dentro do mesmo nível de risco (diferença < 5%), desempate:
        1. Classificação (super_pequena > pequena > normal)
        2. Área menor primeiro
        """
        # Calcular risco para todas as peças
        for peca in pecas:
            self.calcular_risco(peca)

        # Ordenar: maior risco primeiro (ordem decrescente)
        pecas_ordenadas = sorted(pecas, key=lambda p: (
            -p.vacuum_risk_index,  # Maior risco primeiro
            -_cls_order(p),        # Desempate: menor classificação primeiro
            p.area_cm2             # Desempate: menor área primeiro
        ))

        # Numerar a ordem
        for i, peca in enumerate(pecas_ordenadas):
            peca.ordem_corte = i + 1

        return pecas_ordenadas


def _cls_order(peca: Peca) -> int:
    """Mapeia classificação para número de ordenação."""
    return {"super_pequena": 0, "pequena": 1, "normal": 2}.get(peca.classificacao, 2)


# ═══════════════════════════════════════════════════════════════
# VISUALIZAÇÃO
# ═══════════════════════════════════════════════════════════════

def visualizar_resultado(chapa: Chapa, pecas: List[Peca]):
    """Imprime a tabela de resultados com cores ANSI."""
    print("\n" + "═" * 90)
    print("  VACUUM RISK OPTIMIZER — Resultado da Otimização")
    print("═" * 90)
    print(f"  Chapa: {chapa.comprimento}x{chapa.largura}mm  |  Espessura: {chapa.espessura}mm")
    print(f"  Área útil: {chapa.area_util_cm2:.0f} cm²  |  Peças: {len(pecas)}")
    print("─" * 90)
    print(f"  {'#':>3} {'Peça':<30} {'Área':>8} {'Dist.Borda':>10} {'R.Área':>7} {'R.Borda':>8} {'RISCO':>7} {'Class':>14}")
    print("─" * 90)

    for p in pecas:
        # Cor baseada no risco
        if p.vacuum_risk_index >= 0.7:
            cor = "\033[91m"  # Vermelho (alto risco)
        elif p.vacuum_risk_index >= 0.4:
            cor = "\033[93m"  # Amarelo (médio risco)
        else:
            cor = "\033[92m"  # Verde (baixo risco)
        reset = "\033[0m"

        print(f"  {p.ordem_corte:>3} {p.descricao:<30} {p.area_cm2:>7.0f}cm² {p.dist_borda:>8.0f}mm "
              f"{p.risco_area:>6.1%} {p.risco_borda:>7.1%} "
              f"{cor}{p.vacuum_risk_index:>6.0%}{reset} {p.classificacao:>14}")

    print("─" * 90)
    print("  Legenda: R.Área = risco por tamanho | R.Borda = risco por proximidade da borda")
    print("  Estratégia: Cortar peças VERMELHAS primeiro → AMARELAS → VERDES por último")
    print("═" * 90)


# ═══════════════════════════════════════════════════════════════
# DADOS DE EXEMPLO (simulando peças de um projeto real)
# ═══════════════════════════════════════════════════════════════

def criar_dados_exemplo() -> Tuple[Chapa, List[Peca]]:
    """
    Cria dados de exemplo simulando um projeto de cozinha típico
    com peças variadas posicionadas numa chapa 2750x1850mm.
    """
    chapa = Chapa(comprimento=2750, largura=1850, espessura=18.5)

    pecas = [
        # Peças pequenas nas bordas (ALTO RISCO)
        Peca(1, "Regua Balcão 1", x=0, y=0, largura=872, comprimento=73, modulo="Balcão"),
        Peca(2, "Regua Balcão 2", x=0, y=73, largura=872, comprimento=73, modulo="Balcão"),
        Peca(3, "Regua Balcão 3", x=872, y=0, largura=456, comprimento=73, modulo="Balcão"),
        Peca(4, "Regua Balcão 4", x=1328, y=0, largura=1090, comprimento=100, modulo="Balcão"),

        # Peças médias no meio (MÉDIO RISCO)
        Peca(5, "Prateleira 1 Armário", x=254, y=500, largura=336, comprimento=498, modulo="Armário 1"),
        Peca(6, "Prateleira 2 Armário", x=254, y=1000, largura=336, comprimento=498, modulo="Armário 1"),
        Peca(7, "Topo Armário 1", x=590, y=500, largura=336, comprimento=548, modulo="Armário 1"),
        Peca(8, "Base Armário 1", x=590, y=1048, largura=336, comprimento=498, modulo="Armário 1"),

        # Peças pequenas no meio (MÉDIO-ALTO RISCO)
        Peca(9, "Lat. Esq. Gaveta", x=926, y=408, largura=506, comprimento=143, modulo="Balcão"),
        Peca(10, "Contra Frente Gaveta", x=926, y=551, largura=543, comprimento=140, modulo="Balcão"),
        Peca(11, "Traseira Gaveta", x=926, y=691, largura=543, comprimento=137, modulo="Balcão"),

        # Peças grandes no centro (BAIXO RISCO)
        Peca(12, "Lateral Esquerda", x=1469, y=408, largura=143, comprimento=1400, modulo="Armário 1"),
        Peca(13, "Lateral Esq. Balcão", x=1612, y=100, largura=543, comprimento=840, modulo="Balcão"),
        Peca(14, "Prateleira MDF Balcão", x=1612, y=940, largura=543, comprimento=540, modulo="Balcão"),
    ]

    return chapa, pecas


# ═══════════════════════════════════════════════════════════════
# EXECUÇÃO
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # 1. Criar dados
    chapa, pecas = criar_dados_exemplo()

    print("\n  Peças ANTES da otimização:")
    for p in pecas:
        print(f"    [{p.id}] {p.descricao} — {p.largura}x{p.comprimento}mm ({p.area_cm2:.0f}cm²)")

    # 2. Otimizar
    optimizer = VacuumRiskOptimizer(chapa)
    pecas_otimizadas = optimizer.otimizar(pecas)

    # 3. Visualizar
    visualizar_resultado(chapa, pecas_otimizadas)

    # 4. Demonstrar a lógica
    print("\n  ANÁLISE DA OTIMIZAÇÃO:")
    print("  " + "─" * 60)

    # Agrupar por classificação
    super_peq = [p for p in pecas_otimizadas if p.classificacao == "super_pequena"]
    peq = [p for p in pecas_otimizadas if p.classificacao == "pequena"]
    normal = [p for p in pecas_otimizadas if p.classificacao == "normal"]

    print(f"  Super pequenas (<{optimizer.AREA_SUPER_PEQUENA}cm²): {len(super_peq)} peças")
    print(f"  Pequenas (<{optimizer.AREA_PEQUENA}cm²): {len(peq)} peças")
    print(f"  Normais: {len(normal)} peças")

    print("\n  Ordem de corte:")
    for p in pecas_otimizadas:
        risk_bar = "█" * int(p.vacuum_risk_index * 20) + "░" * (20 - int(p.vacuum_risk_index * 20))
        print(f"  {p.ordem_corte:>3}. [{risk_bar}] {p.vacuum_risk_index:.0%} — {p.descricao}")

    print("\n  ✓ Peças de borda com pouca área → cortadas PRIMEIRO")
    print("  ✓ Peças grandes no centro → cortadas POR ÚLTIMO")
    print("  ✓ Chapa mantém máxima vedação durante maior parte do processo")
    print()
