-- Migração 002: Preços realistas na biblioteca de materiais e ferragens
-- Executar no VPS: sqlite3 /home/ornato/app/server/marcenaria.db < server/migrations/002_precos_biblioteca.sql

-- ── CHAPAS (preço por chapa 2750×1850mm) ──────────────────────────────────
UPDATE biblioteca SET preco = 159.90, fita_preco = 2.50 WHERE cod = 'amad_claro';
UPDATE biblioteca SET preco = 169.90, fita_preco = 2.50 WHERE cod = 'amad_escuro';
UPDATE biblioteca SET preco = 159.90, fita_preco = 2.50 WHERE cod = 'amad_medio';
UPDATE biblioteca SET preco = 159.90, fita_preco = 2.00 WHERE cod = 'branco_tx15';
UPDATE biblioteca SET preco = 179.90, fita_preco = 2.00 WHERE cod = 'branco_ultra';
UPDATE biblioteca SET preco = 229.90, fita_preco = 2.50 WHERE cod = 'laca15';
UPDATE biblioteca SET preco = 189.90, fita_preco = 2.50 WHERE cod = 'personalizado';
UPDATE biblioteca SET preco = 169.90, fita_preco = 2.00 WHERE cod = 'preto_tx';

-- ── ACABAMENTOS (preço por m²) ─────────────────────────────────────────────
UPDATE biblioteca SET preco = 28.90,  preco_m2 = 28.90  WHERE cod = 'bp_branco';
UPDATE biblioteca SET preco = 32.90,  preco_m2 = 32.90  WHERE cod = 'bp_cinza';
UPDATE biblioteca SET preco = 36.90,  preco_m2 = 36.90  WHERE cod = 'bp_nogueira';
UPDATE biblioteca SET preco = 280.00, preco_m2 = 280.00 WHERE cod = 'muxarabi';
UPDATE biblioteca SET preco = 185.00, preco_m2 = 185.00 WHERE cod = 'palhinha';
UPDATE biblioteca SET preco = 98.00,  preco_m2 = 98.00  WHERE cod = 'vidro_espelho';
UPDATE biblioteca SET preco = 78.00,  preco_m2 = 78.00  WHERE cod = 'vidro_incol';
UPDATE biblioteca SET preco = 125.00, preco_m2 = 125.00 WHERE cod = 'vidro_refbronze';
UPDATE biblioteca SET preco = 125.00, preco_m2 = 125.00 WHERE cod = 'vidro_refprata';

-- ── FERRAGENS ─────────────────────────────────────────────────────────────
UPDATE biblioteca SET preco = 24.90 WHERE cod = 'articulador';
UPDATE biblioteca SET preco = 92.90 WHERE cod = 'corrOculta';
UPDATE biblioteca SET preco = 54.90 WHERE cod = 'corrPesada';
UPDATE biblioteca SET preco = 54.90 WHERE cod = 'lixeiraDesliz';
UPDATE biblioteca SET preco = 13.90 WHERE cod = 'perfilLed';
UPDATE biblioteca SET preco = 29.90 WHERE cod = 'puxCava';
UPDATE biblioteca SET preco = 19.90 WHERE cod = 'puxPonto';
UPDATE biblioteca SET preco = 26.90 WHERE cod = 'puxSlim';
UPDATE biblioteca SET preco =  1.90 WHERE cod = 'supPrat';
UPDATE biblioteca SET preco = 18.90 WHERE cod = 'tipOn';
UPDATE biblioteca SET preco = 48.90 WHERE cod = 'trilhoCorrer';

-- ── ACESSÓRIOS ────────────────────────────────────────────────────────────
UPDATE biblioteca SET preco = 92.90 WHERE cod = 'divTalheres';
UPDATE biblioteca SET preco = 27.90 WHERE cod = 'metalon2cm';

SELECT 'OK: ' || COUNT(*) || ' itens com preco > 0' FROM biblioteca WHERE preco > 0;
