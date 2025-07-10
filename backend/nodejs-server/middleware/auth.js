const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { errorResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// Simple in-memory user store (in production, use a proper database)
const users = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@smartmeeting.com',
    password: '$2a$10$K8JX9xz.HZMpQKn8YQsVBOuBvxkwWrBzQKKQKv4sJvmWOYrGOg.9m', // 'admin123'
    role: 'admin'
  },
  {
    id: 2,
    username: 'user',
    email: 'user@smartmeeting.com',
    password: '$2a$10$x3EhXc.4JiJc.KJhQHdRCOmZVl.8xJxZZxKP2KYzQrQKP6KJlZKyK', // 'user123'
    role: 'user'
  }
];

const JWT_SECRET = process.env.JWT_SECRET || 'smart-meeting-room-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

const auth = {
  // Generate JWT token
  generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  },

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  },

  // Hash password
  async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  },

  // Compare password
  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  },

  // Find user by email
  findUserByEmail(email) {
    return users.find(user => user.email === email);
  },

  // Find user by username
  findUserByUsername(username) {
    return users.find(user => user.username === username);
  },

  // Login middleware
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json(errorResponse('Email and password are required'));
      }

      const user = auth.findUserByEmail(email);
      if (!user) {
        logger.logSecurity('LOGIN_FAILED', { email, reason: 'user_not_found' });
        return res.status(401).json(errorResponse('Invalid credentials'));
      }

      const isValidPassword = await auth.comparePassword(password, user.password);
      if (!isValidPassword) {
        logger.logSecurity('LOGIN_FAILED', { email, reason: 'invalid_password' });
        return res.status(401).json(errorResponse('Invalid credentials'));
      }

      const token = auth.generateToken(user);
      
      logger.logUserAction(user.id, 'LOGIN_SUCCESS', { email });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          }
        }
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json(errorResponse('Authentication failed'));
    }
  },

  // Authentication middleware
  authenticate(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(errorResponse('Access token required'));
      }

      const token = authHeader.substring(7);
      const decoded = auth.verifyToken(token);

      if (!decoded) {
        logger.logSecurity('INVALID_TOKEN', { token: token.substring(0, 10) + '...' });
        return res.status(401).json(errorResponse('Invalid or expired token'));
      }

      // Add user info to request
      req.user = decoded;
      next();
    } catch (error) {
      logger.error('Authentication error:', error);
      res.status(401).json(errorResponse('Authentication failed'));
    }
  },

  // Optional authentication (doesn't fail if no token)
  optionalAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = auth.verifyToken(token);
        
        if (decoded) {
          req.user = decoded;
        }
      }
      
      next();
    } catch (error) {
      // Continue without authentication
      next();
    }
  },

  // Authorization middleware
  authorize(roles = []) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json(errorResponse('Authentication required'));
      }

      if (roles.length > 0 && !roles.includes(req.user.role)) {
        logger.logSecurity('UNAUTHORIZED_ACCESS', { 
          user_id: req.user.id, 
          role: req.user.role, 
          required_roles: roles 
        });
        return res.status(403).json(errorResponse('Insufficient permissions'));
      }

      next();
    };
  },

  // Admin only middleware
  adminOnly(req, res, next) {
    return auth.authorize(['admin'])(req, res, next);
  },

  // User or admin middleware
  userOrAdmin(req, res, next) {
    return auth.authorize(['user', 'admin'])(req, res, next);
  },

  // Rate limiting middleware (simple implementation)
  rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const requests = new Map();

    return (req, res, next) => {
      const key = req.ip;
      const now = Date.now();
      
      if (!requests.has(key)) {
        requests.set(key, { count: 1, resetTime: now + windowMs });
        return next();
      }

      const requestData = requests.get(key);
      
      if (now > requestData.resetTime) {
        requests.set(key, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (requestData.count >= maxRequests) {
        logger.logSecurity('RATE_LIMIT_EXCEEDED', { ip: req.ip, count: requestData.count });
        return res.status(429).json(errorResponse('Too many requests. Please try again later.'));
      }

      requestData.count++;
      next();
    };
  },

  // API key authentication (for ESP32 devices)
  apiKeyAuth(req, res, next) {
    try {
      const apiKey = req.headers['x-api-key'];
      
      if (!apiKey) {
        return res.status(401).json(errorResponse('API key required'));
      }

      // Simple API key validation (in production, use proper API key management)
      const validApiKeys = [
        process.env.ESP32_API_KEY || 'esp32-smart-meeting-key-2024'
      ];

      if (!validApiKeys.includes(apiKey)) {
        logger.logSecurity('INVALID_API_KEY', { key: apiKey.substring(0, 10) + '...' });
        return res.status(401).json(errorResponse('Invalid API key'));
      }

      req.apiKey = apiKey;
      next();
    } catch (error) {
      logger.error('API key authentication error:', error);
      res.status(401).json(errorResponse('API key authentication failed'));
    }
  },

  // CORS preflight middleware
  corsMiddleware(req, res, next) {
    res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  },

  // Security headers middleware
  securityHeaders(req, res, next) {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    if (process.env.NODE_ENV === 'production') {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    next();
  },

  // Input sanitization middleware
  sanitizeInput(req, res, next) {
    const sanitize = (obj) => {
      if (typeof obj === 'string') {
        return obj.trim().replace(/[<>]/g, '');
      }
      if (typeof obj === 'object' && obj !== null) {
        const sanitized = {};
        for (const key in obj) {
          sanitized[key] = sanitize(obj[key]);
        }
        return sanitized;
      }
      return obj;
    };

    if (req.body) {
      req.body = sanitize(req.body);
    }
    if (req.query) {
      req.query = sanitize(req.query);
    }
    if (req.params) {
      req.params = sanitize(req.params);
    }

    next();
  },

  // Request logging middleware
  requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        user_agent: req.get('User-Agent')
      };

      if (req.user) {
        logData.user_id = req.user.id;
      }

      if (duration > 5000) {
        logger.warn('Slow request detected', logData);
      } else {
        logger.http('Request completed', logData);
      }
    });

    next();
  }
};

module.exports = auth;