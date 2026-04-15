const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { SendMailClient } = require("zeptomail");

const axios = require("axios");
const crypto = require('crypto');

require('dotenv').config();


const isDevelopment = process.env.NODE_ENV !== 'production';

const cashfreeConfig = {
  appId: process.env.CASHFREE_APP_ID?.trim(),
  secretKey: process.env.CASHFREE_SECRET_KEY?.trim(),
  apiVersion: '2023-08-01',
  baseURL: process.env.CASHFREE_ENV === 'production' 
    ? 'https://api.cashfree.com/pg' 
    : 'https://test.cashfree.com/pg'
};

function getCashfreeHeaders() {
   return {
        'x-api-version': cashfreeConfig.apiVersion,     
        'x-client-id': cashfreeConfig.appId,            
        'x-client-secret': cashfreeConfig.secretKey,    
        'Content-Type': 'application/json; charset=utf-8'
    };
}

//  JWT_SECRET IS 
if (!process.env.JWT_SECRET) {
    console.error(' WARNING: JWT_SECRET not found in .env file!');
    console.log('Please create .env file with: JWT_SECRET=your_secret_key_here');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const Database = require('./models/database');

const {
verifyAdminToken,
verifyMemberToken,
generateAdminToken,
generateMemberToken,
blacklistToken
} = require('./middleware/auth.middleware');



const {
  heroUpload,
  eventUpload,
  eventPhotosUpload,
  advisorUpload,
  speakerUpload,
  memberUpload,
  storyUpload,
  newsUpload,
  testimonialsUpload,
  committeeUpload,
  committeeLeaderUpload,
  chapterUpload,
  chapterLeaderUpload
} = require('./middleware/upload.middleware');

const verifyAdmin = verifyAdminToken;


function getBaseUrl(req) {
  return 'https://indiansmechamber.com';
}


const MEMBER_ID_SERIAL_PAD_LENGTH = 4;

function getMembershipFeeServer(membershipType, businessCategory, annualTurnover) {
  const type = String(membershipType || 'annual').trim().toLowerCase();
  const feeMap = { micro: 5000, small: 10000, medium: 15000, listed: 25000 };
  const baseCategory = feeMap[String(businessCategory || 'micro').toLowerCase()] || 5000;
  if (type === 'startup') return 25000;
  if (type === 'lifetime') return 250000;
  if (type === 'patron') return 500000;
  if (type === 'annual') return Number(annualTurnover) || baseCategory;
  return baseCategory;
}

function normalizeAndValidateUdyam(value) {
  const v = (value == null ? '' : String(value).trim()).toUpperCase();
  if (!v) return { valid: true, value: null };
  let toCheck = v;
  if (!toCheck.startsWith('UDYAM-') && /^[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(toCheck)) {
    toCheck = 'UDYAM-' + toCheck;
  }
  const newFormat = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
  const legacyFormat = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{7}$/;
  if (newFormat.test(toCheck) || legacyFormat.test(toCheck)) {
    return { valid: true, value: toCheck };
  }
  return { valid: false, value: null };
}


function getMySQLDateTime() {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

async function sendMembershipApplicationEmail(applicationData, membershipFee) {
  // Check if ZeptoMail is configured
  if (!process.env.ZEPTOMAIL_TOKEN || process.env.ZEPTOMAIL_TOKEN === 'your_actual_zeptomail_token_here') {
    if (isDevelopment) {
      console.log('  ZeptoMail not configured, skipping email');
    }
    return;
  }

  try {
    const url = "https://api.zeptomail.in/v1.1/email";
    const token = process.env.ZEPTOMAIL_TOKEN;
    
    let client = new SendMailClient({ url, token });

    const feeNumber = applicationData.finalamount
      ? Number(applicationData.finalamount)
      : (membershipFee || 5000);

    const feeDisplay = `₹${feeNumber.toLocaleString('en-IN')}`;

    await client.sendMail({
      "from": {
        "address": process.env.ZEPTOMAIL_DOMAIN || "noreply@cimsme.com",
        "name": "CIMSME Chamber"
      },
      "to": [
        {
          "email_address": {
            "address": applicationData.email,
            "name": applicationData.fullname
          }
        }
      ],
      "subject": "🎉 CIMSME Membership Application Received - " + applicationData.memberid,
      "htmlbody": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 32px;">CIMSME</h1>
              <p style="color: #6b7280; margin: 5px 0;">Chamber of Indian Micro Small & Medium Enterprises</p>
            </div>

            <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
              <h2 style="color: white; margin: 0;"> Application Received!</h2>
            </div>

            <p style="color: #374151; font-size: 16px;">
              Dear <strong>${applicationData.fullname}</strong>,
            </p>

            <p style="color: #374151; font-size: 16px;">
              Thank you for applying for CIMSME membership. Your application has been received successfully.
            </p>

            <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2563eb;">
              <h3 style="margin: 0 0 15px 0; color: #1e40af;"> Application Details</h3>
              <table style="width: 100%; color: #374151;">
                <tr>
                  <td style="padding: 8px 0;"><strong>Member ID:</strong></td>
                  <td style="padding: 8px 0;">${applicationData.memberid}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Business Name:</strong></td>
                  <td style="padding: 8px 0;">${applicationData.businessname}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Category:</strong></td>
                  <td style="padding: 8px 0; text-transform: capitalize;">${applicationData.businesscategory}</td>
                </tr>
                ${applicationData.udyamregistrationnumber ? `
                <tr>
                  <td style="padding: 8px 0;"><strong>Udyam Registration No.:</strong></td>
                  <td style="padding: 8px 0;">${applicationData.udyamregistrationnumber}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0;"><strong>Email:</strong></td>
                  <td style="padding: 8px 0;">${applicationData.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Phone:</strong></td>
                  <td style="padding: 8px 0;">${applicationData.phone}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Location:</strong></td>
                  <td style="padding: 8px 0;">${applicationData.city}, ${applicationData.state} - ${applicationData.pincode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Membership Fee:</strong></td>
                  <td style="padding: 8px 0; color: #059669; font-weight: bold;">${feeDisplay}</td>
                </tr>
                ${applicationData.couponcode ? `
                <tr>
                  <td style="padding: 8px 0;"><strong>Coupon:</strong></td>
                  <td style="padding: 8px 0; color: #dc2626;">${applicationData.couponcode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Discount:</strong></td>
                  <td style="padding: 8px 0; color: #dc2626;">₹${applicationData.discountamount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Final Amount:</strong></td>
                  <td style="padding: 8px 0; color: #059669; font-weight: bold;">₹${applicationData.finalamount}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0;"><strong>Status:</strong></td>
                  <td style="padding: 8px 0;">
                    <span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px;">⏳ Pending Review</span>
                  </td>
                </tr>
              </table>
            </div>

            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e;">
                <strong>⏳ What's Next?</strong><br>
                Our team will review your application within 24-48 hours. You will receive an email once approved.
              </p>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Questions? Contact us:<br>
               ${process.env.CONTACT_EMAIL || 'info@cimsme.com'}<br>
               ${process.env.CONTACT_PHONE || '+91-1234567890'}
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              © ${new Date().getFullYear()} CIMSME. All rights reserved.
            </p>

          </div>
        </div>
      `
    });

    if (isDevelopment) {
      console.log(` ZeptoMail sent successfully to: ${applicationData.email}`);
    } else {
      console.log('  ZeptoMail sent successfully');
    }
  } catch (error) {
    console.error('   Email function error:', error.message);
    if (isDevelopment) {
      console.error('ZeptoMail raw error:', error);
    }
  }
}


const publicUploadsDir = path.join(__dirname, 'public', 'uploads');

if (isDevelopment) {
    console.log('✓ Upload directories initialized');
}

const allowedOriginsRaw = [
    'https://test.indiansmechamber.com',
    'https://indiansmechamber.com',
    'https://www.indiansmechamber.com',
    process.env.BASE_URL,
    process.env.FRONTEND_URL,
    ...(process.env.NODE_ENV !== 'production' ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        process.env.NGROK_URL
    ] : [])
].filter(Boolean);


const allowedOrigins = allowedOriginsRaw.map(o => (o || '').toString().replace(/\/$/, ''));


app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());


app.use(cors({ 
    origin: function(origin, callback) {
      
        if (!origin) return callback(null, true);
        
  
        const normalizedOrigin = origin.replace(/\/$/, '');
        

             
        
      
        if (normalizedOrigin.includes('ngrok-free.dev') || normalizedOrigin.includes('ngrok-free.app')) {
            return callback(null, true);
        }
        
   
        if (allowedOrigins.includes(normalizedOrigin)) {
            callback(null, true);
        } else {
            console.warn(`  CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/api/payment/webhook', express.raw({ 
    type: 'application/json',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));



app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize everything
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
    console.log(`Main Website:    http://localhost:${PORT}`);
    console.log(` Admin Dashboard: http://localhost:${PORT}/admin`);
    if (isDevelopment) {
        console.log(` Environment: DEVELOPMENT`);
        console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);
    } else {
        console.log(`Environment: PRODUCTION`);
    }
  });
});












app.get('/signature/:filename', (req, res) => {
    const filename = req.params.filename;
    const safeName = path.basename(filename);
    // Security: only allow PNG and prevent path traversal
    if (!safeName || !safeName.endsWith('.png')) {
        console.error('  Invalid file type:', filename);
        return res.status(400).json({ success: false, message: 'Invalid file type' });
    }
    const signatureDir = path.resolve(__dirname, 'public', 'signature');
    const filepath = path.resolve(signatureDir, safeName);
    const relativePath = path.relative(signatureDir, filepath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return res.status(400).json({ success: false, message: 'Invalid file path' });
    }
    
    if (!fs.existsSync(filepath)) {
        console.error('  File not found:', filepath);
        return res.status(404).json({ success: false, message: 'Signature not found' });
    }
    
 
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); 
    
    res.sendFile(filepath, (err) => {
        if (err) {
            console.error('  Error sending file:', err);
            res.status(500).json({ success: false, message: 'Error loading signature' });
        } else {
            console.log(' Signature sent successfully:', safeName);
        }
    });
});


app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));


app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, 
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
 
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1';
    
 
    const path = req.path.toLowerCase();
    const isAdminRoute = 
      path.startsWith('/api/admin/') ||
      path.includes('/admin/') ||
      path.startsWith('/api/events/admin/') ||
      path.startsWith('/api/advisory') ||
      path.startsWith('/api/hero') ||
      path.startsWith('/api/news') ||
      path.includes('/admin/');
    
    // 3. Static files
    const isStaticFile = 
      path.includes('/uploads') || 
      path.includes('.css') || 
      path.includes('.js') ||
      path.includes('.png') ||
      path.includes('.jpg') ||
      path.includes('.jpeg') ||
      path.includes('.gif') ||
      path.includes('.svg') ||
      path.includes('.ico');
    
    return isLocalhost || isAdminRoute || isStaticFile;
  },
  handler: (req, res) => {
    
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please slow down and try again.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    });
  }
});


app.use(limiter);

// Specific rate limiter for membership applications
const membershipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 
  max: 3, 
  message: { 
    success: false, 
    message: 'Too many applications from this IP. Please try again after 15 minutes.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' 
});

// Rate limiter for admin login (prevents brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});


app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? '  ' : res.statusCode >= 300 ? '⚠️' : ' ';
    
    
    if (process.env.NODE_ENV === 'production') {
     
      if (res.statusCode >= 400 || req.url.includes('/api/membership/apply')) {
        console.log(`${logLevel} ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      }
    } else {
  
      if (!req.url.includes('/uploads') && !req.url.includes('.css') && !req.url.includes('.js')) {
        console.log(`${logLevel} ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      }
    }
  });
  
  next();
});



app.use('/uploads', express.static(publicUploadsDir, { maxAge: '1d' }));

app.get('/api/config', (req, res) => {
  const cashfreeMode = process.env.CASHFREE_ENV === 'production' ? 'production' : 'test';
  res.json({ cashfreeMode });
});

app.get('/api/footer-pdf', async (req, res) => {
  try {
    const row = await Database.getFooterPdf();
    if (!row || !row.pdf_url) {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: {
        title: row.title || 'CIMSME Presentation',
        pdfUrl: row.pdf_url,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    console.error('GET /api/footer-pdf:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load PDF settings' });
  }
});

app.put('/api/admin/footer-pdf', verifyAdmin, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = typeof body.title === 'string' ? body.title.trim() : 'CIMSME Presentation';
    const pdfUrl = typeof body.pdfUrl === 'string' ? body.pdfUrl.trim() : null;
    const urlMax = 1000;
    if (pdfUrl && pdfUrl.length > urlMax) {
      return res.status(400).json({ success: false, message: 'PDF URL too long' });
    }
    await Database.upsertFooterPdf(title || 'CIMSME Presentation', pdfUrl || null);
    res.json({ success: true, message: 'Footer PDF updated' });
  } catch (err) {
    console.error('PUT /api/admin/footer-pdf:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update footer PDF' });
  }
});

// Database init
async function initDb() {
  try {
    await Database.testConnection();
    await Database.initializeTables();
    await Database.createMembershipTables();
    console.log(' Database ready');
  } catch (error) {
    console.error('  Database failed:', error);
    process.exit(1);
  }
}

// ADMIN LOGIN


app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (isDevelopment) {
          console.log(' Admin login attempt:', { email: email ? `${email.substring(0, 3)}***` : '(empty)', passwordProvided: !!password });
      }

      const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cimsme.com').trim().toLowerCase();
      const adminPasswordRaw = (process.env.ADMIN_PASSWORD || 'Admin@123').trim();

      if (!email || !password) {
          return res.status(400).json({
              success: false,
              message: 'Email and password required'
          });
      }

   
      const looksLikeBcrypt = (adminPasswordRaw.startsWith('$2a$') || adminPasswordRaw.startsWith('$2b$')) && adminPasswordRaw.length >= 59;
      if (!isDevelopment && !looksLikeBcrypt) {
          console.error('ADMIN_PASSWORD must be a bcrypt hash in production. Set ADMIN_PASSWORD to a 60-character bcrypt hash.');
          return res.status(503).json({
              success: false,
              message: 'Server configuration error. Contact administrator.'
          });
      }

      if (email.toLowerCase() !== adminEmail) {
          if (isDevelopment) console.log(' Invalid email');
          else console.log(' Failed login attempt');
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      let isPasswordValid = false;

      if (looksLikeBcrypt) {
          try {
              isPasswordValid = await bcrypt.compare(password, adminPasswordRaw);
              if (isDevelopment) console.log(' Bcrypt comparison:', isPasswordValid);
          } catch (bcryptErr) {
              console.error(' Bcrypt error (production: set ADMIN_PASSWORD to valid 60-char hash or plain password):', bcryptErr.message);
              return res.status(500).json({
                  success: false,
                  message: 'Server configuration error. Contact administrator.'
              });
          }
      } else {
          isPasswordValid = (password === adminPasswordRaw);
          if (isDevelopment) console.log(' Plain text comparison:', isPasswordValid);
      }

      if (isPasswordValid) {
          const token = generateAdminToken({ id: 1, email: adminEmail, role: 'super-admin' });
          console.log(' Admin login successful');
          return res.json({
              success: true,
              data: { token, admin: { id: 1, email: adminEmail, role: 'super-admin' } },
              message: 'Login successful'
          });
      }

      console.log(' Invalid password attempt');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

  } catch (error) {
      console.error(' Admin login error:', error.message || error);
      return res.status(500).json({
          success: false,
          message: 'Login failed. Please try again.'
      });
  }
});


app.get('/api/auth/accounts', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});


// HERO ROUTES - COMPLETE



app.get('/api/hero', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const heroes = await Database.getAllHero();
    const activeHeroes = heroes.filter(h => h.is_active !== false);
    res.json({ success: true, data: activeHeroes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


  app.post('/api/hero', verifyAdmin, heroUpload, async (req, res) => {
  try {
    const { title, subtitle, button_text, button_link, order_index } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    
    const heroData = {
      title: title.trim(),
      subtitle: subtitle || '',
      button_text: button_text || '',
      button_link: button_link || '',
      text_position: req.body.text_position || 'bottom-left',
      order_index: parseInt(order_index) || 0,
      image_url: req.file ? `/uploads/hero/${req.file.filename}` : null,
      is_active: true
    };
    
    const id = await Database.createHero(heroData);
    
    res.json({ success: true, message: 'Hero slide created', id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
app.put('/api/hero/:id', verifyAdmin, heroUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, button_text, button_link, order_index } = req.body;
    
    const updateData = {
      title: title?.trim(),
      subtitle: subtitle || '',
      button_text: button_text || '',
      button_link: button_link || '',
      text_position: req.body.text_position || 'bottom-left',
      order_index: parseInt(order_index) || 0
    };
    
    if (req.file) {
      updateData.image_url = `/uploads/hero/${req.file.filename}`;
    }
    
    const success = await Database.updateHero(id, updateData);
    
    if (success) {
      res.json({ success: true, message: 'Hero slide updated' });
    } else {
      res.status(404).json({ success: false, message: 'Hero slide not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});




app.patch('/api/hero/toggle/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const heroes = await Database.getAllHero();
    const hero = heroes.find(h => h.id == id);
    
    if (!hero) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }
    
    const success = await Database.updateHero(id, { is_active: !hero.is_active });
    
    if (success) {
      res.json({ success: true, is_active: !hero.is_active });
    } else {
      res.status(500).json({ success: false, message: 'Failed to toggle status' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.delete('/api/hero/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await Database.deleteHero(id);
    
    if (success) {
      res.json({ success: true, message: 'Hero slide deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Hero slide not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});





app.get('/api/events/admin/all', verifyAdmin, async (req, res) => {
  try {
    const events = await Database.getAllEvents();
    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.get('/api/events', async (req, res) => {
  try {
    const events = await Database.getAllEvents();
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Events API Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});



// ADVISORY ROUTES 
app.get('/api/advisory', async (req, res) => {
  try {
    const advisors = await Database.getAllAdvisors();
    res.json({ success: true, data: advisors.filter(a => a.is_active) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.get('/api/advisory/admin/all', verifyAdmin, async (req, res) => {
  try {
    const advisors = await Database.getAllAdvisors();
    res.json({ success: true, data: advisors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ADVISORS ROUTES 
app.get('/api/advisors', async (req, res) => {
  try {
    const advisors = await Database.getAllAdvisors();
    res.json({ success: true, data: advisors.filter(a => a.is_active) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/advisors/admin/all', verifyAdmin, async (req, res) => {
  try {
    const advisors = await Database.getAllAdvisors();
    res.json({ success: true, data: advisors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// FRONTEND ROUTES
app.get('/', (req, res) => {
  const file = path.join(__dirname, 'public', 'index.html');
  fs.existsSync(file) ? res.sendFile(file) : res.json({ message: 'CIMSME CMS' });
});

app.get('/admin', (req, res) => {
  const file = path.join(__dirname, 'public', 'admin', 'dashboard.html');
  fs.existsSync(file) ? res.sendFile(file) : res.json({ message: 'Admin panel' });
});

app.get('/payment-status', (req, res) => {
    const file = path.join(__dirname, 'public', 'payment-status.html');
    if (fs.existsSync(file)) {
        res.sendFile(file);
    } else {
        res.status(404).send('Payment status page not found');
    }
});



app.get('/payment-success', (req, res) => {
  const file = path.join(__dirname, 'public', 'payment-success.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Payment success page not found');
  }
});
app.get('/payment-failed', (req, res) => {
  const file = path.join(__dirname, 'public', 'payment-failed.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Payment failed page not found');
  }
});

// Membership application page (dedicated route for production-ready URL)
app.get('/membership', (req, res) => {
  const file = path.join(__dirname, 'public', 'membership.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

app.get('/sme-assurance', (req, res) => {
  const file = path.join(__dirname, 'public', 'sme-assurance.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

// Committees list page
app.get('/committees', (req, res) => {
  const file = path.join(__dirname, 'public', 'committees.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

// Single committee page (supports ?id=1)
app.get('/committee', (req, res) => {
  const file = path.join(__dirname, 'public', 'committee.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

// Chapters list page
app.get('/chapters', (req, res) => {
  const file = path.join(__dirname, 'public', 'chapters.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

// Single chapter page (supports ?id=1)
app.get('/chapter', (req, res) => {
  const file = path.join(__dirname, 'public', 'chapter.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

// MEMBERSHIP ROUTES

// Get membership stories
app.get('/api/admin/membership/stories', verifyAdmin, async (req, res) => {
  try {
    const stories = await Database.getAll('membership_stories'); 
    res.json({ success: true, data: stories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approve membership application
app.post('/api/admin/membership/applications/:id/approve', verifyAdmin, async (req, res) => {
  try {
    await Database.update('membership_applications', req.params.id, {
      status: 'approved',
      approveddate: new Date().toISOString()
    });
    res.json({ success: true, message: 'Application approved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reject membership application
app.post('/api/admin/membership/applications/:id/reject', verifyAdmin, async (req, res) => {
  try {
    await Database.update('membership_applications', req.params.id, {
      status: 'rejected',
      rejecteddate: new Date().toISOString()
    });
    res.json({ success: true, message: 'Application rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete membership application
app.delete('/api/admin/membership/applications/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.delete('membership_applications', req.params.id);
    res.json({ success: true, message: 'Application deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});




app.get('/api/membership/applications', verifyAdmin, async (req, res) => {
  try {
    const applications = await Database.getAll('membership_applications');
    res.json({ success: true, data: applications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MEMBER DASHBOARD API 


app.get('/api/member/dashboard', verifyMemberToken, async (req, res) => {
  try {
    const memberEmail = req.member.email;
    const memberid = req.member.memberid;

    if (isDevelopment) {
      console.log(` Loading dashboard for: ${memberid} (${memberEmail})`);
    }


    const member = await Database.getApprovedMemberById(memberid);

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

  
    const getMembershipTypeLabel = (m) => {
      const stored = (m.membershiptype || '').toString().trim().toLowerCase();
      if (stored === 'annual') return 'Annual Membership';
      if (stored === 'startup') return 'Startup Membership';
      if (stored === 'lifetime') return 'Lifetime Membership';
      if (stored === 'patron') return 'Patron Membership';
      const fee = parseFloat(m.finalamount || m.membershipfee || 0);
      if (fee >= 500000) return 'Patron Membership';
      if (fee >= 250000) return 'Lifetime Membership';
      if (fee >= 25000 && fee < 100000) return 'Startup Membership';
      return 'Annual Membership';
    };
    const getJoinDate = (m) => m.payment_date || m.applicationdate || m.created_at;
    const getRenewalDate = (m) => {
      const type = (m.membershiptype || '').toString().trim().toLowerCase();
      const fee = parseFloat(m.finalamount || m.membershipfee || 0);
      if (type === 'lifetime' || type === 'patron' || fee >= 250000) return null;
      const join = new Date(getJoinDate(m));
      if (isNaN(join.getTime())) return null;
      const renewal = new Date(join);
      renewal.setFullYear(renewal.getFullYear() + 1);
      return renewal.toISOString().split('T')[0];
    };
    const formatDateForDisplay = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    
    const memberRegistrations = await Database.getEventRegistrationsByEmail(memberEmail);

    if (isDevelopment) {
      console.log(`   Found ${memberRegistrations.length} registrations for ${memberEmail}`);
    }

   
    const allEvents = await Database.getAllEvents();

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const registeredEventIds = memberRegistrations.map(reg => reg.event_id);

  
    const upcomingEvents = allEvents
      .filter(event => {
        const eventDate = new Date(event.event_date);
        eventDate.setHours(0, 0, 0, 0);
        return event.is_active === 1 || event.is_active === true
          ? eventDate >= now
          : false;
      })
      .map(event => ({
        ...event,
        is_registered: registeredEventIds.includes(event.id)
      }))
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  
    const registeredEvents = memberRegistrations
      .map(reg => {
        const event = allEvents.find(e => e.id === reg.event_id);
        if (!event) return null;

        const eventDate = new Date(event.event_date);
        eventDate.setHours(0, 0, 0, 0);

        if (eventDate >= now) {
          return {
            ...event,
            registration_id: reg.registration_id,
            registered_at: reg.registered_at,
            payment_status: reg.payment_status,
            payment_confirmed: reg.payment_confirmed,
            num_participants: reg.num_participants,
            is_registered: true
          };
        }
        return null;
      })
      .filter(e => e !== null)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));


    const completedEvents = memberRegistrations
      .map(reg => {
        const event = allEvents.find(e => e.id === reg.event_id);
        if (!event) return null;

        const eventDate = new Date(event.event_date);
        eventDate.setHours(0, 0, 0, 0);

        if (eventDate < now) {
          return {
            ...event,
            registration_id: reg.registration_id,
            registered_at: reg.registered_at,
            payment_status: reg.payment_status,
            attendance_status: reg.attendance_status || 'attended',
            is_registered: true
          };
        }
        return null;
      })
      .filter(e => e !== null)
      .sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

    console.log(' Dashboard loaded:');
    console.log(`   - Upcoming events: ${upcomingEvents.length}`);
    console.log(`   - Registered: ${registeredEvents.length}`);
    console.log(`   - Completed: ${completedEvents.length}`);

    const joindate = getJoinDate(member);
    const renewalDate = getRenewalDate(member);

    res.json({
      success: true,
      data: {
        member: {
          memberid: member.memberid,
          fullname: member.fullname,
          businessname: member.businessname,
          email: member.email,
          phone: member.phone,
          membershiptype: getMembershipTypeLabel(member),
          joindate: joindate,
          memberSince: formatDateForDisplay(joindate),
          renewaldate: renewalDate ? formatDateForDisplay(renewalDate) : 'Lifetime'
        },
        stats: {
          eventsRegistered: registeredEvents.length,
          eventsCompleted: completedEvents.length,
          totalRegistrations: memberRegistrations.length
        },
        events: {
          all: upcomingEvents,
          registered: registeredEvents,
          completed: completedEvents
        }
      }
    });

  } catch (error) {
    console.error('  Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard'
    });
  }
});

// MEMBER SERVICES API ROUTES

app.post('/api/services/request', async (req, res) => {
    try {
        const { serviceType, memberData, formData } = req.body;
        
    if (!serviceType || !memberData || !formData) {
  return res.status(400).json({ success: false, message: 'Missing required fields' });
}

const now = new Date();

const newRequest = {
  memberid: memberData.memberid || null,
  member_email: memberData.email || null,
  member_name: memberData.fullName || memberData.fullname || null,
  business_name: memberData.businessName || memberData.businessname || null,
  service_type: serviceType || null,
  service_name: (formData && formData.serviceName) ? formData.serviceName : null,
  description: (formData && formData.description) ? formData.description : null,
  timeline: (formData && formData.timeline) ? formData.timeline : null,
  contact_number: (formData && formData.contactNumber) ? formData.contactNumber : null,
  status: 'Pending',
  request_date: new Date(),
  last_updated: new Date(),
  created_at: new Date()
};


await Database.create('member_services', newRequest);

if (isDevelopment) {
  console.log(` New ${serviceType} service request from ${memberData.email}`);
} else {
  console.log(` New ${serviceType} service request submitted`);
}
res.json({ success: true, message: 'Service request submitted successfully', data: newRequest });

        
    } catch (error) {
        console.error('  Service request error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit request' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/registrations/:email', async (req, res) => {
        try {
            const email = req.params.email;
            const allRegistrations = await Database.getAllEventRegistrations();
            const memberRegistrations = allRegistrations.filter(reg => 
                reg.email && reg.email.toLowerCase() === email.toLowerCase()
            );
            const allEvents = await Database.getAllEvents();
            
            console.log('DEBUG: Event Registrations');
            console.log(`Email: ${email}`);
            console.log(`Total registrations: ${allRegistrations.length}`);
            console.log(`Member registrations: ${memberRegistrations.length}`);
            
            res.json({
                success: true,
                data: {
                    totalRegistrations: allRegistrations.length,
                    memberRegistrations: memberRegistrations.length,
                    registrations: memberRegistrations,
                    events: allEvents
                }
            });
        } catch (error) {
            console.error('Debug error:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });
}



app.get('/api/services/all', verifyAdmin, async (req, res) => {
    try {
        let services = [];
        
        try {
           
            services = await Database.getAll('member_services'); 
        } catch (err) {
            console.log('memberServices.json not found, initializing empty array');
            services = [];
        }
        
        const grouped = {
        finance: services.filter(s => s.service_type === 'finance'),
        legal: services.filter(s => s.service_type === 'legal'),
        advisory: services.filter(s => s.service_type === 'advisory'),
        training: services.filter(s => s.service_type === 'training'),
        ipr: services.filter(s => s.service_type === 'ipr')
      };


        
        res.json({ success: true, data: grouped });
    } catch (error) {
        console.error('  Error fetching services:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update service status (for admin)
app.put('/api/services/update/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
       
            const services = await Database.getAll('member_services');

        const service = services.find(s => s.id === parseInt(id));

        if (!service) {
          return res.status(404).json({ success: false, message: 'Service not found' });
        }

        const updateData = {
          status,
          last_updated: new Date()
        };

        await Database.update('member_services', parseInt(id), updateData);

        
        console.log(` Service ${id} status updated to ${status}`);
        res.json({ success: true, message: 'Service status updated' });
    } catch (error) {
        console.error('  Update service error:', error);
        res.status(500).json({ success: false, message: 'Failed to update service' });
    }
});

// Delete service request (for admin)
app.delete('/api/services/delete/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
       
                await Database.delete('member_services', parseInt(id));

        
        console.log(` Service request ${id} deleted`);
        res.json({ success: true, message: 'Service request deleted' });
    } catch (error) {
        console.error('  Delete service error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete service' });
    }
});


// NEWSLETTER ROUTES 


// Get all newsletter subscribers (Admin)
app.get('/api/admin/newsletter/subscribers', verifyAdmin, async (req, res) => {
  try {
    const subscribers = await Database.getAllNewsletter();
    
    // Sort by date (newest first)
    subscribers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
  
    const today = new Date().toISOString().split('T')[0];
    const stats = {
    total: subscribers.length,
    active: subscribers.filter(s => s.status === 'active').length,
    today: subscribers.filter(s => {
        if (!s.created_at) return false;
        const dateStr = typeof s.created_at === 'string' ? s.created_at : s.created_at.toISOString();
        return dateStr.startsWith(today);
    }).length
};

    
    res.json({ success: true, data: subscribers, stats });
  } catch (error) {
    console.error('Newsletter subscribers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load subscribers' });
  }
});

// Subscribe to newsletter (Public)
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    
    // Check for duplicate
    const existing = await Database.getAllNewsletter();
    const duplicate = existing.find(s => s.email.toLowerCase() === email.toLowerCase());
    
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'Email already subscribed' });
    }
    
    // Create subscription
    await Database.createNewsletterSubscription({
      email: email.toLowerCase().trim(),
      status: 'active',
      source: 'website'
    });
    
    if (isDevelopment) {
      console.log('Newsletter subscription:', email);
    } else {
      console.log(' Newsletter subscription added');
    }
    res.json({ success: true, message: 'Successfully subscribed!' });
  } catch (error) {
    console.error('Newsletter error:', error);
    res.status(500).json({ success: false, message: 'Subscription failed' });
  }
});

// Delete newsletter subscriber (Admin)
app.delete('/api/admin/newsletter/subscribers/:id', verifyAdmin, async (req, res) => {
  try {
    const success = await Database.deleteNewsletterSubscription(req.params.id);
    
    if (success) {
      res.json({ success: true, message: 'Subscriber deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Subscriber not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});


//  CREATE PAYMENT ORDER
app.post('/api/payment/create-order', async (req, res) => {
    try {
        const { membershipData, amount } = req.body;
        
        if (!membershipData || !amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await Database.createPaymentOrder({
            order_id: orderId,
            amount: parseFloat(amount),
            currency: 'INR',
            customer_name: membershipData.fullname || membershipData.fullName,
            customer_email: membershipData.email,
            customer_phone: membershipData.phone,
            membership_data: membershipData
        });

        const request = {
            order_amount: parseFloat(amount),
            order_currency: 'INR',
            order_id: orderId,
            customer_details: {
                customer_id: membershipData.email,
                customer_name: membershipData.fullname || membershipData.fullName,
                customer_email: membershipData.email,
                customer_phone: membershipData.phone
            },
           
            order_meta: {
              return_url: `${getBaseUrl(req)}/payment-status?orderId=${orderId}`,
              notify_url: `${getBaseUrl(req)}/api/payment/webhook`
          }
  };

            const response = await axios.post(
    `${cashfreeConfig.baseURL}/orders`,
    request,
    { headers: getCashfreeHeaders(), timeout: 15000 }
);

if (!response?.data?.cf_order_id || !response?.data?.payment_session_id) {
    throw new Error('Invalid response from payment gateway');
}

await Database.updatePaymentOrder(
    orderId, 
    response.data.cf_order_id, 
    response.data.payment_session_id
);



console.log('✓ Payment order created:', orderId);

res.json({
    success: true,
    data: {
        orderId,
        sessionId: response.data.payment_session_id,
        paymentUrl: response.data.payment_link
    }
});


    } catch (error) {
        console.error('Payment order error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create payment order' 
        });
    }
});



//  VERIFY PAYMENT

app.post('/api/payment/verify', async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID required' 
            });
        }

        const orderData = await Database.getPaymentOrder(orderId);
        
        if (!orderData) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        
        if (orderData.status === 'PAID') {
            console.log(' Payment already processed:', orderId);
            const synced = await Database.completeMembershipPayment(orderId, orderData.amount);
            if (!synced) {
                console.error('Verify (already PAID): completeMembershipPayment returned null for order', orderId, '- application may need manual approval');
            }
            return res.json({
                success: true,
                message: 'Payment already successful',
                status: 'SUCCESS',
                alreadyProcessed: true
            });
        }

        if (!orderData.cf_order_id || orderData.cf_order_id === 'null') {
            return res.json({
                success: false,
                message: 'Payment details are being prepared. Please wait a moment.',
                status: 'PENDING'
            });
        }

        // Cashfree payment verification
        const response = await axios.get(
            `${cashfreeConfig.baseURL}/orders/${orderData.cf_order_id}/payments`,
            { 
                headers: getCashfreeHeaders(),
                timeout: 10000
            }
        );
        
        if (response.data && response.data.length > 0) {
            const payment = response.data[0];
            
            if (payment.payment_status === 'SUCCESS') {
               
                const currentOrder = await Database.getPaymentOrder(orderId);
                if (currentOrder.status === 'PAID') {
                    return res.json({
                        success: true,
                        message: 'Payment successful',
                        status: 'SUCCESS',
                        alreadyProcessed: true
                    });
                }

                // Complete payment processing
                await Database.updatePaymentStatus(orderId, 'PAID', {
                    payment_method: payment.payment_group
                });

                await Database.createPaymentTransaction({
                    cf_payment_id: payment.cf_payment_id,
                    order_id: orderId,
                    amount: payment.payment_amount,
                    status: 'SUCCESS',
                    payment_method: payment.payment_group,
                    bank_reference: payment.bank_reference,
                    payment_time: payment.payment_time,
                    webhook_data: payment
                });

                const completed = await Database.completeMembershipPayment(orderId, payment.payment_amount);
                if (!completed) {
                    console.error('Verify: completeMembershipPayment returned null for order', orderId);
                    return res.status(500).json({
                        success: false,
                        message: 'Payment recorded but membership update failed. Please contact support with your Order ID.',
                        status: 'PENDING'
                    });
                }
                console.log(' Payment verified & completed:', orderId);
                return res.json({
                    success: true,
                    message: 'Payment successful',
                    status: 'SUCCESS'
                });
            }
            if (payment.payment_status === 'FAILED' || payment.payment_status === 'EXPIRED' || payment.payment_status === 'CANCELLED') {
                return res.json({
                    success: false,
                    message: 'Payment failed or was cancelled',
                    status: 'FAILED'
                });
            }
        }

        // Payment pending
        return res.json({
            success: false,
            message: 'Payment not completed',
            status: 'PENDING'
        });

    } catch (error) {
        console.error('Payment verification error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: 'Verification failed. Please wait and we will check again.',
            status: 'PENDING'
        });
    }
});

//  PAYMENT WEBHOOK
    app.post('/api/payment/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];
        
      
        let rawBody = req.rawBody;
if (!rawBody || typeof rawBody !== 'string') {
  if (Buffer.isBuffer(req.body)) rawBody = req.body.toString('utf8');
  else if (req.body && typeof req.body === 'object') rawBody = JSON.stringify(req.body);
  else rawBody = '';
}
        
        if (!signature || !timestamp) {
            console.error(' Missing webhook headers');
            return res.status(400).json({ success: false, message: 'Missing headers' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', cashfreeConfig.secretKey)
            .update(timestamp + rawBody)
            .digest('base64');

        if (signature !== expectedSignature) {
            console.error('Invalid webhook signature');
            console.error('Expected:', expectedSignature);
            console.error('Received:', signature);
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }
        
        
        
        // Parse body after verification
        const payload = JSON.parse(rawBody);
        const data = payload.data || payload;
        
        if (data.order && data.payment) {
            const orderId = data.order.order_id;
            const paymentStatus = data.payment.payment_status;

            console.log(` Webhook: Order ${orderId} - Status: ${paymentStatus}`);

            if (paymentStatus === 'SUCCESS') {
                // Check if already processed (prevents duplicates)
                const existingOrder = await Database.getPaymentOrder(orderId);
                if (existingOrder && existingOrder.status === 'PAID') {
                    console.log(' Payment already processed via webhook:', orderId);
                    return res.json({ success: true, message: 'Already processed' });
                }

                await Database.updatePaymentStatus(orderId, 'PAID', {
                    payment_method: data.payment.payment_group
                });

                await Database.createPaymentTransaction({
                    cf_payment_id: data.payment.cf_payment_id,
                    order_id: orderId,
                    amount: data.payment.payment_amount,
                    status: 'SUCCESS',
                    payment_method: data.payment.payment_group,
                    bank_reference: data.payment.bank_reference,
                    payment_time: data.payment.payment_time,
                    webhook_data: data.payment
                });

                const completed = await Database.completeMembershipPayment(orderId, data.payment.payment_amount);
                if (!completed) {
                      console.error('Webhook: completeMembershipPayment returned null for order', orderId);
                } else {
                    const appRows = await Database.query(
                        'SELECT * FROM membership_applications WHERE email = ? LIMIT 1',
                        [completed.email]
                    );
                    if (appRows[0]) {
                        sendMembershipApplicationEmail(appRows[0], appRows[0].finalamount || appRows[0].membershipfee).catch(() => {});
                    }
                }
                if (isDevelopment) console.log('Webhook processed:', orderId);
            } else if (paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED' || paymentStatus === 'CANCELLED') {
                const existingOrder = await Database.getPaymentOrder(orderId);
                if (existingOrder && existingOrder.status === 'ACTIVE') {
                    await Database.updatePaymentStatus(orderId, 'FAILED', {
                        payment_method: data.payment.payment_group
                    });
                    const txStatus = paymentStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
                    await Database.createPaymentTransaction({
                        cf_payment_id: data.payment.cf_payment_id,
                        order_id: orderId,
                        amount: data.payment.payment_amount,
                        status: txStatus,
                        payment_method: data.payment.payment_group,
                        bank_reference: data.payment.bank_reference || null,
                        payment_time: data.payment.payment_time || null,
                        webhook_data: data.payment
                    });
                    try {
                        await Database.setMembershipPaymentFailed(orderId);
                    } catch (e) {
                        console.error('setMembershipPaymentFailed:', e.message);
                    }
                    console.log('Webhook: order marked FAILED:', orderId);
                }
            }
        }

        res.json({ success: true });

              } catch (error) {
        console.error('Webhook error:', error.message || error, error.stack || '');
        res.status(500).json({ success: false, message: 'Processing failed' });
    }
});


// SUBMISSIONS/CONTACT ROUTES




app.get('/api/admin/submissions', verifyAdmin, async (req, res) => {
  try {
    const submissions = await Database.getAllSubmissions();
    res.json({ success: true, data: submissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/submissions/create', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email and message required' });
    }
    
    const id = await Database.createSubmission({
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      subject: subject?.trim() || '',
      message: message.trim()
    });
    
    res.json({ success: true, message: 'Message sent successfully', id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/submissions/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.deleteSubmission(req.params.id);
    res.json({ success: true, message: 'Submission deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// EVENTS ROUTES - FIXED
app.post('/api/events/create', verifyAdmin, eventUpload, async (req, res) => {
    try {
        console.log('Creating event. Body:', req.body);
        const { 
            title, 
            description, 
            event_date, 
            event_time, 
            location, 
            event_type,
            registration_fee, 
            max_participants,
            registration_enabled,
            payment_link, 
            is_featured, 
            is_active 
        } = req.body;

    
    if (!title || !event_date) {
      console.log('  Missing required fields:', { title, event_date });
      return res.status(400).json({ 
        success: false, 
        message: 'Title and date required' 
      });
    }
    
           
            let regEnabled = 1; 
            if (registration_enabled !== undefined) {
          
              if (registration_enabled === '0' || registration_enabled === 0 || registration_enabled === false || registration_enabled === 'false') {
                regEnabled = 0;
              } else if (registration_enabled === '1' || registration_enabled === 1 || registration_enabled === true || registration_enabled === 'true') {
                regEnabled = 1;
              }
            }
            console.log('Registration enabled value:', registration_enabled, '-> DB value:', regEnabled);
            
            const eventData = {
            title: title.trim(),
            description: description?.trim(),
            event_date: event_date,
            event_time: event_time || '09:00 AM',
            location: location?.trim(),
            event_type: event_type || 'conference',
            registration_fee: parseFloat(registration_fee) || 0,
            max_participants: parseInt(max_participants) || 0,
            registration_enabled: regEnabled,
            payment_link: payment_link?.trim() || null, 
            is_featured: is_featured === 'true' || is_featured === true,
            is_active: is_active === 'true' || is_active === true || is_active === undefined,
            image_url: req.file ? `uploads/events/${req.file.filename}` : ''
        };

    
    console.log(' Saving event:', eventData);
    
    const id = await Database.create('events', eventData);
    
    console.log(' Event created:', id);
    
    res.json({ success: true, message: 'Event created successfully', id });
    
  } catch (error) {
    console.error('  Create event error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});





// EVENTS UPDATE PUT
app.put('/api/events/update/:id', verifyAdmin, eventUpload, async (req, res) => {
  try {
    console.log('Updating event:', req.params.id);
    console.log('Request body:', req.body);
    
    const {
      title,
      description,
      event_date,
      event_time,
      location,
      event_type,
      registration_fee,
      max_participants,
      registration_enabled,
      payment_link,
      is_featured,
      is_active
    } = req.body;

    const updateData = {
      title: title?.trim(),
      description: description?.trim(),
      event_date: event_date,
      event_time: event_time,
      location: location?.trim(),
      event_type: event_type,
      registration_fee: registration_fee !== undefined ? parseFloat(registration_fee) : undefined,
      max_participants: max_participants !== undefined ? parseInt(max_participants, 10) : undefined,
      payment_link: payment_link?.trim() || null,
      is_featured: typeof is_featured !== 'undefined' ? Number(Boolean(is_featured)) : undefined,
      is_active: typeof is_active !== 'undefined' ? Number(Boolean(is_active)) : undefined
    };
    
 
    if (registration_enabled !== undefined) {
      
      if (registration_enabled === '0' || registration_enabled === 0 || registration_enabled === false || registration_enabled === 'false') {
        updateData.registration_enabled = 0;
      } else if (registration_enabled === '1' || registration_enabled === 1 || registration_enabled === true || registration_enabled === 'true') {
        updateData.registration_enabled = 1;
      }
      console.log('Registration enabled value:', registration_enabled, '-> DB value:', updateData.registration_enabled);
    }

    if (req.file) {
      updateData.image_url = `uploads/events/${req.file.filename}`;
    }

    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });
    
    console.log('Final update data:', updateData);

    const result = await Database.update('events', req.params.id, updateData);
    console.log('Database update result:', result);
    
    if (result) {
   
      const updatedEvent = await Database.getById('events', req.params.id);
      console.log('Updated event from DB:', updatedEvent);
      res.json({ success: true, message: 'Event updated successfully', data: updatedEvent });
    } else {
      throw new Error('Failed to update event in database');
    }
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});



app.delete('/api/events/delete/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.delete('events', req.params.id);
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
app.get('/api/member/registered-events', verifyMemberToken, async (req, res) => {
  try {
    const memberEmail = req.member?.email;
    if (!memberEmail) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    if (isDevelopment) {
      console.log('📅 Loading registered events for:', memberEmail);
    }
    
 
    const allRegistrations = await Database.getAllEventRegistrations();
    const memberRegistrations = allRegistrations.filter(reg =>
      reg.email.toLowerCase() === memberEmail.toLowerCase()
    );
    
    
    const allEvents = await Database.getAllEvents();
    
    
    const enrichedRegistrations = memberRegistrations.map(reg => {
      const event = allEvents.find(e => e.id == reg.event_id);
      return {
        ...reg,
        eventtitle: event ? event.title : reg.event_title || 'Event',
        eventdate: reg.event_date || (event ? event.eventdate : null),
        eventDetails: event ? {
          id: event.id,
          title: event.title,
          description: event.description,
          eventdate: event.eventdate,
          eventtime: event.eventtime,
          location: event.location,
          eventtype: event.eventtype,
          registrationfee: event.registrationfee,
          imageurl: event.imageurl
        } : null
      };
    });
    
    console.log(` MySQL: Returning ${enrichedRegistrations.length} enriched registrations`);
    res.json({
      success: true,
      data: enrichedRegistrations,
      count: enrichedRegistrations.length
    });
  } catch (error) {
    console.error('  Error loading member registered events:', error);
    res.status(500).json({ success: false, message: 'Failed to load registered events' });
  }
});



app.post('/api/admin/event-registrations/:regId/confirm', verifyAdminToken, async (req, res) => {
    try {
        const registrationId = req.params.regId;
        const adminEmail = req.admin?.email;
        
       
        const result = await Database.confirmEventRegistrationPayment(registrationId, adminEmail);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        const registration = result.registration;
        
      
        const emailSent = await sendEventConfirmationEmail(registration);
        
        if (emailSent) {
            await Database.markEventRegistrationEmailSent(registrationId);
        }
        
        res.json({
            success: true,
            message: emailSent ? 'Payment confirmed and email sent' : 'Payment confirmed (email failed)',
            data: registration
        });
        
    } catch (error) {
        console.error('  Error confirming payment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

//  EMAIL SENDING FUNCTION
async function sendEventConfirmationEmail(registration) {
    try {
        const transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: registration.email,
            subject: `Registration Confirmed - ${registration.event_title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">🎉 Registration Confirmed!</h2>
                    <p>Dear ${registration.full_name},</p>
                    <p>Your registration for <strong>${registration.event_title}</strong> has been confirmed.</p>
                    
                    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Registration ID:</strong> ${registration.registration_id}</p>
                        <p style="margin: 5px 0;"><strong>Event:</strong> ${registration.event_title}</p>
                        <p style="margin: 5px 0;"><strong>Participants:</strong> ${registration.num_participants}</p>
                    </div>
                    
                    <p>Please keep this email for your records.</p>
                    <p><strong>CIMSME Team</strong></p>
                </div>
            `
        });
        
        if (isDevelopment) {
          console.log(`   Email sent to: ${registration.email}`);
        } else {
          console.log('   Email sent successfully');
        }
        return true;
    } catch (error) {
        console.error('   Email error:', error.message);
        if (isDevelopment) {
          console.error('Error details:', error);
        }
        return false;
    }
}



//  EVENTS TOGGLE ACTIVE
app.patch('/api/events/toggle-active/:id', verifyAdmin, async (req, res) => {
  try {
    const event = await Database.getById('events', req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    const newStatus = event.is_active ? 0 : 1;
    await Database.update('events', req.params.id, { is_active: newStatus });
    
    console.log(` Event ${req.params.id} active toggled: ${newStatus}`);
    res.json({ success: true, is_active: newStatus, message: 'Active status updated' });
  } catch (error) {
    console.error('  Toggle event active error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

//  ADVISORS TOGGLE ACTIVE 
app.patch('/api/advisors/toggle-active/:id', verifyAdmin, async (req, res) => {
  try {
    const advisor = await Database.getById('advisors', req.params.id);
    if (!advisor) {
      return res.status(404).json({ success: false, message: 'Advisor not found' });
    }
    
    const newStatus = advisor.is_active ? 0 : 1;
    await Database.update('advisors', req.params.id, { is_active: newStatus });
    
    console.log(` Advisor ${req.params.id} active toggled: ${newStatus}`);
    res.json({ success: true, is_active: newStatus, message: 'Active status updated' });
  } catch (error) {
    console.error('  Toggle advisor active error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

//  EVENTS UPLOAD IMAGE 
app.post('/api/events/:id/upload-image', verifyAdmin, eventUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const imageUrl = `uploads/events/${req.file.filename}`;
    await Database.update('events', req.params.id, { imageurl: imageUrl }); 
    
    console.log(` Event ${req.params.id} image uploaded: ${imageUrl}`);
    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('  Upload image error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// EVENT DETAILS MANAGEMENT


app.get('/api/events/:id/full-details', async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id, 10);
    if (isNaN(eventId) || eventId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID'
      });
    }
    const [event, agenda, speakers, videos, photos] = await Promise.all([
      Database.getEventById(eventId),
      Database.getEventAgenda(eventId),
      Database.getEventSpeakers(eventId),
      Database.getEventVideos(eventId),
      Database.getEventPhotos(eventId)
    ]);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    res.json({
      success: true,
      data: {
        ...event,
        agenda: Array.isArray(agenda) ? agenda : [],
        speakers: Array.isArray(speakers) ? speakers : [],
        videos: Array.isArray(videos) ? videos : [],
        photos: Array.isArray(photos) ? photos : []
      }
    });
  } catch (error) {
    console.error('Get event full-details error:', error.message);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Failed to fetch event details' : error.message
    });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);
    if (isNaN(eventId) || eventId <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid event ID' 
      });
    }
    const event = await Database.getEventById(eventId);
    if (!event) {
      return res.status(404).json({ 
        success: false, 
        message: 'Event not found' 
      });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Failed to fetch event' : error.message 
    });
  }
});

app.get('/api/events/:id/agenda', async (req, res) => {
  try {
    const { id } = req.params;
    const agenda = await Database.getEventAgenda(id);
    res.json({ success: true, data: agenda });
  } catch (error) {
    console.error('Get agenda error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add agenda item
app.post('/api/events/:id/agenda', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { time, title, description, speaker, order_index } = req.body;
    
    if (!time || !title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Time and title are required' 
      });
    }
    
    const agendaId = await Database.createAgendaItem({
      event_id: id,
      time,
      title,
      description: description || '',
      speaker: speaker || '',
      order_index: order_index || 0
    });
    
    res.json({ 
      success: true, 
      message: 'Agenda item added', 
      id: agendaId 
    });
  } catch (error) {
    console.error('Create agenda error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete agenda item
app.delete('/api/events/agenda/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Database.deleteAgendaItem(id);
    res.json({ success: true, message: 'Agenda item deleted' });
  } catch (error) {
    console.error('Delete agenda error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// EVENT SPEAKERS ROUTES 

// Get event speakers
app.get('/api/events/:id/speakers', async (req, res) => {
  try {
    const { id } = req.params;
    const speakers = await Database.getEventSpeakers(id);
    res.json({ success: true, data: speakers });
  } catch (error) {
    console.error('Get speakers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add speaker
app.post('/api/events/:id/speakers', verifyAdmin, speakerUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, designation, bio, order_index } = req.body;
    
    if (!name || !designation) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and designation are required' 
      });
    }
    
    const speakerId = await Database.createSpeaker({
      event_id: id,
      name,
      designation,
      bio: bio || '',
      photo_url: req.file ? `/uploads/speakers/${req.file.filename}` : null,
      order_index: order_index || 0
    });
    
    res.json({ 
      success: true, 
      message: 'Speaker added', 
      id: speakerId 
    });
  } catch (error) {
    console.error('Create speaker error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete speaker
app.delete('/api/events/speakers/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Database.deleteSpeaker(id);
    res.json({ success: true, message: 'Speaker deleted' });
  } catch (error) {
    console.error('Delete speaker error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- EVENT PHOTOS ROUTES ---

// Get event photos
app.get('/api/events/:id/photos', async (req, res) => {
  try {
    const { id } = req.params;
    const photos = await Database.getEventPhotos(id);
    res.json({ success: true, data: photos });
  } catch (error) {
    console.error('Get photos error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload photo
app.post('/api/events/:id/photos', verifyAdmin, eventPhotosUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { caption } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Photo file is required' 
      });
    }
    
    const photoId = await Database.createEventPhoto({
      event_id: id,
      photo_url: `/uploads/photos/${req.file.filename}`,
      caption: caption || ''
    });
    
    res.json({ 
      success: true, 
      message: 'Photo uploaded', 
      id: photoId 
    });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete photo
app.delete('/api/events/photos/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Database.deleteEventPhoto(id);
    res.json({ success: true, message: 'Photo deleted' });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// --- EVENT VIDEOS ROUTES ---

// Get event videos
app.get('/api/events/:id/videos', async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = parseInt(id);
    if (isNaN(eventId) || eventId <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid event ID' 
      });
    }
    const videos = await Database.getEventVideos(eventId);
    res.json({ success: true, data: videos });
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Failed to fetch videos' : error.message 
    });
  }
});

// Get single video by ID
app.get('/api/events/videos/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const videoId = parseInt(id);
    if (isNaN(videoId) || videoId <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid video ID' 
      });
    }
    const video = await Database.getEventVideoById(videoId);
    if (!video) {
      return res.status(404).json({ 
        success: false, 
        message: 'Video not found' 
      });
    }
    res.json({ success: true, data: video });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Failed to fetch video' : error.message 
    });
  }
});

app.post('/api/events/:id/videos', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { video_url, title, description } = req.body;
    
    if (!video_url || typeof video_url !== 'string' || video_url.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid video URL is required' 
      });
    }
    
    if (video_url.length > 500) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video URL must be 500 characters or less' 
      });
    }
    
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video title is required' 
      });
    }
    
    if (title.length > 255) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video title must be 255 characters or less' 
      });
    }
    
    const eventId = parseInt(id);
    if (isNaN(eventId) || eventId <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid event ID' 
      });
    }
    
    const videoId = await Database.createEventVideo({
      event_id: eventId,
      video_url: video_url.trim(),
      title: title.trim(),
      description: description && typeof description === 'string' ? description.trim() : ''
    });
    
    res.json({ 
      success: true, 
      message: 'Video added', 
      id: videoId 
    });
  } catch (error) {
    console.error('Add video error:', error);
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Failed to add video' : error.message 
    });
  }
});

app.put('/api/events/videos/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { video_url, title, description } = req.body;
    
    const videoId = parseInt(id);
    if (isNaN(videoId) || videoId <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid video ID' 
      });
    }
    
    if (!video_url || typeof video_url !== 'string' || video_url.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid video URL is required' 
      });
    }
    
    if (video_url.length > 500) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video URL must be 500 characters or less' 
      });
    }
    
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video title is required' 
      });
    }
    
    if (title.length > 255) {
      return res.status(400).json({ 
        success: false, 
        message: 'Video title must be 255 characters or less' 
      });
    }
    
    await Database.updateEventVideo(videoId, {
      video_url: video_url.trim(),
      title: title.trim(),
      description: description && typeof description === 'string' ? description.trim() : ''
    });
    
    res.json({ 
      success: true, 
      message: 'Video updated' 
    });
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Failed to update video' : error.message 
    });
  }
});

// Delete video
app.delete('/api/events/videos/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const videoId = parseInt(id);
    if (isNaN(videoId) || videoId <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid video ID' 
      });
    }
    await Database.deleteEventVideo(videoId);
    res.json({ success: true, message: 'Video deleted' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Failed to delete video' : error.message 
    });
  }
});



// Toggle event featured status
app.patch('/api/events/toggle-featured/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Database.getEventById(id);
    
    if (!event) {
      return res.status(404).json({ 
        success: false, 
        message: 'Event not found' 
      });
    }
    
    await Database.update('events', id, { 
      is_featured: !event.is_featured 
    });
    
    res.json({ 
      success: true, 
      is_featured: !event.is_featured 
    });
  } catch (error) {
    console.error('Toggle featured error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

//   CONFIRM PAYMENT FOR EVENT REGISTRATION
app.post('/api/admin/event-registrations/:registrationId/confirm', verifyAdmin, async (req, res) => {
  try {
    const { registrationId } = req.params;
    
    console.log('  Confirming payment for:', registrationId);
    
    // Update payment_confirmed status
    const updateSql = `
      UPDATE event_registrations 
      SET payment_confirmed = 1, 
          payment_confirmed_at = NOW()
      WHERE registration_id = ?
    `;
    
    await Database.query(updateSql, [registrationId]);
    
    // Get registration details for email
    const regSql = `
      SELECT er.*, e.title as event_title, e.event_date, e.location
      FROM event_registrations er
      LEFT JOIN events e ON er.event_id = e.id
      WHERE er.registration_id = ?
    `;
    
    const [registration] = await Database.query(regSql, [registrationId]);
    
    if (!registration) {
      return res.status(404).json({ 
        success: false, 
        message: 'Registration not found' 
      });
    }
    
 
    
    console.log(' Payment confirmed successfully');
    
    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      data: registration
    });
    
  } catch (error) {
    console.error('  Error confirming payment:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});





// EVENT REGISTRATION ROUTES

app.post('/api/event-register', async (req, res) => {
  try {
    const { 
      event_id, eventid,  
      full_name, fullname,
      email, 
      phone, 
      company_name, companyname,
      designation, 
      num_participants, numparticipants,
      special_requirements, specialrequirements,
      coupon_code, couponcode 
    } = req.body;
    
    const finalEventId = event_id || eventid;
    const finalFullName = full_name || fullname;
    const finalCompanyName = company_name || companyname;
    const finalNumParticipants = num_participants || numparticipants || 1;
    const finalSpecialReqs = special_requirements || specialrequirements || '';
    const finalCouponCode = coupon_code || couponcode;
    
    if (!finalEventId || !finalFullName || !email || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: event_id, full_name, email, phone' 
      });
    }
    
    // Get event 
    const event = await Database.getById('events', finalEventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Create registration 
    const registration = await Database.createEventRegistration({
      event_id: finalEventId,
      event_title: event.title,
      event_date: event.event_date,
      full_name: finalFullName,
      email: email.toLowerCase(),
      phone,
      company_name: finalCompanyName || '',
      designation: designation || '',
      num_participants: finalNumParticipants,
      special_requirements: finalSpecialReqs,
      is_paid_event: event.registration_fee > 0,
      payment_status: event.registration_fee > 0 ? 'pending' : 'free'
    });
    
    // Update coupon usage
    if (finalCouponCode) {
      try {
        const coupon = await Database.getCouponByCode(finalCouponCode);
        if (coupon) {
          await Database.query(
            'UPDATE coupons SET usedCount = usedCount + 1 WHERE id = ?',
            [coupon.id]
          );
        }
      } catch (err) {
        console.error('Coupon update failed:', err);
      }
    }
    
    console.log(' Registration created:', registration.registration_id);
    res.json({
      success: true,
      message: 'Registration successful',
      data: {
        registration_id: registration.registration_id,
        qr_code: registration.qr_code,
        email: registration.email,
        event_title: event.title,
        payment_link: event.payment_link || null
      }
    });
  } catch (error) {
    console.error('  Event registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});



// ADMIN: EVENT REGISTRATIONS MANAGEMENT


app.get('/api/admin/event-registrations/:eventId', verifyAdmin, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    console.log(' Admin fetching registrations for Event ID:', eventId);
    
    // Get event 
    const event = await Database.getById('events', eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Get all registrations 
    const allRegistrations = await Database.getAllEventRegistrations();
    const eventRegistrations = allRegistrations.filter(reg => reg.event_id == eventId);
    
    // Calculate stats
    const stats = {
      total: eventRegistrations.length,
      confirmed: eventRegistrations.filter(r => r.payment_confirmed).length,
      pending: eventRegistrations.filter(r => !r.payment_confirmed).length,
      totalParticipants: eventRegistrations.reduce((sum, r) => sum + (parseInt(r.num_participants) || 1), 0),
      attended: eventRegistrations.filter(r => r.attendance_status === 'present').length
    };
    
    console.log(` MySQL: Found ${eventRegistrations.length} registrations for ${event.title}`);
    res.json({
      success: true,
      data: {
        event: {
          id: event.id,
          title: event.title,
          eventdate: event.eventdate,
          location: event.location,
          eventtype: event.eventtype
        },
        registrations: eventRegistrations,
        stats
      }
    });
  } catch (error) {
    console.error('  Error fetching registrations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registrations' });
  }
});


// Mark attendance for a registration
app.patch('/api/admin/event-registrations/:id/attendance', verifyAdmin, async (req, res) => {
  try {
    const registrationId = req.params.id;
    const { status } = req.body;
    
    console.log(' Marking attendance:', registrationId, status);
    
    if (!['present', 'absent', 'no-show'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: present, absent, or no-show'
      });
    }
    
    // Update in MySQL
    await Database.query(
      `UPDATE event_registrations 
       SET attendance_status = ?, 
           attendance_marked_at = NOW(),
           attendance_marked_by = ?
       WHERE registration_id = ?`,
      [status, req.admin.email, registrationId]
    );
    
    // Get updated registration
    const updated = await Database.query(
      'SELECT * FROM event_registrations WHERE registration_id = ?',
      [registrationId]
    );
    
    console.log(' MySQL: Attendance marked:', registrationId, status);
    res.json({
      success: true,
      message: 'Attendance marked successfully',
      data: updated[0]
    });
  } catch (error) {
    console.error('  Error marking attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to mark attendance' });
  }
});

app.delete('/api/admin/event-registrations/:id', verifyAdmin, async (req, res) => {
  try {
    const registrationId = req.params.id;
    console.log('Deleting registration:', registrationId);
    
    // Delete from MySQL
    const result = await Database.query(
      'DELETE FROM event_registrations WHERE registration_id = ?',
      [registrationId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }
    
    console.log(' MySQL: Registration deleted:', registrationId);
    res.json({ success: true, message: 'Registration deleted successfully' });
  } catch (error) {
    console.error('  Error deleting registration:', error);
    res.status(500).json({ success: false, message: 'Failed to delete registration' });
  }
});



//  GET ALL EVENT REGISTRATIONS
app.get('/api/admin/all-event-registrations', verifyAdmin, async (req, res) => {
  try {
    console.log('  Admin: Fetching all event registrations from MySQL');
    
    // IMPROVED QUERY: JOIN with events table to get event_title
    const sql = `
      SELECT 
        er.*,
        e.title as event_title,
        e.registration_fee
      FROM event_registrations er
      LEFT JOIN events e ON er.event_id = e.id
      ORDER BY er.registered_at DESC
    `;
    
    const registrations = await Database.query(sql);
    
    console.log(`  Found ${registrations.length} registrations`);
    
  
    res.json({
      success: true,
      data: registrations,  
      total: registrations.length
    });
    
  } catch (error) {
    console.error('  Error fetching registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch registrations: ' + error.message 
    });
  }
});








// ADVISORY/ADVISORS ROUTES

app.post('/api/advisory/create', verifyAdmin, advisorUpload, async (req, res) => {
  try {
    const { name, designation, bio, initials, color_scheme, order_index } = req.body;
    
    if (!name || !designation) {
      return res.status(400).json({ success: false, message: 'Name and designation required' });
    }
    
    const id = await Database.createAdvisor({
      name: name.trim(),
      designation: designation.trim(),
      bio: bio?.trim() || '',
      initials: initials?.trim() || name.substring(0, 2).toUpperCase(),
      color_scheme: color_scheme || 'blue-600',
      photo_url: req.file ? `/uploads/advisors/${req.file.filename}` : '',
      order_index: parseInt(order_index) || 0,
      is_featured: true,
      is_active: true
    });
    
    res.json({ success: true, message: 'Advisor created successfully', id });
  } catch (error) {
    console.error('Create advisor error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// ADVISORS UPDATE
app.put('/api/advisory/update/:id', verifyAdmin, advisorUpload, async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.photo_url = `/uploads/advisors/${req.file.filename}`;
    }
    
    const success = await Database.updateAdvisor(req.params.id, data);
    res.json(success ? { success: true, message: 'Advisor updated' } : { success: false, message: 'Advisor not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ADVISORS DELETE
app.delete('/api/advisory/delete/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.deleteAdvisor(req.params.id);
    res.json({ success: true, message: 'Advisor deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/advisory/toggle-featured/:id', verifyAdmin, async (req, res) => {
    try {
        await Database.toggleAdvisorFeatured(req.params.id);
        res.json({ success: true, message: 'Featured status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// COMMITTEE ROUTES (public)
app.get('/api/committees', async (req, res) => {
  try {
    const committees = await Database.getAllCommittees(true);
    res.json({ success: true, data: committees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Committees with members (for list pages - must be before /:id)
app.get('/api/committees/with-members', async (req, res) => {
  try {
    const committees = await Database.getAllCommittees(true);
    const withMembers = await Promise.all(committees.map(async (c) => {
      const [leaders, subleaders] = await Promise.all([
        Database.getCommitteeLeaders(c.id),
        Database.getCommitteeSubleaders(c.id)
      ]);
      return { ...c, leaders: leaders || [], subleaders: subleaders || [] };
    }));
    res.json({ success: true, data: withMembers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Nested routes first so :id doesn't capture "id/leaders"
app.get('/api/committees/:id/leaders', async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    const leaders = await Database.getCommitteeLeaders(id);
    res.json({ success: true, data: leaders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/committees/:id/subleaders', async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    const subleaders = await Database.getCommitteeSubleaders(id);
    res.json({ success: true, data: subleaders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/committees/:id', async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    const committee = await Database.getCommitteeById(id);
    if (!committee || !committee.is_active) {
      return res.status(404).json({ success: false, message: 'Committee not found' });
    }
    const [leaders, subleaders] = await Promise.all([
      Database.getCommitteeLeaders(id),
      Database.getCommitteeSubleaders(id)
    ]);
    res.json({ success: true, data: { ...committee, leaders, subleaders } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// COMMITTEE ROUTES (admin)
app.get('/api/committees/admin/all', verifyAdmin, async (req, res) => {
  try {
    const committees = await Database.getAllCommittees(false);
    res.json({ success: true, data: committees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sanitize apply_link: only allow relative path or https? URL (prevent javascript: etc)
function sanitizeApplyLink(link) {
  const s = (link && typeof link === 'string') ? link.trim() : '';
  if (!s) return '/membership';
  if (s.length > 500) return '/membership';
  const lower = s.toLowerCase();
  if (lower === '#' || lower.startsWith('javascript:') || lower.startsWith('data:')) return '/membership';
  if (s.startsWith('/')) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return '/' + s.replace(/^\/+/, '');
}

function parseCommitteeId(id) {
  const n = parseInt(id, 10);
  return (n > 0 && n <= 2147483647) ? n : null;
}

app.post('/api/committees/create', verifyAdmin, committeeUpload, async (req, res) => {
  try {
    const { name, overview, apply_link, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Committee name is required' });
    }
    const id = await Database.createCommittee({
      name: name.trim().substring(0, 255),
      photo_url: req.file ? `/uploads/committees/${req.file.filename}` : '',
      overview: (overview && overview.trim()) ? overview.trim().substring(0, 65535) : '',
      apply_link: sanitizeApplyLink(apply_link),
      order_index: parseInt(order_index, 10) || 0,
      is_active: true
    });
    res.json({ success: true, message: 'Committee created', id });
  } catch (error) {
    console.error('Create committee error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/committees/update/:id', verifyAdmin, committeeUpload, async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    const data = { ...req.body };
    if (req.file) data.photo_url = `/uploads/committees/${req.file.filename}`;
    if (data.apply_link !== undefined) data.apply_link = sanitizeApplyLink(data.apply_link);
    await Database.updateCommittee(id, data);
    res.json({ success: true, message: 'Committee updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/committees/delete/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    await Database.deleteCommittee(id);
    res.json({ success: true, message: 'Committee deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/committees/:id/leaders', verifyAdmin, committeeLeaderUpload, async (req, res) => {
  try {
    const committeeId = parseCommitteeId(req.params.id);
    if (!committeeId) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    const { name, position, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Leader name is required' });
    }
    const id = await Database.createCommitteeLeader({
      committee_id: committeeId,
      name: name.trim().substring(0, 255),
      position: (position && position.trim()) ? position.trim().substring(0, 255) : '',
      photo_url: req.file ? `/uploads/committee-leaders/${req.file.filename}` : '',
      order_index: parseInt(order_index, 10) || 0
    });
    res.json({ success: true, message: 'Leader added', id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/committees/leaders/:leaderId', verifyAdmin, committeeLeaderUpload, async (req, res) => {
  try {
    const leaderId = parseCommitteeId(req.params.leaderId);
    if (!leaderId) return res.status(400).json({ success: false, message: 'Invalid leader id' });
    const data = { ...req.body };
    if (req.file) data.photo_url = `/uploads/committee-leaders/${req.file.filename}`;
    await Database.updateCommitteeLeader(leaderId, data);
    res.json({ success: true, message: 'Leader updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/committees/leaders/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
    await Database.deleteCommitteeLeader(id);
    res.json({ success: true, message: 'Leader deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/committees/:id/subleaders', verifyAdmin, committeeLeaderUpload, async (req, res) => {
  try {
    const committeeId = parseCommitteeId(req.params.id);
    if (!committeeId) return res.status(400).json({ success: false, message: 'Invalid committee id' });
    const { name, position, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Subleader name is required' });
    }
    const id = await Database.createCommitteeSubleader({
      committee_id: committeeId,
      name: name.trim().substring(0, 255),
      position: (position && position.trim()) ? position.trim().substring(0, 255) : '',
      photo_url: req.file ? `/uploads/committee-leaders/${req.file.filename}` : '',
      order_index: parseInt(order_index, 10) || 0
    });
    res.json({ success: true, message: 'Subleader added', id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/committees/subleaders/:leaderId', verifyAdmin, committeeLeaderUpload, async (req, res) => {
  try {
    const leaderId = parseCommitteeId(req.params.leaderId);
    if (!leaderId) return res.status(400).json({ success: false, message: 'Invalid leader id' });
    const data = { ...req.body };
    if (req.file) data.photo_url = `/uploads/committee-leaders/${req.file.filename}`;
    await Database.updateCommitteeSubleader(leaderId, data);
    res.json({ success: true, message: 'Subleader updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/committees/subleaders/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseCommitteeId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
    await Database.deleteCommitteeSubleader(id);
    res.json({ success: true, message: 'Subleader deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

function parseChapterId(id) {
  const n = parseInt(id, 10);
  return (n > 0 && n <= 2147483647) ? n : null;
}

// CHAPTER ROUTES (public)
app.get('/api/chapters', async (req, res) => {
  try {
    const chapters = await Database.getAllChapters(true);
    res.json({ success: true, data: chapters });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/chapters/with-members', async (req, res) => {
  try {
    const chapters = await Database.getAllChapters(true);
    const withMembers = await Promise.all(chapters.map(async (c) => {
      const [leaders, subleaders] = await Promise.all([
        Database.getChapterLeaders(c.id),
        Database.getChapterSubleaders(c.id)
      ]);
      return { ...c, leaders: leaders || [], subleaders: subleaders || [] };
    }));
    res.json({ success: true, data: withMembers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/chapters/:id/leaders', async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    const leaders = await Database.getChapterLeaders(id);
    res.json({ success: true, data: leaders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/chapters/:id/subleaders', async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    const subleaders = await Database.getChapterSubleaders(id);
    res.json({ success: true, data: subleaders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/chapters/:id', async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    const chapter = await Database.getChapterById(id);
    if (!chapter || !chapter.is_active) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }
    const [leaders, subleaders] = await Promise.all([
      Database.getChapterLeaders(id),
      Database.getChapterSubleaders(id)
    ]);
    res.json({ success: true, data: { ...chapter, leaders, subleaders } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// CHAPTER ROUTES (admin)
app.get('/api/chapters/admin/all', verifyAdmin, async (req, res) => {
  try {
    const chapters = await Database.getAllChapters(false);
    res.json({ success: true, data: chapters });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/chapters/create', verifyAdmin, chapterUpload, async (req, res) => {
  try {
    const { name, overview, apply_link, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Chapter name is required' });
    }
    const id = await Database.createChapter({
      name: name.trim().substring(0, 255),
      photo_url: req.file ? `/uploads/chapters/${req.file.filename}` : '',
      overview: (overview && overview.trim()) ? overview.trim().substring(0, 65535) : '',
      apply_link: sanitizeApplyLink(apply_link),
      order_index: parseInt(order_index, 10) || 0,
      is_active: true
    });
    res.json({ success: true, message: 'Chapter created', id });
  } catch (error) {
    console.error('Create chapter error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/chapters/update/:id', verifyAdmin, chapterUpload, async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    const data = { ...req.body };
    if (req.file) data.photo_url = `/uploads/chapters/${req.file.filename}`;
    if (data.apply_link !== undefined) data.apply_link = sanitizeApplyLink(data.apply_link);
    await Database.updateChapter(id, data);
    res.json({ success: true, message: 'Chapter updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/chapters/delete/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    await Database.deleteChapter(id);
    res.json({ success: true, message: 'Chapter deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/chapters/:id/leaders', verifyAdmin, chapterLeaderUpload, async (req, res) => {
  try {
    const chapterId = parseChapterId(req.params.id);
    if (!chapterId) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    const { name, position, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Leader name is required' });
    }
    const id = await Database.createChapterLeader({
      chapter_id: chapterId,
      name: name.trim().substring(0, 255),
      position: (position && position.trim()) ? position.trim().substring(0, 255) : '',
      photo_url: req.file ? `/uploads/chapter-leaders/${req.file.filename}` : '',
      order_index: parseInt(order_index, 10) || 0
    });
    res.json({ success: true, message: 'Leader added', id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/chapters/leaders/:leaderId', verifyAdmin, chapterLeaderUpload, async (req, res) => {
  try {
    const leaderId = parseChapterId(req.params.leaderId);
    if (!leaderId) return res.status(400).json({ success: false, message: 'Invalid leader id' });
    const data = { ...req.body };
    if (req.file) data.photo_url = `/uploads/chapter-leaders/${req.file.filename}`;
    await Database.updateChapterLeader(leaderId, data);
    res.json({ success: true, message: 'Leader updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/chapters/leaders/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
    await Database.deleteChapterLeader(id);
    res.json({ success: true, message: 'Leader deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/chapters/:id/subleaders', verifyAdmin, chapterLeaderUpload, async (req, res) => {
  try {
    const chapterId = parseChapterId(req.params.id);
    if (!chapterId) return res.status(400).json({ success: false, message: 'Invalid chapter id' });
    const { name, position, order_index } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Subleader name is required' });
    }
    const id = await Database.createChapterSubleader({
      chapter_id: chapterId,
      name: name.trim().substring(0, 255),
      position: (position && position.trim()) ? position.trim().substring(0, 255) : '',
      photo_url: req.file ? `/uploads/chapter-leaders/${req.file.filename}` : '',
      order_index: parseInt(order_index, 10) || 0
    });
    res.json({ success: true, message: 'Subleader added', id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/chapters/subleaders/:leaderId', verifyAdmin, chapterLeaderUpload, async (req, res) => {
  try {
    const leaderId = parseChapterId(req.params.leaderId);
    if (!leaderId) return res.status(400).json({ success: false, message: 'Invalid leader id' });
    const data = { ...req.body };
    if (req.file) data.photo_url = `/uploads/chapter-leaders/${req.file.filename}`;
    await Database.updateChapterSubleader(leaderId, data);
    res.json({ success: true, message: 'Subleader updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/chapters/subleaders/:id', verifyAdmin, async (req, res) => {
  try {
    const id = parseChapterId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });
    await Database.deleteChapterSubleader(id);
    res.json({ success: true, message: 'Subleader deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// NEWS ROUTES

function validateNewsSourceLink(url, linkName) {
  const u = (url && typeof url === 'string') ? url.trim() : '';
  const name = (linkName && typeof linkName === 'string') ? linkName.trim().substring(0, 255) : '';
  if (!u) return { source_link_url: null, source_link_name: null };
  if (u.length > 500) return { source_link_url: null, source_link_name: null };
  const lower = u.toLowerCase();
  if (lower !== 'http://' && lower !== 'https://' && (lower.startsWith('http://') || lower.startsWith('https://'))) {
    return { source_link_url: u, source_link_name: name || null };
  }
  return { source_link_url: null, source_link_name: null };
}

app.get('/api/news', async (req, res) => {
  try {
    const news = await Database.getAllNews();
    res.json({ success: true, data: news.filter(n => n.is_active) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.get('/api/news/admin/all', verifyAdmin, async (req, res) => {
  try {
    const news = await Database.getAllNews();
    res.json({ success: true, data: news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.post('/api/news/create', verifyAdmin, newsUpload, async (req, res) => {
  try {
    const { title, content, published_date, order_index, source_link_url, source_link_name } = req.body;

    if (!title || !content || !published_date) {
      return res.status(400).json({ success: false, message: 'Title, content, and published date are required' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Photo is required' });
    }

    const linkData = validateNewsSourceLink(source_link_url, source_link_name);

    const id = await Database.createNews({
      title: title.trim(),
      content: content.trim(),
      photo_url: `/uploads/news/${req.file.filename}`,
      published_date: published_date,
      order_index: parseInt(order_index, 10) || 0,
      source_link_url: linkData.source_link_url,
      source_link_name: linkData.source_link_name,
      is_active: true
    });
    
    res.json({ success: true, message: 'News created successfully', id });
  } catch (error) {
    console.error('Create news error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update news
app.put('/api/news/update/:id', verifyAdmin, newsUpload, async (req, res) => {
  try {
    const linkData = validateNewsSourceLink(req.body.source_link_url, req.body.source_link_name);
    const allowed = ['title', 'content', 'published_date', 'order_index', 'source_link_url', 'source_link_name'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    data.source_link_url = linkData.source_link_url;
    data.source_link_name = linkData.source_link_name;
    if (req.body.order_index !== undefined) data.order_index = parseInt(req.body.order_index, 10) || 0;
    if (req.file) {
      data.photo_url = `/uploads/news/${req.file.filename}`;
    }

    const success = await Database.updateNews(req.params.id, data);
    res.json(success ? { success: true, message: 'News updated' } : { success: false, message: 'News not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete news
app.delete('/api/news/delete/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.deleteNews(req.params.id);
    res.json({ success: true, message: 'News deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.patch('/api/news/toggle-active/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.toggleNewsActive(req.params.id);
    res.json({ success: true, message: 'News status updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// TESTIMONIALS ROUTES


app.get('/api/testimonials', async (req, res) => {
  try {
    const testimonials = await Database.getAllTestimonials();
    res.json({ success: true, data: testimonials.filter(t => t.is_active) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


app.get('/api/testimonials/admin/all', verifyAdmin, async (req, res) => {
  try {
    const testimonials = await Database.getAllTestimonials();
    res.json({ success: true, data: testimonials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create testimonial
app.post('/api/testimonials/create', verifyAdmin, testimonialsUpload, async (req, res) => {
  try {
    const { heading, paragraph, order_index } = req.body;
    
    if (!heading || !paragraph) {
      return res.status(400).json({ success: false, message: 'Heading and paragraph are required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Photo is required' });
    }
    
    const id = await Database.createTestimonial({
      heading: heading.trim(),
      paragraph: paragraph.trim(),
      photo_url: `/uploads/testimonials/${req.file.filename}`,
      order_index: parseInt(order_index) || 0,
      is_active: true
    });
    
    res.json({ success: true, message: 'Testimonial created successfully', id });
  } catch (error) {
    console.error('Create testimonial error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update testimonial
app.put('/api/testimonials/update/:id', verifyAdmin, testimonialsUpload, async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.photo_url = `/uploads/testimonials/${req.file.filename}`;
    }
    
    const success = await Database.updateTestimonial(req.params.id, data);
    res.json(success ? { success: true, message: 'Testimonial updated' } : { success: false, message: 'Testimonial not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete testimonial
app.delete('/api/testimonials/delete/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.deleteTestimonial(req.params.id);
    res.json({ success: true, message: 'Testimonial deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle testimonial active status
app.patch('/api/testimonials/toggle-active/:id', verifyAdmin, async (req, res) => {
  try {
    await Database.toggleTestimonialActive(req.params.id);
    res.json({ success: true, message: 'Testimonial status updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// HELPER: GENERATE SEQUENTIAL MEMBER ID

async function generateSequentialMemberId(category) {
  try {
    const applications = await Database.getAll('membership_applications');
    
    const categoryPrefixes = {
      'micro': 'MI',
      'small': 'SM',
      'medium': 'MD',
      'listed': 'LI'
    };
    
    const prefix = categoryPrefixes[category.toLowerCase()] || 'GN';
    const basePattern = `CIMSME-${prefix}`;
    
    const categoryMembers = applications.filter(app => 
      app.memberid && app.memberid.startsWith(basePattern)
    );
    
    const numbers = categoryMembers.map(app => {
      const match = app.memberid.match(/\d+$/);
      return match ? parseInt(match[0]) : 0;
    });
    
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1001;
    const paddedNumber = nextNumber.toString().padStart(4, '0');
    
    const newMemberId = `${basePattern}${paddedNumber}`;
    
    console.log(`🆔 Generated: ${newMemberId} for ${category}`);
    return newMemberId;
  } catch (error) {
    console.error('  Member ID error:', error);
    const timestamp = Date.now().toString().slice(-6);
    return `CIMSME-GN${timestamp}`;
  }
}



// Get membership benefits (Public)
app.get('/api/membership/benefits', async (req, res) => {
  try {
    const benefits = await Database.getAll('membership_benefits');
    const activeBenefits = benefits
      .filter(b => b.is_active)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    res.json({ success: true, data: activeBenefits });
  } catch (error) {
    console.error('Get benefits error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});




app.get('/api/membership/stats', async (req, res) => {
  try {
    const applications = await Database.getAll('membership_applications');
    
    const stats = {
      totalMembers: applications.filter(a => a.status === 'approved').length,
      pendingApplications: applications.filter(a => a.status === 'pending').length,
      totalApplications: applications.length,
      activeMembers: applications.filter(a => a.status === 'approved').length
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/membership/apply', membershipLimiter, async (req, res) => {
  try {
    const {
      fullName, businessName, email, phone, password,
      businessCategory, businessType, subBusinessCategory, annualTurnover,
      state, pincode, city, yearsInBusiness, businessAddress,
      gstregistered, gsttype, membershipType, udyamRegistrationNumber,
      interestedCommitteeId
    } = req.body;

    const trim = (s) => (s == null ? '' : String(s).trim());
    const fullNameT = trim(fullName);
    const businessNameT = trim(businessName);
    const emailT = trim(email).toLowerCase();
    const phoneT = trim(phone);
    const stateT = trim(state);
    const cityT = trim(city);
    const pincodeT = trim(pincode);
    const businessAddressT = trim(businessAddress);
    const membershipTypeT = trim(membershipType).toLowerCase() || 'annual';

    if (!fullNameT) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }
    if (!businessNameT) {
      return res.status(400).json({ success: false, message: 'Business name is required' });
    }
    if (!emailT) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailT)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (!phoneT) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }
    if (!/^[0-9]{10}$/.test(phoneT)) {
      return res.status(400).json({ success: false, message: 'Phone must be 10 digits' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const validCategories = ['micro', 'small', 'medium', 'listed'];
    if (!businessCategory || !validCategories.includes(trim(businessCategory).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Please select a valid business category' });
    }
    if (!trim(businessType)) {
      return res.status(400).json({ success: false, message: 'Business type is required' });
    }
    if (!trim(subBusinessCategory)) {
      return res.status(400).json({ success: false, message: 'Sub business category is required' });
    }
    const validMembershipTypes = ['annual', 'startup', 'lifetime', 'patron'];
    if (!validMembershipTypes.includes(membershipTypeT)) {
      return res.status(400).json({ success: false, message: 'Please select a valid membership type' });
    }
    if (membershipTypeT === 'annual' && !trim(annualTurnover)) {
      return res.status(400).json({ success: false, message: 'Annual turnover range is required for annual membership' });
    }
    if (!pincodeT || !/^[0-9]{6}$/.test(pincodeT)) {
      return res.status(400).json({ success: false, message: 'Pincode must be 6 digits' });
    }
    if (!stateT) {
      return res.status(400).json({ success: false, message: 'State is required' });
    }
    if (!cityT) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }
    if (!trim(yearsInBusiness)) {
      return res.status(400).json({ success: false, message: 'Years in business is required' });
    }
    if (!businessAddressT) {
      return res.status(400).json({ success: false, message: 'Business address is required' });
    }
    const udyamResult = normalizeAndValidateUdyam(udyamRegistrationNumber);
    if (!udyamResult.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Udyam Registration Number. Use format UDYAM-XX-XX-XXXXXXX (e.g. UDYAM-MH-01-0001234) or legacy 12-character format.'
      });
    }

    let interestedCommunityName = null;
    const interestedCommitteeIdT = trim(interestedCommitteeId);
    if (interestedCommitteeIdT) {
      const committeeId = parseInt(interestedCommitteeIdT, 10);
      if (Number.isInteger(committeeId) && committeeId > 0) {
        const committee = await Database.getCommitteeById(committeeId);
        if (committee && committee.is_active) {
          interestedCommunityName = (committee.name || '').trim() || null;
        }
      }
    }

    const existingMember = await Database.query(
      'SELECT id FROM membership_applications WHERE email = ? LIMIT 1',
      [emailT]
    );
    if (existingMember.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered. Please login or use a different email.'
      });
    }

    const year = new Date().getFullYear();
    const nextSerial = await Database.getNextMemberSerialForYear(year);
    const memberId = `CIMSME${year}${String(nextSerial).padStart(MEMBER_ID_SERIAL_PAD_LENGTH, '0')}`;
    const hashedPassword = await bcrypt.hash(password, 12);
    const businessCategoryL = trim(businessCategory).toLowerCase();
    const fee = getMembershipFeeServer(membershipTypeT, businessCategoryL, annualTurnover);

    const applicationData = {
      memberid: memberId,
      fullname: fullNameT,
      businessname: businessNameT,
      email: emailT,
      phone: phoneT,
      password: hashedPassword,
      businesscategory: businessCategoryL,
      businesstype: trim(businessType) || 'other',
      subbusinesscategory: trim(subBusinessCategory) || '',
      annualturnover: fee,
      state: stateT,
      pincode: pincodeT,
      city: cityT,
      yearsinbusiness: trim(yearsInBusiness) || '0-1',
      udyamregistrationnumber: udyamResult.value,
      businessaddress: businessAddressT,
      gstregistered: gstregistered === 'yes' || gstregistered === true,
      gsttype: trim(gsttype) || '',
      membershipfee: fee,
      originalfee: fee,
      finalamount: fee,
      membershiptype: membershipTypeT,
      status: 'pending',
      payment_status: 'pending',
      interested_community: interestedCommunityName
    };

    const savedId = await Database.create('membership_applications', applicationData);
    const savedRecord = { ...applicationData, id: savedId, memberid: memberId };
    sendMembershipApplicationEmail(savedRecord, fee).catch((err) => {
      if (isDevelopment) console.error('Membership email error:', err.message);
    });

    if (fee > 0) {
      try {
        const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await Database.createPaymentOrder({
          order_id: orderId,
          amount: fee,
          currency: 'INR',
          customer_name: fullNameT,
          customer_email: emailT,
          customer_phone: phoneT,
          membership_data: {
            memberId,
            applicationId: savedId,
            businessCategory: businessCategoryL,
            email: emailT,
            finalAmount: fee
          }
        });

        const cashfreeRequest = {
          order_amount: fee,
          order_currency: 'INR',
          order_id: orderId,
          customer_details: {
            customer_id: memberId.replace(/-/g, '_'),
            customer_name: fullNameT,
            customer_email: emailT,
            customer_phone: phoneT
          },
          order_meta: {
            return_url: `${getBaseUrl(req)}/payment-status?orderId=${orderId}`,
            notify_url: `${getBaseUrl(req)}/api/payment/webhook`
          }
        };

        const cashfreeResponse = await axios.post(
          `${cashfreeConfig.baseURL}/orders`,
          cashfreeRequest,
          { headers: getCashfreeHeaders(), timeout: 15000 }
        );

        await Database.updatePaymentOrder(
          orderId,
          cashfreeResponse.data.cf_order_id,
          cashfreeResponse.data.payment_session_id
        );
        await Database.query(
          'UPDATE membership_applications SET order_id = ? WHERE id = ?',
          [orderId, savedId]
        );

        return res.json({
          success: true,
          message: 'Application submitted. Please complete payment.',
          memberId,
          requiresPayment: true,
          paymentSessionId: cashfreeResponse.data.payment_session_id,
          orderId,
          data: {
            id: savedId,
            memberId,
            email: emailT,
            businessCategory: businessCategoryL,
            city: cityT,
            state: stateT,
            finalAmount: fee,
            status: 'pending',
            paymentStatus: 'pending'
          }
        });
            } catch (paymentError) {
        const msg = paymentError.response?.data?.message || paymentError.message;
        const code = paymentError.response?.data?.code || paymentError.response?.status;
        console.error('Membership apply: payment step failed', { message: msg, code, memberId });
        return res.status(200).json({
          success: false,
          message: `Application saved but payment could not be started. Please contact support with your Member ID: ${memberId} to complete payment.`,
          memberId,
          applicationSaved: true
        });
      }


    }

    await Database.update('membership_applications', savedId, {
      status: 'approved',
      payment_status: 'paid',
      approveddate: getMySQLDateTime()
    });
    return res.json({
      success: true,
      message: 'Membership activated successfully.',
      memberId,
      requiresPayment: false,
      data: {
        id: savedId,
        memberId,
        email: emailT,
        businessCategory: businessCategoryL,
        city: cityT,
        state: stateT,
        status: 'approved',
        paymentStatus: 'paid'
      }
    });
  } catch (error) {
    if (isDevelopment) console.error('Membership apply error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Application submission failed. Please try again.'
    });
  }
});


// MEMBERSHIP ADMIN ROUTES 

app.get('/api/admin/membership/benefits', verifyAdmin, async (req, res) => {
  try {
    
    const benefits = await Database.getAll('membership_benefits');

    // Sort by order_index ascending
    const sortedBenefits = benefits.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    console.log(`Fetched ${sortedBenefits.length} membership benefits`);
    res.json({ success: true, data: sortedBenefits });
  } catch (error) {
    console.error('  Get benefits admin error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
app.post('/api/membership/benefits', verifyAdmin, async (req, res) => {
  try {
    const { title, description, icon, gradient_color, category, order_index, is_active } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description required' });
    }

    const benefitData = {
      title: title.trim(),
      description: description.trim(),
      icon: icon || '✓',
      gradient_color: gradient_color || 'linear-gradient(135deg, #6B7280 0%, #1F2937 100%)',
      category: category || 'general',
      order_index: parseInt(order_index) || 0,
      is_active: is_active !== undefined ? is_active : true
    };

    const id = await Database.create('membership_benefits', benefitData);

    console.log(' Benefit created:', id);
    res.json({ success: true, message: 'Benefit created successfully', id });
  } catch (error) {
    console.error('  Create benefit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.put('/api/membership/benefits/:id', verifyAdmin, async (req, res) => {
  try {
    const { title, description, icon, gradient_color, category, order_index, is_active } = req.body;
    const data = {};

    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (icon !== undefined) data.icon = icon;
    if (gradient_color !== undefined) data.gradient_color = gradient_color;
    if (category !== undefined) data.category = category;
    if (order_index !== undefined) data.order_index = parseInt(order_index);
    if (is_active !== undefined) data.is_active = is_active;

    data.updated_at = new Date().toISOString();

    const success = await Database.update('membership_benefits', req.params.id, data);

    if (success) {
      console.log(' Benefit updated:', req.params.id);
      res.json({ success: true, message: 'Benefit updated successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Benefit not found' });
    }
  } catch (error) {
    console.error('  Update benefit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Admin: Delete benefit
app.delete('/api/membership/benefits/:id', verifyAdmin, async (req, res) => {
  try {
    const success = await Database.delete('membership_benefits', req.params.id);

    if (success) {
      console.log(' Benefit deleted:', req.params.id);
      res.json({ success: true, message: 'Benefit deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Benefit not found' });
    }
  } catch (error) {
    console.error('  Delete benefit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Create story (Admin)


app.post('/api/membership/stories', verifyAdmin, storyUpload, async (req, res) => {
  try {
    const { name, businesstype, location, testimonial, achievement, avatar_color, display_order, is_featured, is_active } = req.body;
    
    if (!name || !testimonial) {
      return res.status(400).json({ success: false, message: 'Name and testimonial required' });
    }
    
    const initials = name.trim().split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    
    const storyData = {
      name: name.trim(),
      initials,
      business_type: businesstype || 'Business', 
      location: location || 'India',
      testimonial: testimonial.trim(),
      achievement: achievement || '',
      avatar_color: avatar_color || 'bg-cimsme-blue',
      logo: req.file ? `/uploads/stories/${req.file.filename}` : null,
      is_featured: is_featured !== undefined ? Boolean(is_featured) : false, 
      is_active: is_active !== undefined ? Boolean(is_active) : true, 
      display_order: parseInt(display_order) || 0
    };
    
    const id = await Database.create('membership_stories', storyData);
    
    console.log(' Story created:', id, 'Logo:', storyData.logo || 'No logo');
    res.json({ success: true, message: 'Story created successfully', id, data: storyData });
  } catch (error) {
    console.error('  Create story error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Get public stories (frontend)
app.get('/api/membership/stories', async (req, res) => {
  try {
    const stories = await Database.getAll('membership_stories');
    
    const activeStories = stories.filter(s => s.is_active === 1 || s.is_active === true);
    
    const sortedStories = activeStories.sort((a, b) => {
      if (b.is_featured !== a.is_featured) {
        return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
      }
      return (a.display_order || 0) - (b.display_order || 0);
    });
    
    console.log(` Fetched ${sortedStories.length} active stories`);
    res.json({ success: true, data: sortedStories });
  } catch (error) {
    console.error('  Get stories error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Get all stories (admin panel)
app.get('/api/admin/membership/stories', verifyAdmin, async (req, res) => {
  try {
    const stories = await Database.getAll('membership_stories');
    const sortedStories = stories.sort((a, b) => (parseInt(a.display_order) || 0) - (parseInt(b.display_order) || 0));
    
    console.log(` Fetched ${sortedStories.length} stories (admin)`);
    res.json({ success: true, data: sortedStories });
  } catch (error) {
    console.error('  Get admin stories error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});




// UPDATE story (Admin)
app.put('/api/membership/stories/:id', verifyAdmin, storyUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, businesstype, location, testimonial, achievement, avatar_color, display_order, is_featured, is_active } = req.body;
    
    if (!name || !testimonial) {
      return res.status(400).json({ success: false, message: 'Name and testimonial required' });
    }
    
    const initials = name.trim().split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    
    const updateData = {
      name: name.trim(),
      initials,
      business_type: businesstype || 'Business', 
      location: location || 'India',
      testimonial: testimonial.trim(),
      achievement: achievement || '',
      avatar_color: avatar_color || 'bg-cimsme-blue',
      is_featured: is_featured !== undefined ? Boolean(is_featured) : false,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      display_order: parseInt(display_order) || 0
    };
    
   
    if (req.file) {
      updateData.logo = `/uploads/stories/${req.file.filename}`;
    }
    
    const success = await Database.update('membership_stories', id, updateData);
    
    if (success) {
      console.log(' Story updated:', id);
      res.json({ success: true, message: 'Story updated successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Story not found' });
    }
  } catch (error) {
    console.error('  Update story error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// Delete story (Admin)
app.delete('/api/membership/stories/:id', verifyAdmin, async (req, res) => {
  try {
    const success = await Database.delete('membership_stories', req.params.id);
    
    if (success) {
      console.log(' Story deleted:', req.params.id);
      res.json({ success: true, message: 'Story deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Story not found' });
    }
  } catch (error) {
    console.error('  Delete story error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all applications
app.get('/api/admin/membership/applications', verifyAdmin, async (req, res) => {
  try {
    const applications = await Database.getAll('membership_applications');
    
    // Sort by application date (newest first)
    const sorted = applications.sort((a, b) => {
      const dateA = new Date(a.applicationDate || a.applicationdate || a.created_at || 0);
      const dateB = new Date(b.applicationDate || b.applicationdate || b.created_at || 0);
      return dateB - dateA;
    });
    
    console.log(` Fetched ${sorted.length} membership applications`);
    res.json({ success: true, data: sorted });
  } catch (error) {
    console.error('  Get applications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single application (Admin)
app.get('/api/admin/membership/applications/:id', verifyAdmin, async (req, res) => {
  try {
    const application = await Database.getById('membership_applications', req.params.id);
    
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    
    res.json({ success: true, data: application });
  } catch (error) {
    console.error('  Get application error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.put('/api/admin/membership/applications/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be: pending, approved, or rejected' 
      });
    }
    
    const application = await Database.getById('membership_applications', req.params.id);
    
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];      
    const timeStr = now.toTimeString().split(' ')[0];    
    const dateTimeStr = `${dateStr} ${timeStr}`;        

    const updateData = {
      status,
      updated_at: dateTimeStr
    };
    
    if (status === 'approved') {
      updateData.approvedDate = dateTimeStr;
      updateData.approveddate = dateTimeStr;
      
      if (!application.password) {
        const tempPassword = application.memberId || application.memberid || 'Welcome@123';
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        updateData.password = hashedPassword;
        
        if (isDevelopment) {
          console.log(`Generated password for ${application.email}: ${tempPassword}`);
          console.log(`Member can login with:`);
          console.log(`Email: ${application.email}`);
          console.log(`Password: ${tempPassword}`);
        } else {
          console.log(` Generated password for application ${application.memberid || application.memberId}`);
        }
      }
    } else if (status === 'rejected') {
      updateData.rejectedDate = dateTimeStr;
      updateData.rejecteddate = dateTimeStr;
    }
    
    const success = await Database.update('membership_applications', req.params.id, updateData);
    
    if (success) {
      console.log(` Application ${req.params.id} status updated to: ${status}`);
      
      const responseMessage = status === 'approved' && !application.password
        ? `Application approved! Temporary password: ${application.memberId || application.memberid || 'Welcome@123'}`
        : `Application ${status} successfully`;
      
      return res.json({ 
        success: true, 
        message: responseMessage,
        tempPassword: status === 'approved' && !application.password 
          ? (application.memberId || application.memberid || 'Welcome@123') 
          : undefined
      });
    } else {
      return res.status(404).json({ success: false, message: 'Failed to update application' });
    }
  } catch (error) {
    console.error('  Update status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});



app.post('/api/admin/membership/applications/:id/reset-password', verifyAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0];
      const dateTimeStr = `${dateStr} ${timeStr}`;

      const success = await Database.update('membership_applications', req.params.id, {
        password: hashedPassword,
        updated_at: dateTimeStr
      });

    
    if (success) {
      console.log(` Password reset for application ${req.params.id}`);
      res.json({ 
        success: true, 
        message: 'Password reset successfully',
        password: password 
      });
    } else {
      res.status(404).json({ success: false, message: 'Application not found' });
    }
  } catch (error) {
    console.error('  Reset password error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// MEMBER LOGIN ROUTE 

app.post('/api/members/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    console.log('  Member login attempt:', identifier);
    
    // Validate input
    if (!identifier || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }
    
    const applications = await Database.getAll('membership_applications');
    
    const member = applications.find(app => {
      const appEmail = (app.email || '').toLowerCase().trim();
      const inputEmail = identifier.toLowerCase().trim();
      return appEmail === inputEmail && app.status === 'approved';
    });
    
    if (!member) {
      if (isDevelopment) {
        console.log('   Member not found or not approved:', identifier);
      } else {
        console.log('   Failed member login attempt');
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials or membership not approved yet' 
      });
    }
    
    const storedPassword = member.password || member.passwordhash || member.passwordHash;
    
    if (!storedPassword) {
      if (isDevelopment) {
        console.log('   No password found for member:', identifier);
      } else {
        console.log('   Account setup incomplete for member');
      }
      return res.status(401).json({ 
        success: false, 
        message: 'Account setup incomplete. Please contact admin.' 
      });
    }
    
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, storedPassword);
      
      if (!isPasswordValid) {
        if (isDevelopment) {
          console.log('   Invalid password for:', identifier);
        } else {
          console.log('   Invalid password attempt');
        }
      }
    } catch (error) {
      console.error('   Password verification error:', error.message);
      if (isDevelopment) {
        console.error('Error details:', error);
      }
      return res.status(500).json({ 
        success: false, 
        message: 'Authentication error' 
      });
    }
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    //  Update last login time
    try {
      await Database.update('membership_applications', member.id, {
        lastLogin: new Date().toISOString(),
        lastlogin: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to update last login:', error.message);
    }
    
    const membershipFee = member.membershipFee || member.membershipfee || 5000;
    const getMembershipTypeLabel = (m) => {
      const stored = (m.membershiptype || '').toString().trim().toLowerCase();
      if (stored === 'annual') return 'Annual Membership';
      if (stored === 'startup') return 'Startup Membership';
      if (stored === 'lifetime') return 'Lifetime Membership';
      if (stored === 'patron') return 'Patron Membership';
      const fee = parseFloat(m.finalamount || m.membershipfee || 0);
      if (fee >= 500000) return 'Patron Membership';
      if (fee >= 250000) return 'Lifetime Membership';
      if (fee >= 25000 && fee < 100000) return 'Startup Membership';
      return 'Annual Membership';
    };
    const getJoinDate = (m) => m.payment_date || m.applicationdate || m.created_at;
    const getRenewalDate = (m) => {
      const type = (m.membershiptype || '').toString().trim().toLowerCase();
      const fee = parseFloat(m.finalamount || m.membershipfee || 0);
      if (type === 'lifetime' || type === 'patron' || fee >= 250000) return null;
      const join = new Date(getJoinDate(m));
      if (isNaN(join.getTime())) return null;
      const renewal = new Date(join);
      renewal.setFullYear(renewal.getFullYear() + 1);
      return renewal.toISOString().split('T')[0];
    };
    const formatDateForDisplay = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const joindate = getJoinDate(member);
    const renewalDateRaw = getRenewalDate(member);

    const memberData = {
      id: member.id,
      memberId: member.memberId || member.memberid,
      memberid: member.memberId || member.memberid,
      fullName: member.fullName || member.fullname,
      fullname: member.fullName || member.fullname,
      businessName: member.businessName || member.businessname,
      businessname: member.businessName || member.businessname,
      email: member.email,
      phone: member.phone,
      businessType: member.businessType || member.businesstype,
      businesstype: member.businessType || member.businesstype,
      businessCategory: member.businessCategory || member.businesscategory,
      state: member.state,
      businessAddress: member.businessAddress || member.businessaddress,
      businessaddress: member.businessAddress || member.businessaddress,
      membershipType: getMembershipTypeLabel(member),
      membershiptype: getMembershipTypeLabel(member),
      status: member.status,
      membershipFee: membershipFee,
      membershipfee: membershipFee,
      applicationDate: member.applicationDate || member.applicationdate,
      applicationdate: member.applicationDate || member.applicationdate,
      joindate: joindate,
      memberSince: formatDateForDisplay(joindate),
      renewaldate: renewalDateRaw ? formatDateForDisplay(renewalDateRaw) : 'Lifetime',
      approvedDate: member.approvedDate || member.approveddate,
      lastLogin: new Date().toISOString()
    };
    
    //  GENERATE JWT TOKEN 
    if (isDevelopment) {
      console.log('🔐 Generating JWT token for:', memberData.memberId);
    }
    const token = generateMemberToken({
      id: member.id,
      memberid: member.memberId || member.memberid,
      email: member.email
    });
    
    if (isDevelopment) {
      console.log('   Token generated successfully');
    }
    console.log(' Member login successful:', memberData.memberId);
    
    res.json({
      success: true,
      data: { 
        token: token,  
        member: memberData 
      },
      message: 'Login successful'
    });
    
  } catch (error) {
    console.error('  Member login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed. Please try again.' 
    });
  }
});



// MEMBER DASHBOARD ROUTE


app.get('/api/members/dashboard', verifyMemberToken, async (req, res) => {
  try {
    if (isDevelopment) {
      console.log('📊 Dashboard request for:', req.member.email);
    }
    
    res.json({
      success: true,
      message: 'Dashboard data loaded',
      data: {
        member: req.member
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// MEMBER DASHBOARD WITH ID ROUTE

app.get('/api/members/dashboard/:memberId', verifyMemberToken, async (req, res) => {
  try {
    const { memberId } = req.params;
    
    if (req.member.memberid !== memberId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - Cannot access other member dashboards'
      });
    }
    
    const applications = await Database.getAll('membership_applications');
    const member = applications.find(app => app.memberid === memberId);
    
    if (!member) {
      return res.status(404).json({ 
        success: false, 
        message: 'Member not found' 
      });
    }
    
 
    const allRegistrations = await Database.getAllEventRegistrations();
    const memberRegistrations = allRegistrations.filter(reg => 
      reg.email.toLowerCase() === member.email.toLowerCase()
    );
    
    
    const allEvents = await Database.getAll('events');
    
    // Upcoming events
    const upcomingEvents = allEvents.filter(e => 
      new Date(e.event_date || e.date) >= new Date() && e.is_active
    );
    
    res.json({
      success: true,
      data: {
        member: {
          memberid: member.memberid,
          fullname: member.fullName || member.fullname,
          businessname: member.businessName || member.businessname,
          email: member.email,
          membershiptype: member.membershipFee >= 50000 ? 'Platinum' :
                          member.membershipFee >= 25000 ? 'Premium' : 
                          member.membershipFee >= 15000 ? 'Gold' : 'Silver'
        },
        registeredEvents: memberRegistrations.length,
        upcomingEvents: upcomingEvents.slice(0, 5),
        stats: {
          eventsRegistered: memberRegistrations.length,
          certificatesEarned: 0,
          networkingConnections: 0
        }
      }
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

const CERT_TEMPLATE_DIR = path.join(__dirname, 'public', 'certificate');
const CERT_TEXT_CONFIG = {  
  memberName:  { xPercent: 50, yPercent: 38.2, fontSizePercent: 3.4, fill: '#004aad', fontWeight: '600', textAnchor: 'middle', baseline: 'alphabetic' },   
  period:      { xPercent: 56, yPercent: 58.5, fontSizePercent: 3.4, fill: '#1a1a1a', fontWeight: 'bold', textAnchor: 'middle', baseline: 'alphabetic' },
  date:        { xPercent: 18.5, yPercent: 77.8, fontSizePercent: 2.8, fill: '#1a1a1a', fontWeight: 'regular', textAnchor: 'middle', baseline: 'alphabetic' },
  membershipNo: { xPercent: 21, yPercent: 82.3, fontSizePercent: 3, fill: '#1a1a1a', fontWeight: 'regular', textAnchor: 'start', baseline: 'alphabetic' }
};

app.get('/api/members/certificate/download', verifyMemberToken, async (req, res) => {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Certificate: sharp not installed. Run: npm install sharp');
    return res.status(503).json({ success: false, message: 'Certificate service unavailable. Please contact support.' });
  }
  try {
    const applications = await Database.getAll('membership_applications');
    const member = applications.find(app => (app.memberid || app.memberId) === (req.member.memberid || req.member.memberId));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    const getJoinDate = (m) => m.payment_date || m.applicationdate || m.applicationDate || m.created_at;
    const getRenewalDate = (m) => {
      const type = (m.membershiptype || m.membershipType || '').toString().trim().toLowerCase();
      if (type === 'lifetime' || type === 'patron') return null;
      if (type === 'annual' || type === 'startup') {
        const join = new Date(getJoinDate(m));
        if (isNaN(join.getTime())) return null;
        const renewal = new Date(join);
        renewal.setFullYear(renewal.getFullYear() + 1);
        return renewal.toISOString().split('T')[0];
      }
      const join = new Date(getJoinDate(m));
      if (isNaN(join.getTime())) return null;
      const renewal = new Date(join);
      renewal.setFullYear(renewal.getFullYear() + 1);
      return renewal.toISOString().split('T')[0];
    };
 
    const formatDateMonthDayYear = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      if (isNaN(date.getTime())) return 'N/A';
      const month = date.toLocaleDateString('en-IN', { month: 'long' });
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    };
 
    const formatMonthYear = (d) => {
      if (!d) return 'N/A';
      const date = new Date(d);
      return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };
    const joindate = getJoinDate(member);
    const renewalDateRaw = getRenewalDate(member);
    const issueDateStr = formatDateMonthDayYear(joindate);
    const issueMonthYearStr = formatMonthYear(joindate);
    const validUntilMonthYearStr = renewalDateRaw ? formatMonthYear(renewalDateRaw) : 'Lifetime';
    const periodDisplayStr = validUntilMonthYearStr === 'Lifetime' ? `${issueMonthYearStr} To Lifetime` : `${issueMonthYearStr} To ${validUntilMonthYearStr}`;
    const memberName = (member.fullname || member.fullName || member.businessname || member.businessName || 'Member').toString().trim().toUpperCase();
    const memberId = (member.memberid || member.memberId || 'N/A').toString();

    const imageExts = ['.png', '.jpg', '.jpeg'];
    const isImage = (f) => imageExts.some(ext => f.toLowerCase().endsWith(ext));
    let templatePath = null;
    if (fs.existsSync(CERT_TEMPLATE_DIR)) {
      const files = fs.readdirSync(CERT_TEMPLATE_DIR);
      const img = files.find(f => isImage(f));
      if (img) templatePath = path.join(CERT_TEMPLATE_DIR, img);
    }
    if (!templatePath && fs.existsSync(path.join(__dirname, 'public', 'assets'))) {
      const files = fs.readdirSync(path.join(__dirname, 'public', 'assets'));
      const img = files.find(f => isImage(f) && (f.toLowerCase().includes('certificate') || f.toLowerCase().includes('template')));
      if (img) templatePath = path.join(__dirname, 'public', 'assets', img);
    }
    if (!templatePath) {
      const fallbacks = ['template.pmg.png', 'template.png', 'template.jpg', 'certificate.png', 'certificate.jpg'];
      templatePath = fallbacks.map(f => path.join(CERT_TEMPLATE_DIR, f)).find(p => fs.existsSync(p)) || null;
    }
    if (!templatePath) {
      console.error('Certificate template not found. No image file (.png/.jpg) in', CERT_TEMPLATE_DIR);
      return res.status(404).json({ success: false, message: 'Certificate template not found. Add any image (e.g. template.png or template.pmg.png) in public/certificate/ folder.' });
    }
    const image = sharp(templatePath);
    const meta = await image.metadata();
    const width = meta.width || 1200;
    const height = meta.height || 800;
    const px = (p) => (p / 100) * width;
    const py = (p) => (p / 100) * height;
    const fontSz = (p) => Math.max(10, Math.round((p / 100) * height));
    const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const anchor = (c) => (c.textAnchor === 'start' ? 'start' : c.textAnchor === 'end' ? 'end' : 'middle');
    const baseline = (c) => (c.baseline === 'alphabetic' ? 'alphabetic' : 'middle');
    const svg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${px(CERT_TEXT_CONFIG.memberName.xPercent)}" y="${py(CERT_TEXT_CONFIG.memberName.yPercent)}" text-anchor="${anchor(CERT_TEXT_CONFIG.memberName)}" dominant-baseline="${baseline(CERT_TEXT_CONFIG.memberName)}" fill="${CERT_TEXT_CONFIG.memberName.fill}" font-size="${fontSz(CERT_TEXT_CONFIG.memberName.fontSizePercent)}" font-family="Arial, sans-serif" font-weight="${CERT_TEXT_CONFIG.memberName.fontWeight}">${escapeXml(memberName)}</text>
        <text x="${px(CERT_TEXT_CONFIG.period.xPercent)}" y="${py(CERT_TEXT_CONFIG.period.yPercent)}" text-anchor="${anchor(CERT_TEXT_CONFIG.period)}" dominant-baseline="${baseline(CERT_TEXT_CONFIG.period)}" fill="${CERT_TEXT_CONFIG.period.fill}" font-size="${fontSz(CERT_TEXT_CONFIG.period.fontSizePercent)}" font-family="Arial, sans-serif" font-weight="${CERT_TEXT_CONFIG.period.fontWeight}">${escapeXml(periodDisplayStr)}</text>
        <text x="${px(CERT_TEXT_CONFIG.date.xPercent)}" y="${py(CERT_TEXT_CONFIG.date.yPercent)}" text-anchor="${anchor(CERT_TEXT_CONFIG.date)}" dominant-baseline="${baseline(CERT_TEXT_CONFIG.date)}" fill="${CERT_TEXT_CONFIG.date.fill}" font-size="${fontSz(CERT_TEXT_CONFIG.date.fontSizePercent)}" font-family="Arial, sans-serif" font-weight="${CERT_TEXT_CONFIG.date.fontWeight}">${escapeXml(issueDateStr)}</text>
        <text x="${px(CERT_TEXT_CONFIG.membershipNo.xPercent)}" y="${py(CERT_TEXT_CONFIG.membershipNo.yPercent)}" text-anchor="${anchor(CERT_TEXT_CONFIG.membershipNo)}" dominant-baseline="${baseline(CERT_TEXT_CONFIG.membershipNo)}" fill="${CERT_TEXT_CONFIG.membershipNo.fill}" font-size="${fontSz(CERT_TEXT_CONFIG.membershipNo.fontSizePercent)}" font-family="Arial, sans-serif" font-weight="${CERT_TEXT_CONFIG.membershipNo.fontWeight}">${escapeXml(memberId)}</text>
      </svg>
    `);
    const pngBuffer = await image.composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
    const { PDFDocument } = require('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([width, height]);
    const pngImage = await pdfDoc.embedPng(pngBuffer);
    page.drawImage(pngImage, { x: 0, y: 0, width, height });
    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CIMSME_Membership_Certificate_${memberId}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Certificate generation error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate certificate' });
  }
});


// MEMBER LOGOUT 


app.post('/api/members/logout', verifyMemberToken, async (req, res) => {
  try {
    const token = req.token;
    await blacklistToken(token);
    if (isDevelopment) {
      console.log('👋 Member logged out:', req.member.email);
    } else {
      console.log('👋 Member logged out');
    }
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
    });
  }
});



// DASHBOARD STATS


app.get('/api/admin/dashboard/stats', verifyAdmin, async (req, res) => {
  try {
    const stats = await Database.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});




app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, message: err.message });
});




// DATABASE HEALTH CHECK
async function checkDatabaseHealth() {
    try {
        const applications = await Database.getAll('membership_applications');  
        const events = await Database.getAll('events');
        const advisors = await Database.getAll('advisors');
        const coupons = await Database.getAll('coupons');


    
    console.log(' Database Health Check:');
    console.log(`   - ${applications.length} membership applications`);
    console.log(`   - ${events.length} events`);
    console.log(`   - ${advisors.length} advisors`);
    console.log(`   - ${coupons.length} coupons`); 
    
    return true;
  } catch (error) {
    console.error('  Database Health Check FAILED:', error.message);
    return false;
  }
}




module.exports = app;
