const User = require('../models/user');
const jwtUtils = require('../utils/jwt');
const bcryptUtils = require('../utils/bcrypt');

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = User.findByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcryptUtils.comparePassword(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = jwtUtils.generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  const refreshToken = jwtUtils.generateRefreshToken({
    id: user.id,
    email: user.email
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
}

async function register(req, res) {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (User.findByEmail(email)) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  const hashedPassword = await bcryptUtils.hashPassword(password);
  const user = User.create({ email, password: hashedPassword, role });

  const accessToken = jwtUtils.generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  const refreshToken = jwtUtils.generateRefreshToken({
    id: user.id,
    email: user.email
  });

  res.status(201).json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  const decoded = jwtUtils.verifyRefreshToken(refreshToken);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const user = User.find(decoded.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newAccessToken = jwtUtils.generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  res.json({ accessToken: newAccessToken });
}

async function protected(ctx, next) {
  const authHeader = ctx.headers['authorization'];
  if (!authHeader) {
    ctx.status = 401;
    ctx.body = { error: 'Authorization header required' };
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    ctx.status = 401;
    ctx.body = { error: 'Invalid authorization format' };
    return;
  }

  const token = parts[1];
  const decoded = jwtUtils.verifyAccessToken(token);
  if (!decoded) {
    ctx.status = 401;
    ctx.body = { error: 'Invalid or expired token' };
    return;
  }

  ctx.state.user = decoded;
  await next();
}

function authorize(...allowedRoles) {
  return (ctx, next) => {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { error: 'Not authenticated' };
      return;
    }

    if (!allowedRoles.includes(ctx.state.user.role)) {
      ctx.status = 403;
      ctx.body = { error: 'Forbidden' };
      return;
    }

    next();
  };
}

module.exports = {
  login,
  register,
  refresh,
  protected,
  authorize
};
