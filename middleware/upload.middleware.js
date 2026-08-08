const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp'); 

let fileType;
try {
  fileType = require('file-type');
  console.log('✓ Magic number validation enabled (file-type v16.5.4)');
} catch (error) {
  console.error('   CRITICAL: file-type module not installed');
  console.error('Run: npm install file-type@16.5.4');
  process.exit(1);
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 10;

function sanitizeFilename(filename) {
  const basename = path.basename(filename);
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_');
}


async function validateFileMagicNumbers(filePath) {
  try {
    const type = await fileType.fromFile(filePath);
    
    if (!type) {
      console.warn('✗ Could not detect file type:', filePath);
      return false;
    }
    
    const isValid = ALLOWED_MIMES.includes(type.mime);
    
    if (!isValid) {
      console.warn(`✗ Invalid file type detected: ${type.mime}`);
    }
    
    return isValid;
    
  } catch (error) {
    console.error('✗ Magic number validation error:', error);
    return false;
  }
}

async function sanitizeImage(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const outputPath = `${filePath}.sanitized`;
    
    
    if (['.jpg', '.jpeg'].includes(ext)) {
      await sharp(filePath)
        .rotate() 
        .jpeg({ quality: 90, mozjpeg: true })
        .withMetadata() 
        .toFile(outputPath);
    } else if (ext === '.png') {
      await sharp(filePath)
        .png({ compressionLevel: 9 })
        .withMetadata() 
        .toFile(outputPath);
    } else if (ext === '.webp') {
      await sharp(filePath)
        .webp({ quality: 90 })
        .withMetadata() 
        .toFile(outputPath);
    } else if (ext === '.gif') {
      await sharp(filePath, { animated: true })
        .gif()
        .toFile(outputPath);
    }
    
    
    fs.unlinkSync(filePath);
    fs.renameSync(outputPath, filePath);
    
    console.log(`✓ Sanitized image: ${path.basename(filePath)}`);
    return true;
  } catch (error) {
    console.error('✗ Image sanitization failed:', error);
    return false;
  }
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✓ Deleted invalid file: ${path.basename(filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('✗ Error deleting file:', error);
    return false;
  }
}

function createUploadMiddleware(folder, fieldName = 'image', maxSizeMB = MAX_FILE_SIZE_MB) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '..', 'public', 'uploads', folder);
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
        console.log(`✓ Created upload directory: ${folder}`);
      }
      
      cb(null, uploadDir);
    },
    
    filename: function (req, file, cb) {
      try {
        const randomName = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new Error(`Invalid file extension: ${ext}`));
        }
        
        const timestamp = Date.now();
        const secureFilename = `${folder}-${timestamp}-${randomName}${ext}`;
        
        cb(null, secureFilename);
      } catch (error) {
        cb(error);
      }
    }
  });

  const upload = multer({
    storage: storage,
    limits: { 
      fileSize: maxSizeMB * 1024 * 1024, 
      files: 1 
    },
    
    fileFilter: function (req, file, cb) {
      try {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          return cb(new Error(`Invalid file type: ${file.mimetype}. Only images allowed.`), false);
        }
        
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new Error(`Invalid file extension: ${ext}`), false);
        }
        
        if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
          return cb(new Error('Invalid filename - path traversal detected'), false);
        }
        
        file.originalname = sanitizeFilename(file.originalname);
        
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    }
  });

  return async (req, res, next) => {
    upload.single(fieldName)(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File too large. Maximum size is ${maxSizeMB}MB.`
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Unexpected file field. Expected: "${fieldName}"`
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }
      
      if (req.file) {
  
        const isValid = await validateFileMagicNumbers(req.file.path);
        
        if (!isValid) {
          deleteFile(req.file.path);
          return res.status(400).json({
            success: false,
            message: 'Invalid file format. File appears to be corrupted or not a valid image.'
          });
        }
     
        const isSanitized = await sanitizeImage(req.file.path);
        
        if (!isSanitized) {
          deleteFile(req.file.path);
          return res.status(400).json({
            success: false,
            message: 'Image processing failed. Please try a different image.'
          });
        }
        
        console.log(`✓ File uploaded: ${req.file.filename}`);
      }
      
      next();
    });
  };
}

const PDF_ALLOWED_EXTENSIONS = ['.pdf'];
const PDF_ALLOWED_MIMES = ['application/pdf'];
const MAX_PDF_SIZE_MB = parseInt(process.env.MAX_PDF_SIZE_MB, 10) || 25;

async function validatePdfMagicAndMime(filePath) {
  try {
    const type = await fileType.fromFile(filePath);
    if (!type || type.mime !== 'application/pdf') {
      console.warn('✗ PDF validation failed (mime):', type && type.mime);
      return false;
    }
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(5);
      fs.readSync(fd, buf, 0, 5, 0);
      const sig = buf.toString('latin1');
      if (!sig.startsWith('%PDF')) {
        console.warn('✗ PDF magic bytes invalid');
        return false;
      }
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (error) {
    console.error('✗ PDF validation error:', error);
    return false;
  }
}


function createPdfUploadMiddleware(folder = 'pdfs', fieldName = 'pdf', maxSizeMB = MAX_PDF_SIZE_MB) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '..', 'public', 'uploads', folder);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
        console.log(`✓ Created upload directory: uploads/${folder}`);
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      try {
        const randomName = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ext !== '.pdf') {
          return cb(new Error('Only .pdf files are allowed'));
        }
        const timestamp = Date.now();
        const secureFilename = `${folder}-${timestamp}-${randomName}${ext}`;
        cb(null, secureFilename);
      } catch (error) {
        cb(error);
      }
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024, files: 1 },
    fileFilter: function (req, file, cb) {
      try {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const mimeOk =
          PDF_ALLOWED_MIMES.includes(file.mimetype) ||
          (file.mimetype === 'application/octet-stream' && ext === '.pdf');
        if (!mimeOk) {
          return cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF is allowed.`), false);
        }
        if (!PDF_ALLOWED_EXTENSIONS.includes(ext)) {
          return cb(new Error('Only .pdf files are allowed'), false);
        }
        if (
          (file.originalname && (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')))
        ) {
          return cb(new Error('Invalid filename'), false);
        }
        if (file.originalname) {
          file.originalname = sanitizeFilename(file.originalname);
        }
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    }
  });

  return async (req, res, next) => {
    upload.single(fieldName)(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File too large. Maximum PDF size is ${maxSizeMB}MB.`
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Unexpected file field. Expected: "${fieldName}"`
          });
        }
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
      }
      if (req.file) {
        const ok = await validatePdfMagicAndMime(req.file.path);
        if (!ok) {
          deleteFile(req.file.path);
          return res.status(400).json({
            success: false,
            message: 'Invalid PDF file. Please upload a valid PDF document.'
          });
        }
        console.log(`✓ PDF uploaded: ${req.file.filename}`);
      }
      next();
    });
  };
}

const LOAN_HELPDESK_DOC_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];
const LOAN_HELPDESK_DOC_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

async function validateLoanHelpdeskDocument(filePath, ext) {
  if (ext === '.pdf') {
    return validatePdfMagicAndMime(filePath);
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return validateFileMagicNumbers(filePath);
  }
  if (['.doc', '.docx'].includes(ext)) {
    try {
      const type = await fileType.fromFile(filePath);
      if (type && LOAN_HELPDESK_DOC_MIMES.includes(type.mime)) {
        return true;
      }
      return ext === '.doc' || ext === '.docx';
    } catch (error) {
      return false;
    }
  }
  return false;
}

function createLoanHelpdeskDocumentsUpload(maxSizeMB = 5, maxFiles = 20) {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'loan-helpdesk', '_staging');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      try {
        const randomName = crypto.randomBytes(12).toString('hex');
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!LOAN_HELPDESK_DOC_EXTENSIONS.includes(ext)) {
          return cb(new Error(`Invalid file extension: ${ext}`));
        }
        cb(null, `staging-${Date.now()}-${randomName}${ext}`);
      } catch (error) {
        cb(error);
      }
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: maxSizeMB * 1024 * 1024,
      files: maxFiles
    },
    fileFilter: function (req, file, cb) {
      try {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!LOAN_HELPDESK_DOC_EXTENSIONS.includes(ext)) {
          return cb(new Error(`Invalid file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX.`), false);
        }
        if (
          file.originalname &&
          (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\'))
        ) {
          return cb(new Error('Invalid filename'), false);
        }
        file.originalname = sanitizeFilename(file.originalname);
        cb(null, true);
      } catch (error) {
        cb(error, false);
      }
    }
  });

  return async (req, res, next) => {
    upload.array('documents', maxFiles)(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `Each document must be ${maxSizeMB} MB or smaller.`
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: `You can upload up to ${maxFiles} documents only.`
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      }
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }

      const uploaded = Array.isArray(req.files) ? req.files : [];
      for (const file of uploaded) {
        const ext = path.extname(file.originalname || file.filename || '').toLowerCase();
        const ok = await validateLoanHelpdeskDocument(file.path, ext);
        if (!ok) {
          uploaded.forEach((item) => deleteFile(item.path));
          return res.status(400).json({
            success: false,
            message: `Invalid or corrupted file: ${file.originalname || 'document'}`
          });
        }
      }

      next();
    });
  };
}

module.exports = {
  loanHelpdeskDocumentsUpload: createLoanHelpdeskDocumentsUpload(5, 20),
  drivePdfUpload: createPdfUploadMiddleware('pdfs', 'pdf', MAX_PDF_SIZE_MB),
  heroUpload: createUploadMiddleware('hero', 'image', 5),
  eventUpload: createUploadMiddleware('events', 'image', 10),
  eventPhotosUpload: createUploadMiddleware('photos', 'photo', 10),
  advisorUpload: createUploadMiddleware('advisors', 'photo', 5),
  speakerUpload: createUploadMiddleware('speakers', 'photo', 5),
  memberUpload: createUploadMiddleware('members', 'photo', 5),
  storyUpload: createUploadMiddleware('stories', 'logo', 5),
  newsUpload: createUploadMiddleware('news', 'photo', 5),
  testimonialsUpload: createUploadMiddleware('testimonials', 'photo', 5),
  committeeUpload: createUploadMiddleware('committees', 'photo', 5),
  committeeLeaderUpload: createUploadMiddleware('committee-leaders', 'photo', 5),
  chapterUpload: createUploadMiddleware('chapters', 'photo', 5),
  chapterLeaderUpload: createUploadMiddleware('chapter-leaders', 'photo', 5)
};
