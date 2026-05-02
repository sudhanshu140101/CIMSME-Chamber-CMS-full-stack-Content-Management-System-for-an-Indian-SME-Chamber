const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;


if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET not configured properly (must be 32+ characters)');
  process.exit(1);
}


let redis = null;
if (process.env.REDIS_HOST && process.env.NODE_ENV === 'production') {
  try {
    const Redis = require('ioredis');
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 attempts');
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
      }
    });
    
    redis.on('connect', () => {
      console.log('Redis session storage connected');
    });
    
    redis.on('error', (err) => {
      console.error('Redis error:', err.message);
      redis = null; 
    });
  } catch (error) {
    console.warn('Redis not available - using in-memory sessions');
    redis = null;
  }
} else {
  console.log('Using in-memory session storage (development mode)');
}

// Fallback to in-memory storage
const activeAdminTokens = new Map();
const activeMemberTokens = new Map();
const blacklistedTokens = new Set();

const MAX_SESSIONS_PER_ADMIN = 3;
const MAX_SESSIONS_PER_MEMBER = 5;

console.log('Auth middleware initialized');


// TOKEN STORAGE 


async function storeSession(token, session, type = 'admin') {
  if (redis) {
    try {
      const key = `${type}_token:${token}`;
      const ttl = type === 'admin' ? 24 * 3600 : 7 * 24 * 3600;
      await redis.setex(key, ttl, JSON.stringify(session));
    } catch (error) {
      console.error('    Redis store error, using memory:', error.message);
      const store = type === 'admin' ? activeAdminTokens : activeMemberTokens;
      store.set(token, session);
    }
  } else {
    const store = type === 'admin' ? activeAdminTokens : activeMemberTokens;
    store.set(token, session);
  }
}

async function getSession(token, type = 'admin') {
  if (redis) {
    try {
      const key = `${type}_token:${token}`;
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      const store = type === 'admin' ? activeAdminTokens : activeMemberTokens;
      return store.get(token) || null;
    }
  } else {
    const store = type === 'admin' ? activeAdminTokens : activeMemberTokens;
    return store.get(token) || null;
  }
}

async function deleteSession(token, type = 'admin') {
  if (redis) {
    try {
      const key = `${type}_token:${token}`;
      await redis.del(key);
    } catch (error) {
      const store = type === 'admin' ? activeAdminTokens : activeMemberTokens;
      store.delete(token);
    }
  } else {
    const store = type === 'admin' ? activeAdminTokens : activeMemberTokens;
    store.delete(token);
  }
}

async function isTokenBlacklisted(token) {
  if (redis) {
    try {
      return await redis.sismember('blacklisted_tokens', token);
    } catch (error) {
      return blacklistedTokens.has(token);
    }
  }
  return blacklistedTokens.has(token);
}

async function blacklistToken(token) {
  if (redis) {
    try {
      await redis.sadd('blacklisted_tokens', token);
      await redis.expire('blacklisted_tokens', 7 * 24 * 3600);
    } catch (error) {
      blacklistedTokens.add(token);
    }
  } else {
    blacklistedTokens.add(token);
  }
}





function validateTokenPayload(decoded, expectedType) {
  const requiredFields = ['id', 'email', 'type', 'iat'];
  
  for (const field of requiredFields) {
    if (!(field in decoded)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  if (decoded.type !== expectedType) {
    throw new Error('Invalid token type');
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded.email)) {
    throw new Error('Invalid email format');
  }
  
  return true;
}





function generateAdminToken(adminData) {
  try {
    const payload = {
      id: adminData.id || 1,
      email: adminData.email || adminData.username,
      role: adminData.role || 'admin',
      type: 'admin',
      iat: Math.floor(Date.now() / 1000)
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      algorithm: 'HS256'
    });
    
    const session = {
      email: payload.email,
      role: payload.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    };
    
    storeSession(token, session, 'admin');
    
    console.log(`Admin token generated for ${payload.email}`);
    return token;
    
  } catch (error) {
    console.error('Error generating admin token:', error);
    throw error;
  }
}

async function verifyAdminToken(req, res, next) {
  const authHeader = req.header('Authorization') || req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No authorization header.' 
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Invalid token format.' 
    });
  }

 

  try {
    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token has been revoked.' 
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Validate payload structure
    validateTokenPayload(decoded, 'admin');
    

    let session = await getSession(token, 'admin');
    
    if (!session) {
      
      session = {
        email: decoded.email,
        role: decoded.role,
        createdAt: Date.now(),
        expiresAt: decoded.exp * 1000
      };
      await storeSession(token, session, 'admin');
    } else if (session.expiresAt < Date.now()) {
      await deleteSession(token, 'admin');
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please login again.' 
      });
    }
    
    req.admin = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };
    
    req.token = token;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please login again.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. Authentication failed.' 
      });
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.error('   Token verification error:', error);
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication verification failed.' 
    });
  }
}


// MEMBER TOKEN FUNCTION



function generateMemberToken(memberData) {
  try {
    const payload = {
      id: memberData.id,
      memberid: memberData.memberid,
      email: memberData.email,
      type: 'member',
      iat: Math.floor(Date.now() / 1000)
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      algorithm: 'HS256'
    });
    
    const session = {
      memberId: memberData.id,
      memberid: memberData.memberid,
      email: memberData.email,
      createdAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };
    
    storeSession(token, session, 'member');
    
    console.log(`Member token generated for ${memberData.memberid}`);
    return token;
    
  } catch (error) {
    console.error('Error generating member token:', error);
    throw error;
  }
}

async function verifyMemberToken(req, res, next) {
  const authHeader = req.header('Authorization') || req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Please login.' 
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. Invalid token format.' 
    });
  }

  try {
    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session has been revoked.' 
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Validate payload
    validateTokenPayload(decoded, 'member');
    
    // Additional member field validation
    if (!decoded.memberid) {
      throw new Error('Missing memberid in token');
    }
    
    // Check session
    let session = await getSession(token, 'member');
    
    if (!session) {
      session = {
        memberId: decoded.id,
        memberid: decoded.memberid,
        email: decoded.email,
        createdAt: Date.now(),
        expiresAt: decoded.exp * 1000
      };
      await storeSession(token, session, 'member');
    } else if (session.expiresAt < Date.now()) {
      await deleteSession(token, 'member');
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please login again.' 
      });
    }
    
    req.member = {
      id: decoded.id,
      memberid: decoded.memberid,
      email: decoded.email
    };
    
    req.token = token;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please login again.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid session. Please login again.' 
      });
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.error('Member token verification error:', error);
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication failed.' 
    });
  }
}


// CLEANUP & UTILITIES


async function cleanupExpiredTokens() {
  if (redis) return; 
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, session] of activeAdminTokens.entries()) {
    if (session.expiresAt < now) {
      activeAdminTokens.delete(token);
      cleaned++;
    }
  }
  
  for (const [token, session] of activeMemberTokens.entries()) {
    if (session.expiresAt < now) {
      activeMemberTokens.delete(token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} expired tokens`);
  }
}


if (!redis) {
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
}

module.exports = { 
  verifyAdminToken,
  generateAdminToken,
  verifyMemberToken,
  generateMemberToken,
  cleanupExpiredTokens,
  blacklistToken
};
