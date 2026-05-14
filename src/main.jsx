import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth';
import './index.css';
import App from './App';
import { installGlobalErrorHandlers } from './lib/errorReporter';

// Dev safety: limpa SW antigo + caches em localhost. Em produção o guard do
// index.html já impede registro novo, mas pode haver SW antigo persistido em
// devs que abriram o app antes do fix. Roda de forma assíncrona; o React pode
// montar enquanto a limpeza acontece.
if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
            .then(regs => Promise.all(regs.map(reg => reg.unregister())))
            .catch(() => {});
    }
    if (window.caches?.keys) {
        caches.keys()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .catch(() => {});
    }
}

// Instala listeners globais de erro ANTES de montar — pega erros de init também
installGlobalErrorHandlers();

// ── Páginas públicas lazy (cada rota puxa só seu próprio chunk) ──
// Antes eram import eager → inflavam o main chunk em ~2MB (three.js + pages)
const ProposalPublic        = lazy(() => import('./pages/ProposalPublic'));
const ProposalLanding       = lazy(() => import('./pages/ProposalLanding'));
const PortalCliente         = lazy(() => import('./pages/PortalCliente'));
const PortalClienteV2       = lazy(() => import('./pages/PortalClienteV2'));
const MontadorUpload        = lazy(() => import('./pages/MontadorUpload'));
const LandingPageV2         = lazy(() => import('./pages/LandingPageV2'));
const PropostaApresentacao  = lazy(() => import('./pages/PropostaApresentacao'));
const AssinaturaPublic      = lazy(() => import('./pages/AssinaturaPublic'));
const VerificacaoAssinatura = lazy(() => import('./pages/VerificacaoAssinatura'));
const ScanPeca3D            = lazy(() => import('./pages/ScanPeca3D'));
const ProducaoCNCTV         = lazy(() => import('./pages/ProducaoCNCTV'));
const ModoOperador          = lazy(() => import('./pages/ModoOperador'));
const PortfolioPublico      = lazy(() => import('./pages/PortfolioPublico'));

// Fallback leve — só um wrapper centralizado com spinner CSS
const PublicFallback = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg-app, #0b0e13)',
    }}>
        <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2.5px solid rgba(19,121,240,0.15)',
            borderTopColor: 'var(--primary, #1379F0)',
            animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

// Detectar acesso público via query params OU path
const params = new URLSearchParams(window.location.search);
const path = window.location.pathname;

// Suporta: /apresentacao/TOKEN
const apresentacaoToken = (path.match(/^\/apresentacao\/([a-f0-9]+)$/i) || [])[1] || null;

// Preview interno (sem tracking): /preview/proposta/TOKEN
const previewPropostaToken = (path.match(/^\/preview\/proposta\/([a-f0-9]+)$/i) || [])[1] || null;

// Preview interno (sem notificações): /preview/portal/TOKEN
const previewPortalToken = (path.match(/^\/preview\/portal\/([a-f0-9]+)$/i) || [])[1] || null;

// Landing page da proposta: /lp/TOKEN (experiência completa)
const lpToken = (path.match(/^\/lp\/([a-f0-9]+)$/i) || [])[1] || null;

// Suporta: ?proposta=TOKEN ou /proposta/TOKEN
const proposalToken = params.get('proposta')
    || (path.match(/^\/proposta\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Suporta: ?portal=TOKEN ou /portal/TOKEN
const portalToken = params.get('portal')
    || (path.match(/^\/portal\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Portal v2 (experimento — link paralelo): /portal-v2/TOKEN
const portalV2Token = (path.match(/^\/portal-v2\/([a-f0-9]+)$/i) || [])[1] || null;

// Suporta: ?montador=TOKEN ou /montador/TOKEN
const montadorToken = params.get('montador')
    || (path.match(/^\/montador\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Assinatura eletrônica: /assinar/TOKEN
const assinaturaToken = (path.match(/^\/assinar\/([a-f0-9]+)$/i) || [])[1] || null;

// Verificação de assinatura: /verificar/CODIGO
const verificacaoCodigo = (path.match(/^\/verificar\/([A-Z0-9]+)$/i) || [])[1] || null;

// Scan peça 3D: /scan/CODIGO ou /scan
const scanCodigo = (path.match(/^\/scan\/(.+)$/i) || [])[1] || null;
const isScanPage = path === '/scan' || path === '/scan/';

// Preview peça pública: /p/ID
const pecaPublicId = (path.match(/^\/p\/(\d+)$/i) || [])[1] || null;

// Landing pública (Studio Ornato — móveis planejados)
// Raiz é a landing pública. Aliases antigos mantidos pra não quebrar links em anúncios.
const isLandingV2 = [
    '/', '',
    '/contato', '/contato/',
    '/landing', '/landing/',
    '/landingpage', '/landingpage/',
    '/lp2', '/lp2/',
].includes(path);

// Portfolio público — lookbook de projetos realizados
const isPortfolio = ['/portfolioornato', '/portfolioornato/'].includes(path);

// TV Corte CNC: /tv-corte
const isTVCorte = path === '/tv-corte' || path === '/tv-corte/';

// Modo Operador CNC: /operador-cnc
const isOperadorCNC = path === '/operador-cnc' || path === '/operador-cnc/';

// Renderiza com Suspense — rota pública carrega só o que usa.
// O App (área logada) é eager pra não atrapalhar o login.
function renderRoute() {
    if (isOperadorCNC)          return <ModoOperador onBack={() => window.history.back()} />;
    if (isTVCorte)              return <ProducaoCNCTV />;
    if (pecaPublicId)           return <ScanPeca3D codigo={pecaPublicId} />;
    if (scanCodigo || isScanPage) return <ScanPeca3D codigo={scanCodigo} />;
    // Tokens públicos antes da landing: links com ?portal=/?proposta=/?montador= chegam com path='/'
    // e precisam ser interceptados antes do match de isLandingV2.
    if (apresentacaoToken)      return <PropostaApresentacao token={apresentacaoToken} />;
    if (lpToken)                return <ProposalLanding token={lpToken} />;
    if (previewPropostaToken)   return <ProposalPublic token={previewPropostaToken} isPreview />;
    if (previewPortalToken)     return <PortalClienteV2 token={previewPortalToken} />;
    if (proposalToken)          return <ProposalPublic token={proposalToken} />;
    // Portal v2 (oficial). /portal-v2/TOKEN mantido como alias durante transição.
    if (portalV2Token)          return <PortalClienteV2 token={portalV2Token} />;
    if (portalToken)            return <PortalClienteV2 token={portalToken} />;
    if (montadorToken)          return <MontadorUpload token={montadorToken} />;
    if (assinaturaToken)        return <AssinaturaPublic token={assinaturaToken} />;
    if (verificacaoCodigo)      return <VerificacaoAssinatura codigo={verificacaoCodigo} />;
    if (isLandingV2)            return <LandingPageV2 />;
    if (isPortfolio)            return <PortfolioPublico />;
    return null; // → cai no App logado (/app, /clientes, /orcs, etc.)
}

const publicRoute = renderRoute();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {publicRoute ? (
            <Suspense fallback={<PublicFallback />}>
                {publicRoute}
            </Suspense>
        ) : (
            <AuthProvider>
                <App />
            </AuthProvider>
        )}
    </React.StrictMode>
);
