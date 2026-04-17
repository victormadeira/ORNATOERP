from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics

OUT_PATH = "output/pdf/sistema-novo-app-summary.pdf"

PAGE_W, PAGE_H = letter
MARGIN = 42
CONTENT_W = PAGE_W - 2 * MARGIN

TITLE = "SISTEMA NOVO - App Summary"
SUBTITLE = "Evidence-based snapshot from repository files only"

what_it_is = (
    "MARCENARIA ERP is a web management platform for woodworking/cabinet businesses, "
    "combining commercial, operational, and production workflows in one system. "
    "The repo shows a React frontend + Express API + SQLite core, with optional Python CNC optimization integration."
)

who_for = "Primary persona: marcenaria teams (admin, gerente, vendedor) handling clients, estimates, projects, production, and finance."

features = [
    "Authentication and role-based access (admin/gerente/vendedor) with JWT and protected routes.",
    "CRM and sales flow: clients, estimates (orcamentos), pipeline stages, and dashboard search/metrics.",
    "Project and delivery flow: project stages/occurrences, production orders, expedition, and customer portal links.",
    "Financial operations: accounts payable/receivable, reminders, categories, installments, and audit activity logs.",
    "Inventory/resource management: material library, stock balances, and stock movement tracking tied to projects.",
    "Communication and AI: WhatsApp (Evolution API), inbound/outbound chat handling, and AI assistant via OpenAI/Anthropic.",
    "CNC workflow: import SketchUp/plugin JSON, optimize cutting plans, readiness checks, and generate machine exports/G-code.",
]

architecture = [
    "UI layer: React SPA (`src/App.jsx`, `src/pages/*`) lazy-loads modules and calls `/api/*` through `src/api.js`.",
    "Auth flow: token stored in localStorage (`erp_token`), sent as Bearer token; backend enforces auth/roles via middleware.",
    "API layer: Express server (`server/index.js`) mounts domain routes (`/api/clientes`, `/api/orcamentos`, `/api/financeiro`, `/api/cnc`, etc.).",
    "Data layer: `better-sqlite3` database (`server/marcenaria.db`) with schema, indexes, and seed data in `server/db.js`.",
    "External services: Google Drive OAuth service, WhatsApp Evolution wrapper, and AI provider abstraction in `server/services/*`.",
    "CNC data flow: Frontend -> Express `/api/cnc/*` -> `server/lib/python-bridge.js` -> FastAPI optimizer (`cnc_optimizer/app/main.py`, default port 8000).",
]

run_steps = [
    "Install Node dependencies from repo root: `npm install`.",
    "Start frontend + API together: `npm run dev` (Vite on 5173, API on 3001, from `package.json` + `vite.config.js`).",
    "Open `http://localhost:5173` and sign in with seeded admin (`admin@admin.com` / `admin123`) unless `ADMIN_PASSWORD` is set.",
    "Optional for CNC optimization endpoints: run Python service in `cnc_optimizer/` (install `requirements.txt`, then start `app/main.py` on port 8000).",
    "Required Node.js version: Not found in repo.",
    "Root backend `.env.example` for API integrations: Not found in repo.",
]


def wrap_text(text, font_name, font_size, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if pdfmetrics.stringWidth(trial, font_name, font_size) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_heading(c, text, y):
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN, y, text)
    return y - 15


def draw_paragraph(c, text, y, font_size=9.0, leading=11.2):
    c.setFont("Helvetica", font_size)
    for line in wrap_text(text, "Helvetica", font_size, CONTENT_W):
        c.drawString(MARGIN, y, line)
        y -= leading
    return y - 2


def draw_bullets(c, items, y, font_size=9.0, leading=11.0, bullet_gap=2):
    bullet = "- "
    text_x = MARGIN + 12
    for item in items:
        lines = wrap_text(item, "Helvetica", font_size, CONTENT_W - 12)
        c.setFont("Helvetica", font_size)
        c.drawString(MARGIN, y, bullet)
        c.drawString(text_x, y, lines[0])
        y -= leading
        for line in lines[1:]:
            c.drawString(text_x, y, line)
            y -= leading
        y -= bullet_gap
    return y


def main():
    c = canvas.Canvas(OUT_PATH, pagesize=letter)

    y = PAGE_H - MARGIN

    c.setFont("Helvetica-Bold", 16)
    c.drawString(MARGIN, y, TITLE)
    y -= 18

    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, y, SUBTITLE)
    y -= 16

    c.setLineWidth(0.8)
    c.line(MARGIN, y, PAGE_W - MARGIN, y)
    y -= 14

    y = draw_heading(c, "What It Is", y)
    y = draw_paragraph(c, what_it_is, y)

    y = draw_heading(c, "Who It Is For", y)
    y = draw_paragraph(c, who_for, y)

    y = draw_heading(c, "What It Does", y)
    y = draw_bullets(c, features, y)

    y = draw_heading(c, "How It Works (Architecture)", y)
    y = draw_bullets(c, architecture, y)

    y = draw_heading(c, "How To Run (Minimal)", y)
    y = draw_bullets(c, run_steps, y)

    if y < MARGIN:
        raise RuntimeError(f"Content overflowed the page (y={y:.1f})")

    c.setFont("Helvetica-Oblique", 7.8)
    c.drawRightString(PAGE_W - MARGIN, 20, "Generated from repository evidence on 2026-03-08")

    c.save()
    print(OUT_PATH)


if __name__ == "__main__":
    main()
