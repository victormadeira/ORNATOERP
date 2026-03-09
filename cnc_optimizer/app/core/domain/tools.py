"""Magazine de ferramentas CNC.

Gerencia o catalogo de ferramentas disponiveis na maquina CNC,
faz matching entre tool_code do worker e ferramenta real.
"""

from __future__ import annotations

from typing import Optional

from app.core.domain.models import MachineTool


# ---------------------------------------------------------------------------
# Catalogo padrao de ferramentas (CNC Ornato)
# ---------------------------------------------------------------------------

DEFAULT_TOOL_MAGAZINE: list[dict] = [
    {
        "code": "T01",
        "name": "Fresa 6mm compressao",
        "type": "fresa_compressao",
        "diameter": 6,
        "doc": 5,
        "rpm": 18000,
        "cut_speed": 5000,
        "tool_code": "contour",
        "tool_number": 1,
    },
    {
        "code": "T02",
        "name": "Broca 5mm (System 32)",
        "type": "broca",
        "diameter": 5,
        "doc": None,
        "rpm": 12000,
        "cut_speed": 3000,
        "tool_code": "f_5mm_twister243",
        "tool_number": 2,
    },
    {
        "code": "T03",
        "name": "Broca 8mm cavilha",
        "type": "broca",
        "diameter": 8,
        "doc": None,
        "rpm": 10000,
        "cut_speed": 3000,
        "tool_code": "f_8mm_cavilha",
        "tool_number": 3,
    },
    {
        "code": "T04",
        "name": "Forstner 15mm minifix",
        "type": "forstner",
        "diameter": 15,
        "doc": None,
        "rpm": 8000,
        "cut_speed": 2000,
        "tool_code": "f_15mm_tambor_min",
        "tool_number": 4,
    },
    {
        "code": "T05",
        "name": "Forstner 35mm dobradica",
        "type": "forstner",
        "diameter": 35,
        "doc": None,
        "rpm": 4000,
        "cut_speed": 1500,
        "tool_code": "f_35mm_dob",
        "tool_number": 5,
    },
    {
        "code": "T06",
        "name": "Broca 8mm eixo minifix",
        "type": "broca",
        "diameter": 8,
        "doc": None,
        "rpm": 10000,
        "cut_speed": 3000,
        "tool_code": "f_8mm_eixo_tambor_min",
        "tool_number": 6,
    },
    {
        "code": "T07",
        "name": "Broca 3mm",
        "type": "broca",
        "diameter": 3,
        "doc": None,
        "rpm": 15000,
        "cut_speed": 3500,
        "tool_code": "f_3mm",
        "tool_number": 7,
    },
    {
        "code": "T08",
        "name": "Fresa rasgo fundo",
        "type": "fresa_reta",
        "diameter": 6,
        "doc": 3,
        "rpm": 18000,
        "cut_speed": 4000,
        "tool_code": "r_f",
        "tool_number": 8,
    },
    {
        "code": "T09",
        "name": "Pocket 3mm",
        "type": "fresa_reta",
        "diameter": 3,
        "doc": 2,
        "rpm": 18000,
        "cut_speed": 3000,
        "tool_code": "p_3mm",
        "tool_number": 9,
    },
    {
        "code": "T10",
        "name": "Pocket 8mm cavilha",
        "type": "fresa_reta",
        "diameter": 8,
        "doc": 3,
        "rpm": 15000,
        "cut_speed": 3500,
        "tool_code": "p_8mm_cavilha",
        "tool_number": 10,
    },
]


def get_default_magazine() -> list[MachineTool]:
    """Obter magazine padrao de ferramentas como lista de MachineTool."""
    return [
        MachineTool(**tool_data)
        for tool_data in DEFAULT_TOOL_MAGAZINE
    ]


# ---------------------------------------------------------------------------
# Matching de ferramentas
# ---------------------------------------------------------------------------

class ToolMagazine:
    """Magazine de ferramentas com busca por tool_code.

    Permite matching entre o tool_code do worker (JSON SketchUp)
    e a ferramenta real no magazine da maquina.
    """

    def __init__(self, tools: list[MachineTool] | None = None):
        """Inicializar com lista de ferramentas.

        Args:
            tools: Lista de ferramentas. None = magazine padrao.
        """
        self._tools = tools or get_default_magazine()
        self._by_code: dict[str, MachineTool] = {}
        self._by_tool_code: dict[str, MachineTool] = {}
        self._by_diameter: dict[float, list[MachineTool]] = {}
        self._rebuild_index()

    def _rebuild_index(self):
        """Reconstruir indices de busca."""
        self._by_code.clear()
        self._by_tool_code.clear()
        self._by_diameter.clear()

        for tool in self._tools:
            if tool.code:
                self._by_code[tool.code.upper()] = tool
            if tool.tool_code:
                self._by_tool_code[tool.tool_code.lower()] = tool
            if tool.diameter > 0:
                if tool.diameter not in self._by_diameter:
                    self._by_diameter[tool.diameter] = []
                self._by_diameter[tool.diameter].append(tool)

    @property
    def tools(self) -> list[MachineTool]:
        """Todas as ferramentas do magazine."""
        return list(self._tools)

    @property
    def count(self) -> int:
        """Numero de ferramentas."""
        return len(self._tools)

    def find_by_code(self, code: str) -> Optional[MachineTool]:
        """Buscar ferramenta pelo codigo (T01, T02, ...).

        Args:
            code: Codigo da ferramenta (ex: "T01")

        Returns:
            MachineTool ou None
        """
        return self._by_code.get(code.upper())

    def find_by_tool_code(self, tool_code: str) -> Optional[MachineTool]:
        """Buscar ferramenta pelo tool_code do worker.

        Este e o matching principal: o JSON do SketchUp exporta
        tool_code como "f_15mm_tambor_min" e queremos encontrar
        a ferramenta correspondente no magazine.

        Args:
            tool_code: Codigo da ferramenta no worker

        Returns:
            MachineTool ou None
        """
        return self._by_tool_code.get(tool_code.lower())

    def find_by_diameter(self, diameter: float) -> list[MachineTool]:
        """Buscar ferramentas por diametro.

        Args:
            diameter: Diametro em mm

        Returns:
            Lista de ferramentas com esse diametro
        """
        return self._by_diameter.get(diameter, [])

    def find_best_match(self, tool_code: str, diameter: float = 0) -> Optional[MachineTool]:
        """Buscar melhor ferramenta usando tool_code e/ou diametro.

        Prioridade:
        1. Match exato por tool_code
        2. Match por diametro (primeira ferramenta)
        3. None

        Args:
            tool_code: Codigo da ferramenta
            diameter: Diametro em mm (fallback)

        Returns:
            Melhor match ou None
        """
        # 1. Tool code exato
        tool = self.find_by_tool_code(tool_code)
        if tool:
            return tool

        # 2. Diametro
        if diameter > 0:
            by_diam = self.find_by_diameter(diameter)
            if by_diam:
                return by_diam[0]

        return None

    def get_contour_tool(self) -> Optional[MachineTool]:
        """Obter ferramenta de contorno (fresa de corte principal).

        Geralmente e uma fresa de compressao de 6mm (T01).
        """
        # Buscar por tool_code "contour"
        tool = self.find_by_tool_code("contour")
        if tool:
            return tool

        # Fallback: primeira fresa
        for t in self._tools:
            if "fresa" in t.type:
                return t

        return self._tools[0] if self._tools else None

    def add_tool(self, tool: MachineTool) -> None:
        """Adicionar ferramenta ao magazine."""
        self._tools.append(tool)
        self._rebuild_index()

    def tool_codes(self) -> list[str]:
        """Listar todos os tool_codes disponiveis."""
        return [t.tool_code for t in self._tools if t.tool_code]
