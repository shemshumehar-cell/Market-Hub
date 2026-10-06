const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed image formats
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unpredictable random hexadecimal filename to prevent path traversal & overwrite attacks
    const randomHex = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomHex}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error('Invalid file extension. Only JPG, PNG, and WEBP images are permitted.'), false);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Invalid MIME type. Uploaded file must be a valid image.'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2 Megabytes strict limit
  },
  fileFilter
});

module.exports = upload;
