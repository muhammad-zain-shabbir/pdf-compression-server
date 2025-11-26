const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const app = express();

// Allow requests from any origin for testing
app.use(cors({
    origin: '*',
    credentials: true
}));

app.use(express.json());

// Setup file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check if file is a PDF
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Create uploads folder if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Promisify exec for better async handling
const execAsync = util.promisify(exec);

// PDF Compression endpoint
app.post('/compress-pdf', upload.single('pdfFile'), async (req, res) => {
    let inputPath = null;
    let outputPath = null;

    try {
        console.log('📥 Received PDF compression request');
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        inputPath = req.file.path;
        const originalName = req.file.originalname;
        const compressedName = `compressed_${path.parse(originalName).name}.pdf`;
        outputPath = path.join('uploads', `compressed_${Date.now()}.pdf`);

        console.log(`📄 Processing: ${originalName} (${req.file.size} bytes)`);
        console.log(`🔧 Input: ${inputPath}, Output: ${outputPath}`);

        // Ghostscript compression command
        // Using /ebook for medium quality, good compression
        const gsCommand = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

        console.log(`⚡ Running Ghostscript command: ${gsCommand}`);

        // Execute Ghostscript compression
        const { stdout, stderr } = await execAsync(gsCommand);
        
        if (stderr) {
            console.warn('Ghostscript warnings:', stderr);
        }

        // Check if output file was created
        if (!fs.existsSync(outputPath)) {
            throw new Error('Ghostscript failed to create compressed file');
        }

        const stats = fs.statSync(outputPath);
        console.log(`✅ Compression complete: ${req.file.size} bytes → ${stats.size} bytes`);
        console.log(`📊 Compression ratio: ${((1 - stats.size / req.file.size) * 100).toFixed(2)}%`);

        // Send the compressed file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${compressedName}"`);
        res.setHeader('X-Original-Size', req.file.size);
        res.setHeader('X-Compressed-Size', stats.size);
        res.setHeader('X-Compression-Ratio', ((1 - stats.size / req.file.size) * 100).toFixed(2));
        
        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        
        // Clean up after sending
        fileStream.on('end', () => {
            cleanupFiles(inputPath, outputPath);
            console.log('✅ File sent and cleaned up');
        });

        fileStream.on('error', (error) => {
            console.error('Stream error:', error);
            cleanupFiles(inputPath, outputPath);
            res.status(500).json({ error: 'File streaming failed' });
        });

    } catch (error) {
        console.error('❌ Compression error:', error);
        cleanupFiles(inputPath, outputPath);
        
        if (error.code === 'ENOENT') {
            res.status(500).json({ error: 'Ghostscript not found. Please ensure it is installed on the server.' });
        } else if (error.stderr && error.stderr.includes('Error')) {
            res.status(500).json({ error: 'Ghostscript processing failed: ' + error.stderr });
        } else {
            res.status(500).json({ error: 'Compression failed: ' + error.message });
        }
    }
});

// Helper function to clean up temporary files
function cleanupFiles(inputPath, outputPath) {
    try {
        if (inputPath && fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
        }
        if (outputPath && fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
    } catch (error) {
        console.error('Error cleaning up files:', error);
    }
}

// Alternative compression endpoint with quality option
app.post('/compress-pdf-advanced', upload.single('pdfFile'), async (req, res) => {
    try {
        const { quality = 'medium' } = req.body; // low, medium, high
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const qualitySettings = {
            low: '/screen',    // Low quality, high compression
            medium: '/ebook',  // Medium quality, good compression
            high: '/printer'   // High quality, less compression
        };

        const pdfSettings = qualitySettings[quality] || '/ebook';

        const inputPath = req.file.path;
        const originalName = req.file.originalname;
        const compressedName = `compressed_${path.parse(originalName).name}.pdf`;
        const outputPath = path.join('uploads', `compressed_${Date.now()}.pdf`);

        console.log(`🔧 Using quality setting: ${quality} (${pdfSettings})`);

        const gsCommand = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${pdfSettings} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

        await execAsync(gsCommand);

        if (!fs.existsSync(outputPath)) {
            throw new Error('Compression failed');
        }

        const stats = fs.statSync(outputPath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${compressedName}"`);
        
        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            cleanupFiles(inputPath, outputPath);
        });

    } catch (error) {
        console.error('Advanced compression error:', error);
        res.status(500).json({ error: 'Compression failed: ' + error.message });
    }
});

// Health check - test if server is working
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 PDF Compression Server is running!',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        features: ['Ghostscript PDF Compression', 'CORS Enabled', 'File Upload']
    });
});

// Test endpoint with Ghostscript check
app.get('/test', async (req, res) => {
    try {
        // Test if Ghostscript is available
        const { stdout } = await execAsync('gs --version');
        const gsVersion = stdout.trim();
        
        res.json({ 
            success: true,
            message: 'Server is working perfectly!',
            server: 'Node.js PDF Compression',
            ghostscript: {
                available: true,
                version: gsVersion
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ 
            success: false,
            message: 'Server is running but Ghostscript is not available',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🎉 Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/`);
    console.log(`🔧 Ghostscript compression enabled`);
    console.log(`🔄 Ready for real PDF compression!`);
});
