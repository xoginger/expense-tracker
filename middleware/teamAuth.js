function configuredToken() {
    return process.env.EXPENSE_API_TOKEN || process.env.VIXOR_API_TOKEN || '';
}

function headerToken(req) {
    const direct = req.get('X-Expense-Token') || req.get('X-Vixor-Token') || '';
    const auth = req.get('Authorization') || '';
    const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
    return direct || bearer;
}

function tokenMiddleware(req, res, next) {
    const expected = configuredToken();
    if (!expected) {
        return next();
    }
    if (headerToken(req) === expected) {
        return next();
    }
    return res.status(401).json({ error: 'Token de API inválido' });
}

function agentIdFrom(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    return req.get('X-Agent-Id') || req.query.agent_id || body.agent_id || null;
}

function teamScope(req) {
    const raw = String(req.get('X-Team-Scope') || req.query.team || '');
    return raw === '1' || raw === 'true' || raw === 'gerencia';
}

function canSeeRuta(req, ruta) {
    if (!ruta) return false;
    if (teamScope(req)) return true;
    const agentId = agentIdFrom(req);
    if (!agentId) return true;
    if (!ruta.agent_id) return true;
    return String(ruta.agent_id) === String(agentId);
}

module.exports = {
    configuredToken,
    tokenMiddleware,
    agentIdFrom,
    teamScope,
    canSeeRuta
};
