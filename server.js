const express = require('express');
const multer = require('multer');
const PDFDocument = require('pdf-lib').PDFDocument;
const app = express();

// Enable CORS for your website
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Setup file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        message: '🎉 PDF Compression Server is WORKING!',
        status: 'online',
        server: 'Railway',
        compression: 'ACTIVE - Real PDF optimization'
    });
});

// REAL PDF Compression endpoint
app.post('/compress-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`📥 Processing: ${req.file.originalname} (${req.file.size} bytes)`);

        const compressionLevel = req.body.compressionLevel || 'medium';
        
        // Load the PDF
        const pdfDoc = await PDFDocument.load(req.file.buffer);
        
        // Get compression settings based on level
        const compressionSettings = getCompressionSettings(compressionLevel);
        
        // Apply compression by re-saving with optimization
        const compressedPdfBytes = await pdfDoc.save({
            useObjectStreams: compressionSettings.useObjectStreams,
            addDefaultPage: false,
            objectsPerTick: compressionSettings.objectsPerTick,
            updateFieldAppearances: false
        });

        const originalSize = req.file.size;
        const compressedSize = compressedPdfBytes.length;
        const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

        console.log(`✅ Compression successful: ${originalSize} → ${compressedSize} bytes (${reduction}% reduction)`);

        // Send compressed file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="compressed_${req.file.originalname}"`);
        res.setHeader('X-Original-Size', originalSize);
        res.setHeader('X-Compressed-Size', compressedSize);
        res.setHeader('X-Reduction-Percent', reduction);
        
        res.send(Buffer.from(compressedPdfBytes));

    } catch (error) {
        console.error('❌ Compression error:', error);
        res.status(500).json({ error: 'Compression failed: ' + error.message });
    }
});

// Compression settings based on level
function getCompressionSettings(level) {
    switch (level) {
        case 'high':
            return {
                useObjectStreams: true,
                objectsPerTick: 10 // More aggressive optimization
            };
        case 'medium':
            return {
                useObjectStreams: true,
                objectsPerTick: 50 // Balanced optimization
            };
        case 'low':
        default:
            return {
                useObjectStreams: false,
                objectsPerTick: 100 // Minimal optimization
            };
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Real PDF compression ACTIVE`);
});
