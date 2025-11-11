const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Allow requests from your website
app.use(cors({
    origin: ['https://yourwebsite.com', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json());

// Setup file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Create uploads folder if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// PDF Compression endpoint
app.post('/compress-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        console.log('📥 Received PDF compression request');
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const inputPath = req.file.path;
        const originalName = req.file.originalname;
        const compressedName = `compressed_${originalName}`;

        console.log(`📄 Processing: ${originalName} (${req.file.size} bytes)`);

        // For now, we'll return the file as-is
        // In Step 3, we'll add real compression
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${compressedName}"`);
        
        // Read and send the file
        const fileStream = fs.createReadStream(inputPath);
        fileStream.pipe(res);
        
        // Clean up after sending
        fileStream.on('end', () => {
            fs.unlinkSync(inputPath);
            console.log('✅ File sent and cleaned up');
        });

        fileStream.on('error', (error) => {
            console.error('Stream error:', error);
            fs.unlinkSync(inputPath);
            res.status(500).json({ error: 'File processing failed' });
        });

    } catch (error) {
        console.error('❌ Compression error:', error);
        res.status(500).json({ error: 'Compression failed: ' + error.message });
    }
});

// Health check - test if server is working
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 PDF Compression Server is running!',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Server is working perfectly!',
        server: 'Node.js PDF Compression'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🎉 Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/`);
    console.log(`🔄 Ready for PDF compression!`);
});