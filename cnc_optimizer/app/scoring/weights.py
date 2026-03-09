"""Perfis de pesos configuraveis para scoring de layouts.

Define perfis pre-configurados e permite personalizacao.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Pesos do score
# ---------------------------------------------------------------------------

@dataclass
class ScoreWeights:
    """Pesos para cada componente do score global.

    Todos os pesos devem somar 1.0.
    """
    occupancy: float = 0.30          # Aproveitamento (area util/total)
    sheet_count: float = 0.25        # Numero de chapas (penalidade)
    compactness: float = 0.10        # Compactacao do layout
    travel_distance: float = 0.10    # Deslocamento vazio estimado
    vacuum_support: float = 0.10     # Suporte de vacuo medio
    rotation_quality: float = 0.05   # Qualidade das rotacoes
    remnant_value: float = 0.05      # Valor dos retalhos
    face_selection: float = 0.05     # Numero de flips necessarios

    def validate(self) -> bool:
        """Verificar se os pesos somam ~1.0."""
        total = (self.occupancy + self.sheet_count +
                 self.compactness + self.travel_distance +
                 self.vacuum_support + self.rotation_quality +
                 self.remnant_value + self.face_selection)
        return abs(total - 1.0) < 0.01

    def normalize(self) -> "ScoreWeights":
        """Normalizar pesos para somar 1.0."""
        total = (self.occupancy + self.sheet_count +
                 self.compactness + self.travel_distance +
                 self.vacuum_support + self.rotation_quality +
                 self.remnant_value + self.face_selection)
        if total == 0:
            return ScoreWeights()
        factor = 1.0 / total
        return ScoreWeights(
            occupancy=self.occupancy * factor,
            sheet_count=self.sheet_count * factor,
            compactness=self.compactness * factor,
            travel_distance=self.travel_distance * factor,
            vacuum_support=self.vacuum_support * factor,
            rotation_quality=self.rotation_quality * factor,
            remnant_value=self.remnant_value * factor,
            face_selection=self.face_selection * factor,
        )


# ---------------------------------------------------------------------------
# Perfis pre-configurados
# ---------------------------------------------------------------------------

# Balanceado (padrao) — equilibrio entre todos os fatores
BALANCED = ScoreWeights(
    occupancy=0.30,
    sheet_count=0.25,
    compactness=0.10,
    travel_distance=0.10,
    vacuum_support=0.10,
    rotation_quality=0.05,
    remnant_value=0.05,
    face_selection=0.05,
)

# Maximizar aproveitamento — foco em ocupacao alta
MAXIMIZE_OCCUPANCY = ScoreWeights(
    occupancy=0.45,
    sheet_count=0.25,
    compactness=0.05,
    travel_distance=0.05,
    vacuum_support=0.05,
    rotation_quality=0.05,
    remnant_value=0.05,
    face_selection=0.05,
)

# Minimizar tempo — foco em reducao de deslocamento e trocas
MINIMIZE_TIME = ScoreWeights(
    occupancy=0.15,
    sheet_count=0.20,
    compactness=0.05,
    travel_distance=0.25,
    vacuum_support=0.10,
    rotation_quality=0.05,
    remnant_value=0.05,
    face_selection=0.15,
)

# CNC seguro — foco em estabilidade e vacuo
CNC_SAFE = ScoreWeights(
    occupancy=0.20,
    sheet_count=0.15,
    compactness=0.10,
    travel_distance=0.10,
    vacuum_support=0.25,
    rotation_quality=0.05,
    remnant_value=0.05,
    face_selection=0.10,
)

# Todos os perfis
PROFILES: dict[str, ScoreWeights] = {
    "balanced": BALANCED,
    "maximize_occupancy": MAXIMIZE_OCCUPANCY,
    "minimize_time": MINIMIZE_TIME,
    "cnc_safe": CNC_SAFE,
}


def get_profile(name: str) -> ScoreWeights:
    """Obter perfil de pesos por nome.

    Args:
        name: Nome do perfil (balanced, maximize_occupancy, etc.)

    Returns:
        ScoreWeights configurado

    Raises:
        ValueError: Se o perfil nao existe
    """
    if name not in PROFILES:
        raise ValueError(
            f"Perfil desconhecido: {name}. "
            f"Disponiveis: {list(PROFILES.keys())}"
        )
    return PROFILES[name]
