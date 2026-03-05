// models/User.js - Modèle utilisateur
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Format email invalide'],
  },
  password: {
    type: String,
    required: [true, 'Mot de passe requis'],
    minlength: [8, 'Minimum 8 caractères'],
    select: false, // Ne pas retourner par défaut dans les queries
  },
  plan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free',
  },
  botsLimit: {
    type: Number,
    default: 3, // Limite gratuit
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
  isVerified: {
    type: Boolean,
    default: true, // Simplifié: pas d'email de vérification pour l'instant
  },
});

// Hash du mot de passe avant sauvegarde
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode pour comparer les mots de passe
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Méthode pour retourner l'utilisateur sans données sensibles
UserSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    email: this.email,
    plan: this.plan,
    botsLimit: this.botsLimit,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', UserSchema);
