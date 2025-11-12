const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.pdf';
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanupFile(filePath) {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Cleanup error:', err);
            });
        }
    }, 300000); // Clean up after 5 minutes
}

// Enhanced Ghostscript compression with multiple levels
function compressWithGhostscript(inputPath, outputPath, compressionLevel = 'high') {
    return new Promise((resolve, reject) => {
        const settings = {
            'low': '/printer',      // Light compression
            'medium': '/prepress',  // Medium compression  
            'high': '/ebook',       // High compression (default)
            'extreme': '/screen'    // Maximum compression
        };

        const command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${settings[compressionLevel]} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;
        
        console.log(`Executing: ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Ghostscript error:', error);
                reject(error);
                return;
            }
            
            // Check if output file was created and has reasonable size
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                if (stats.size > 0) {
                    resolve();
                } else {
                    reject(new Error('Output file is empty'));
                }
            } else {
                reject(new Error('Output file was not created'));
            }
        });
    });
}

// Advanced compression with multiple passes
async function advancedCompress(inputPath, outputPath) {
    const tempDir = 'temp/';
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let bestSize = fs.statSync(inputPath).size;
    let bestPath = inputPath;

    // Try different compression levels
    const levels = ['extreme', 'high', 'medium'];
    
    for (const level of levels) {
        try {
            const tempOutput = path.join(tempDir, `compressed-${level}-${Date.now()}.pdf`);
            await compressWithGhostscript(inputPath, tempOutput, level);
            
            const newSize = fs.statSync(tempOutput).size;
            console.log(`Level ${level}: ${formatFileSize(newSize)}`);
            
            // If this is better than our current best, use it
            if (newSize < bestSize && newSize > 0) {
                if (bestPath !== inputPath) {
                    // Remove previous best if it's not the original
                    fs.unlinkSync(bestPath);
                }
                bestSize = newSize;
                bestPath = tempOutput;
            } else {
                // Remove this temp file if it's not the best
                fs.unlinkSync(tempOutput);
            }
        } catch (error) {
            console.log(`Compression level ${level} failed:`, error.message);
            continue; // Try next level
        }
    }

    // If we found a better compression, copy to final output
    if (bestPath !== inputPath) {
        fs.copyFileSync(bestPath, outputPath);
        
        // Cleanup temp files
        if (fs.existsSync(bestPath)) {
            fs.unlinkSync(bestPath);
        }
        
        // Cleanup temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    } else {
        // Fallback to high compression
        await compressWithGhostscript(inputPath, outputPath, 'high');
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Enhanced compress endpoint
app.post('/compress', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        const inputPath = req.file.path;
        const originalSize = fs.statSync(inputPath).size;
        const outputFilename = 'compressed-' + req.file.filename;
        const outputPath = path.join('uploads', outputFilename);

        console.log(`Compressing: ${req.file.originalname}, Size: ${formatFileSize(originalSize)}`);

        // Ensure output directory exists
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads', { recursive: true });
        }

        // Use advanced compression
        await advancedCompress(inputPath, outputPath);

        const compressedSize = fs.statSync(outputPath).size;
        const reduction = ((originalSize - compressedSize) / originalSize) * 100;

        console.log(`Compression successful: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)} (${reduction.toFixed(1)}% reduction)`);

        res.json({
            success: true,
            originalSize: formatFileSize(originalSize),
            compressedSize: formatFileSize(compressedSize),
            reductionPercent: reduction.toFixed(1),
            downloadUrl: `/download/${outputFilename}`,
            originalName: req.file.originalname
        });

        // Schedule cleanup
        cleanupFile(inputPath);
        cleanupFile(outputPath);

    } catch (error) {
        console.error('Compression error:', error);
        
        // Cleanup on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Compression failed. Please try another file or ensure Ghostscript is installed.' 
        });
    }
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join('uploads', filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const originalName = filename.replace('compressed-', '').replace(/^\d+-(\d+-)?/, '');
    
    res.download(filePath, `compressed-${originalName}`, (err) => {
        if (err) {
            console.error('Download error:', err);
        }
        // File will be cleaned up by the scheduled cleanup
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'PDF Compression Server'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 PDF Compression Server running on port ${PORT}`);
    console.log(`📊 Access: http://localhost:${PORT}`);
    console.log(`✅ Ready to compress PDF files!`);
});

module.exports = app;
