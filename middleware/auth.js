// middleware/auth.js - Middleware d'authentification JWT
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Vérifier le header Authorization
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Ou cookie (si implémenté)
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Non autorisé - token manquant' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Utilisateur introuvable' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Token invalide ou expiré' });
  }
};

module.exports = { protect };
