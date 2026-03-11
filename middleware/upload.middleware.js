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

module.exports = {
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
