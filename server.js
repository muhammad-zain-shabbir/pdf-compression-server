const express = require('express');
const app = express();

// Enable CORS for your website
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ 
        message: '🎉 PDF Compression Server is WORKING!',
        status: 'online',
        server: 'Railway',
        port: process.env.PORT,
        timestamp: new Date().toISOString()
    });
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Server is perfectly healthy!',
        action: 'Ready for PDF compression'
    });
});

// PDF compression endpoint
app.post('/compress-pdf', (req, res) => {
    res.json({ 
        success: true,
        message: 'PDF compression endpoint ready!',
        status: 'Add multer for file uploads'
    });
});

// Use Railway's port or default to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Health check: http://0.0.0.0:${PORT}/`);
});
