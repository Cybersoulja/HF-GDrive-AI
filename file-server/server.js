const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const drive = require('./drive');

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_DRIVE = fs.existsSync(path.join(__dirname, 'credentials.json'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), driveEnabled: ENABLE_DRIVE });
});

// List files in directory
app.get('/api/files/:dir?', (req, res) => {
  try {
    const dir = req.params.dir || '';
    const fullPath = path.join(__dirname, 'public', dir);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    const files = fs.readdirSync(fullPath).map(file => {
      const filePath = path.join(fullPath, file);
      const stat = fs.statSync(filePath);
      return {
        name: file,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime
      };
    });
    
    res.json({ path: dir || '/', files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file (with optional Drive sync)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const response = {
    message: 'File uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    driveId: null
  };

  // Sync to Google Drive if enabled
  if (ENABLE_DRIVE && req.body.syncToDrive === 'true') {
    try {
      const driveFile = await drive.uploadFileToDrive(req.file.path, req.file.originalname);
      response.driveId = driveFile.id;
      response.driveLink = driveFile.webViewLink;
    } catch (error) {
      console.error('Drive sync failed:', error);
      response.driveSyncError = error.message;
    }
  }

  res.json(response);
});

// List Google Drive files
app.get('/api/drive/files', async (req, res) => {
  if (!ENABLE_DRIVE) {
    return res.status(400).json({ error: 'Google Drive not enabled' });
  }

  try {
    const files = await drive.listDriveFiles();
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download from Google Drive
app.post('/api/drive/download/:fileId', async (req, res) => {
  if (!ENABLE_DRIVE) {
    return res.status(400).json({ error: 'Google Drive not enabled' });
  }

  try {
    const fileName = req.body.fileName || 'download';
    const destPath = path.join(__dirname, 'public', 'uploads', fileName);
    
    await drive.downloadFromDrive(req.params.fileId, destPath);
    
    res.json({ 
      message: 'Downloaded from Drive',
      localPath: `/uploads/${path.basename(destPath)}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete file
app.delete('/api/files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 File server running at http://0.0.0.0:${PORT}`);
  if (ENABLE_DRIVE) {
    console.log('☁️  Google Drive sync enabled');
  }
});
