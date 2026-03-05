// routes/auth.js - Routes d'authentification
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Générer un token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @route  POST /api/auth/register
// @desc   Inscription
// @access Public
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Mot de passe: minimum 8 caractères')
      .matches(/\d/)
      .withMessage('Mot de passe: doit contenir au moins un chiffre'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Vérifier si l'email existe déjà
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
      }

      // Créer l'utilisateur
      const user = await User.create({ email, password });

      const token = generateToken(user._id);

      res.status(201).json({
        success: true,
        token,
        user: user.toSafeObject(),
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

// @route  POST /api/auth/login
// @desc   Connexion
// @access Public
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty().withMessage('Mot de passe requis'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
      }

      // Mettre à jour la date de dernière connexion
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      const token = generateToken(user._id);

      res.json({
        success: true,
        token,
        user: user.toSafeObject(),
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

// @route  GET /api/auth/me
// @desc   Récupérer l'utilisateur connecté
// @access Private
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

module.exports = router;
