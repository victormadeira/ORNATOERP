import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth';
import './index.css';
import App from './App';
import ProposalPublic from './pages/ProposalPublic';
import PortalCliente from './pages/PortalCliente';
import MontadorUpload from './pages/MontadorUpload';
import LandingPage from './pages/LandingPage';

// Detectar acesso público via query params OU path
const params = new URLSearchParams(window.location.search);
const path = window.location.pathname;

// Suporta: ?proposta=TOKEN ou /proposta/TOKEN
const proposalToken = params.get('proposta')
    || (path.match(/^\/proposta\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Suporta: ?portal=TOKEN ou /portal/TOKEN
const portalToken = params.get('portal')
    || (path.match(/^\/portal\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Suporta: ?montador=TOKEN ou /montador/TOKEN
const montadorToken = params.get('montador')
    || (path.match(/^\/montador\/([a-f0-9]+)$/i) || [])[1]
    || null;

// Landing page pública: /contato ou /landing
const isLanding = path === '/contato' || path === '/landing';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {isLanding ? (
            <LandingPage />
        ) : proposalToken ? (
            <ProposalPublic token={proposalToken} />
        ) : portalToken ? (
            <PortalCliente token={portalToken} />
        ) : montadorToken ? (
            <MontadorUpload token={montadorToken} />
        ) : (
            <AuthProvider>
                <App />
            </AuthProvider>
        )}
    </React.StrictMode>
);
